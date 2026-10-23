/**
 * Päivittäinen eräajo (GitHub Actions): hakee Hilmasta ilmoitukset, esisuodattaa ja arvioi ne AI:lla.
 * Tulos kirjoitetaan staattiseen JSONiin, jonka web näyttää GitHub Pagesissa.
 *
 *   node --experimental-strip-types scripts/build-data.ts [tulostiedosto] [päivät]
 *   oletus: data.json, 7 päivää
 *
 * Ympäristö: HILMA_API_KEY (pakollinen), AI-asetukset (ks. .env.example),
 * AI_CONCURRENCY (1–5, oletus 2), AI_MIN_INTERVAL_MS (0–60000, oletus 4000),
 * AI_MAX_ASSESSMENTS (0–1000, oletus 150), AI_TIME_BUDGET_MIN (1–40, oletus 40),
 * PREVIOUS_DATA (edellinen data.json: URL tai tiedostopolku).
 *
 * Kaikki AI-asetukset tarkistetaan ennen Hilma-hakua. AI_TIME_BUDGET_MIN on aikabudjetti, joka lasketaan skriptin
 * alusta, joten se kattaa Hilma-haun ja tiedoston kirjoituksen. Budjetin ulkopuolelle jäävät npm ci, build, testit,
 * deploy ja käynnissä olevan AI-kutsun uusintayritysten häntä. Kun budjetti täyttyy, uusia AI-kutsuja ei aloiteta,
 * käynnissä olevat valmistuvat ja loput jäävät arvioimatta. Tiedosto kirjoitetaan silti. Workflow'n job-timeout on
 * 60 min, ja budjetin yläraja 40 min jättää siihen varaa.
 *
 * Hilma-haku palauttaa enintään MAX_NOTICES (5000) ilmoitusta. Katto on tarpeen, koska nouseva järjestys katkaisisi uusimmat pois. Jos haku silti katkeaa
 * katon takia, ajo pysähtyy eikä kirjoita tiedostoa. Puutteellinen lista on huonompi kuin edellinen julkaisu.
 *
 * Edellisen ajon arvioita käytetään uudelleen, kun ilmoitus ja arviointitapa eivät ole muuttuneet.
 * Hilma-haku tehdään aina.
 *
 * Koodi 1: virhe ennen kirjoitusta (Hilma-haku epäonnistui tai haku katkesi MAX_NOTICES-rajaan). Tiedostoa ei kirjoiteta.
 * Koodi 2: tiedosto kirjoitettiin, mutta siinä ei ole yhtään AI-arviota (uusia oli tehtävänä, mutta yksikään ei onnistunut
 *          eikä välimuistista tullut arvioita). Yksittäinen epäonnistuminen, kun muu data on arvioitu, ei ole koodi 2.
 * Koodi 3: tiedosto kirjoitettiin ja julkaistaan, mutta erä pysähtyi pysyvään virheeseen (esim. väärä avain). Ajo merkitään epäonnistuneeksi.
 *          pages.yml tunnistaa koodin 3 ja merkitsee julkaisun jälkeen ajon punaiseksi.
 * Koodit 1 ja 2 estävät julkaisun, joten Pagesissa jää edellinen versio.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  assessAll,
  assessmentKey,
  automationProfile,
  DEFAULT_BATCH_OPTIONS,
  fetchNotices,
  geminiFromEnv,
  HilmaClient,
  isListedTender,
  listTenders,
  mergeAssessed,
  reuseAssessments,
  runExitCode,
  toPublicItems,
  type ListedTender,
  type RunStats,
  type Tender,
  type TendersResponse,
} from "@tarjousvahti/core";
import { loadEnv, requireEnv } from "./env.ts";

const MAX_NOTICES = 5000;
const PREVIOUS_FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_TIME_BUDGET_MIN = 40;
/**
 * Ylärajan on jäätävä selvästi alle workflow'n job-timeoutin (60 min). Budjetti lasketaan skriptin alusta, joten
 * npm ci, build, testit ja deploy kuluvat sen ulkopuolelle.
 */
const MAX_TIME_BUDGET_MIN = 40;

/** Lukee kokonaisluvun ympäristömuuttujasta. Tyhjä arvo antaa oletuksen, rajojen ulkopuolinen lopettaa. */
function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    console.error(`${name} pitää olla kokonaisluku väliltä ${min}–${max}, ei kelpaa.`);
    process.exit(1);
  }
  return n;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Lataa edellisen ajon rivit. Ei koskaan kaada ajoa: puuttuva, virheellinen tai väärän muotoinen data
 * tarkoittaa, että kaikki arvioidaan uudelleen. Ei PREVIOUS_DATA-asetusta: käytetään paikallista tulostiedostoa, jos se on.
 */
async function loadPreviousItems(source: string | undefined, localFile: string): Promise<ListedTender[]> {
  try {
    let text: string;
    if (source && /^https?:\/\//i.test(source)) {
      const res = await fetch(source, { signal: AbortSignal.timeout(PREVIOUS_FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } else if (source) {
      text = readFileSync(source, "utf8");
    } else if (existsSync(localFile)) {
      text = readFileSync(localFile, "utf8");
    } else {
      return [];
    }
    const parsed = JSON.parse(text) as Partial<TendersResponse> | null;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
      throw new Error("väärä muoto: items-taulukko puuttuu");
    }
    if (!parsed.items.every(isListedTender)) throw new Error("väärä muoto: rivin tender-kenttä on virheellinen");
    return parsed.items;
  } catch (err) {
    console.warn(`Edellistä dataa ei voitu käyttää (${errorMessage(err)}). Arvioidaan kaikki uudelleen.`);
    return [];
  }
}

loadEnv();
const out = process.argv[2] ?? "data.json";
const days = Number(process.argv[3] ?? 7);
if (!Number.isFinite(days) || days <= 0) {
  console.error(`Päivien määrä pitää olla positiivinen luku, sai: ${process.argv[3]}`);
  process.exit(1);
}
const previousSource = process.env.PREVIOUS_DATA?.trim() || undefined;

// Kaikki eräajon asetukset tarkistetaan ennen Hilma-hakua: virheellinen asetus ei saa maksaa hakua.
const hilmaApiKey = requireEnv("HILMA_API_KEY");
let ai: ReturnType<typeof geminiFromEnv>;
try {
  ai = geminiFromEnv(process.env);
} catch (err) {
  console.error(`Eräajo vaatii AI:n, mutta AI-asetukset ovat puutteelliset: ${errorMessage(err)}`);
  process.exit(1);
}
const concurrency = intEnv("AI_CONCURRENCY", DEFAULT_BATCH_OPTIONS.concurrency, 1, 5);
const minIntervalMs = intEnv("AI_MIN_INTERVAL_MS", DEFAULT_BATCH_OPTIONS.minIntervalMs, 0, 60_000);
const maxAssessments = intEnv("AI_MAX_ASSESSMENTS", DEFAULT_BATCH_OPTIONS.maxAssessments, 0, 1000);
const timeBudgetMin = intEnv("AI_TIME_BUDGET_MIN", DEFAULT_TIME_BUDGET_MIN, 1, MAX_TIME_BUDGET_MIN);

const startedAt = new Date();
// Budjetti lasketaan ajon alusta, joten se kattaa myös Hilma-haun. Absoluuttinen aikaleima on yksiselitteinen.
const deadlineMs = startedAt.getTime() + timeBudgetMin * 60_000;
const since = new Date(startedAt.getTime() - days * 86_400_000).toISOString();
const client = new HilmaClient({ apiKey: hilmaApiKey });

let fetched: Awaited<ReturnType<typeof fetchNotices>>;
try {
  fetched = await fetchNotices(client, { since, now: startedAt.toISOString(), max: MAX_NOTICES });
} catch (err) {
  // Haun epäonnistuessa ei kirjoiteta tiedostoa, jotta julkaistu data ei vanhene hiljaa tyhjäksi.
  console.error(`Hilma-haku epäonnistui, tiedostoa ei kirjoitettu: ${errorMessage(err)}`);
  process.exit(1);
}
// Puutteellinen lista ei saa korvata edellistä julkaisua. Kokonaismäärä kertoo, kuinka paljon katto on nostettava.
if (runExitCode({ truncated: fetched.truncated, pending: 0, assessed: 0, failed: 0, reused: 0, fatal: false }) === 1) {
  console.error(
    `Hilma-haku katkesi enimmäisrajaan ${MAX_NOTICES} (kokonaismäärä ${fetched.total ?? "?"}), tiedostoa ei kirjoitettu.`,
  );
  process.exit(1);
}

const listed = listTenders(fetched.reconciled, automationProfile, startedAt);

const previousItems = await loadPreviousItems(previousSource, out);
const keyOf = (tender: Tender) => assessmentKey(tender, ai.model);
const reuse = reuseAssessments(listed, previousItems, keyOf);

const pendingRows = reuse.pending.map((index) => reuse.items[index]!);
const result = await assessAll(pendingRows, ai.assessor, {
  concurrency,
  minIntervalMs,
  maxAssessments,
  deadlineMs,
  onError: (id, err) => console.warn(`AI-arvio epäonnistui (${id}): ${errorMessage(err)}`),
});

// Arvioidut rivit palautetaan niiden alkuperäisiin paikkoihin, järjestys säilyy.
const items = mergeAssessed(reuse, result.items);

const finishedAt = new Date();
const run: RunStats = {
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  fetched: fetched.raw.length,
  prefiltered: listed.length,
  reused: reuse.reused,
  assessed: result.assessed,
  failed: result.failed,
  skipped: result.skipped,
  model: ai.model,
  maxAssessments,
  timeBudgetMin,
};

// Varmuus lasketaan ja kuvaus tyhjennetään julkiseen tiedostoon vain yhdessä paikassa (toPublicItems).
const publicItems = toPublicItems(items, automationProfile);

const response: TendersResponse = {
  source: "static",
  generatedAt: finishedAt.toISOString(),
  items: publicItems,
  fetch: { total: fetched.total, days },
  run,
};
writeFileSync(out, JSON.stringify(response, null, 2));

console.log(`Haettu ${run.fetched}/${fetched.total ?? "?"} ilmoitusta.`);
console.log(`Esisuodatuksen läpi ${run.prefiltered}.`);
console.log(`Välimuistista ${run.reused}, arvioitu ${run.assessed}, epäonnistui ${run.failed}, ohitettu ${run.skipped}.`);
if (result.skippedByDeadline > 0) {
  console.log(
    `Aikabudjetti ${timeBudgetMin} min täyttyi: ${result.skippedByDeadline} ilmoitusta jäi arvioimatta. Ne arvioidaan seuraavalla ajolla.`,
  );
}
console.log(`Kirjoitettu ${items.length} ilmoitusta → ${out}`);

if (run.failed > 0) {
  console.warn(`::warning::${run.failed} uutta arviota epäonnistui, ne yritetään seuraavalla ajolla.`);
}

// Koodi 2 ja 3 kertovat virheestä. Yksittäinen epäonnistuminen ei estä julkaisua eikä anna virhekoodia.
const exitCode = runExitCode({
  truncated: fetched.truncated,
  pending: reuse.pending.length,
  assessed: run.assessed,
  failed: run.failed,
  reused: run.reused,
  fatal: result.fatal,
});
if (exitCode === 2) {
  console.error(
    "::error::Kaikki yritetyt AI-arviot epäonnistuivat, eikä välimuistissa ollut arvioita. Data on kirjoitettu ilman AI-arvioita.",
  );
  process.exit(exitCode);
}
if (exitCode === 3) {
  console.error(
    "::error::Pysyvä AI-virhe (esim. väärä avain tai tuntematon malli) pysäytti erän. Data on kirjoitettu ja julkaistaan, mutta ajo merkitään epäonnistuneeksi.",
  );
  process.exit(exitCode);
}
