import type { ListedTender } from "../api-types.js";
import type { Assessor } from "../scoring/ai.js";
import { GeminiError } from "../scoring/gemini.js";

/**
 * Virhe, joka kertoo palvelun tilasta (kiintiö, verkko, aikakatkaisu, palvelinvirhe), eikä yksittäisestä rivistä.
 * Vain transient-virheet lasketaan peräkkäisiksi. Mallin sisältövirheet (esim. estetty vastaus) ja
 * validointi- ja parsintavirheet nollaavat laskurin.
 */
function isServiceFailure(err: unknown): boolean {
  return err instanceof GeminiError && err.transient;
}

export interface AssessAllOptions {
  /** Samanaikaisten AI-kutsujen enimmäismäärä. Oletus DEFAULT_BATCH_OPTIONS.concurrency. */
  concurrency?: number;
  /** Vähimmäisväli kutsujen aloitusten välillä (ms). Oletus DEFAULT_BATCH_OPTIONS.minIntervalMs, ilmaistason minuuttiraja. */
  minIntervalMs?: number;
  /** Enintään näin monta AI-kutsua. Oletus DEFAULT_BATCH_OPTIONS.maxAssessments. */
  maxAssessments?: number;
  /**
   * Näin monen peräkkäisen palvelunvirheen (kiintiö 429, verkko, 5xx) jälkeen lopetetaan.
   * Validointi- ja parsintavirheet eivät laske. Pysyvä virhe (GeminiError.fatal, esim. väärä avain) lopettaa heti.
   * Oletus DEFAULT_BATCH_OPTIONS.maxConsecutiveFailures.
   */
  maxConsecutiveFailures?: number;
  /** Aikarajan absoluuttinen aikaleima (epoch-ms, sama kuin `now`). Kun se täyttyy, loput rivit ohitetaan. Tyhjä = ei rajaa. */
  deadlineMs?: number;
  /** Testejä varten. */
  sleep?: (ms: number) => Promise<void>;
  /** Testejä varten. */
  now?: () => number;
  onError?: (id: string, err: unknown) => void;
}

export interface AssessAllResult {
  /** Samassa järjestyksessä kuin syöte. */
  items: ListedTender[];
  assessed: number;
  failed: number;
  /** Ei yritetty: raja täynnä, peräkkäiset virheet tai aikabudjetti. */
  skipped: number;
  /** Osa skipped-riveistä, jotka jäivät aikabudjetin takia (deadlineMs ylittyi). */
  skippedByDeadline: number;
  /** true, jos erä pysähtyi pysyvään virheeseen (GeminiError.fatal, esim. väärä avain tai tuntematon malli). */
  fatal: boolean;
}

/** Eräajon oletukset. Käytetään sekä tässä että scripts/build-data.ts:ssä. */
export const DEFAULT_BATCH_OPTIONS = {
  concurrency: 2,
  minIntervalMs: 4000,
  maxAssessments: 150,
  maxConsecutiveFailures: 5,
} as const;

/**
 * Arvioi rivit annetussa järjestyksessä (kärki ensin) rajoitetusti: rinnakkaisuus, kutsujen väli,
 * kutsujen enimmäismäärä, peräkkäisten virheiden raja ja aikabudjetti. Ei heitä. Virheellinen rivi saa
 * aiFailed: true ja jää esisuodatuksen tiedoilla.
 */
export async function assessAll(
  items: ListedTender[],
  assessor: Assessor,
  opts: AssessAllOptions = {},
): Promise<AssessAllResult> {
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_BATCH_OPTIONS.concurrency);
  const minIntervalMs = Math.max(0, opts.minIntervalMs ?? DEFAULT_BATCH_OPTIONS.minIntervalMs);
  const maxAssessments = opts.maxAssessments ?? DEFAULT_BATCH_OPTIONS.maxAssessments;
  const maxConsecutiveFailures = opts.maxConsecutiveFailures ?? DEFAULT_BATCH_OPTIONS.maxConsecutiveFailures;
  const deadlineMs = opts.deadlineMs;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = opts.now ?? (() => Date.now());

  const results: ListedTender[] = [...items];
  let next = 0;
  let started = 0;
  let assessed = 0;
  let failed = 0;
  let skipped = 0;
  let skippedByDeadline = 0;
  let consecutiveFailures = 0;
  let stopped = false;
  let fatal = false;
  // Seuraavan kutsun aikaisin sallittu aloitushetki. Varataan synkronisesti, joten rinnakkaiset työntekijät eivät mene päällekkäin.
  let nextSlot = 0;

  const deadlinePassed = () => deadlineMs !== undefined && now() >= deadlineMs;
  const limitReached = () => stopped || started >= maxAssessments;

  /** Odottaa oman aloitusvuoronsa. Vuoro varataan heti, joten väli pätee myös rinnakkaisille kutsuille. */
  const waitForSlot = async () => {
    const at = Math.max(now(), nextSlot);
    nextSlot = at + minIntervalMs;
    const wait = at - now();
    if (wait > 0) await sleep(wait);
  };

  /** Ohitetaanko rivi: aikabudjetti tai kutsuraja täynnä. Kirjaa rivin ohitetuksi. */
  const shouldSkip = (): boolean => {
    if (deadlinePassed()) {
      skipped++;
      skippedByDeadline++;
      return true;
    }
    if (limitReached()) {
      skipped++;
      return true;
    }
    return false;
  };

  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      const item = items[index]!;
      if (shouldSkip()) continue;
      await waitForSlot();
      // Odotuksen aikana raja tai budjetti on voinut täyttyä toisen työntekijän virheistä tai kutsuista.
      if (shouldSkip()) continue;
      started++;
      try {
        const assessment = await assessor.assess(item.tender);
        assessed++;
        consecutiveFailures = 0;
        results[index] = { ...item, assessment };
      } catch (err) {
        failed++;
        // Pysyvä avain- tai pyyntövirhe toistuu jokaisella rivillä, joten erä pysäytetään heti.
        if (err instanceof GeminiError && err.fatal) {
          stopped = true;
          fatal = true;
        }
        // Palvelun virhe kasvattaa laskuria. Rivikohtainen virhe nollaa sen, koska palvelu toimii.
        consecutiveFailures = isServiceFailure(err) ? consecutiveFailures + 1 : 0;
        if (consecutiveFailures >= maxConsecutiveFailures) stopped = true;
        try {
          opts.onError?.(item.tender.id, err);
        } catch {
          // onError ei saa kaataa erää.
        }
        results[index] = { ...item, assessment: null, aiFailed: true };
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return { items: results, assessed, failed, skipped, skippedByDeadline, fatal };
}

export interface RunExitInput {
  /** Hilma-haku katkaistiin max-rajaan. */
  truncated: boolean;
  /** Uusia AI-arvioita oli tehtävänä (välimuistin ulkopuolella). */
  pending: number;
  assessed: number;
  failed: number;
  /** Välimuistista uudelleenkäytettyjen AI-arvioiden määrä. */
  reused: number;
  /** Erä pysähtyi pysyvään virheeseen (AssessAllResult.fatal). */
  fatal: boolean;
}

/**
 * Eräajon poistumiskoodi. Ensimmäinen ehto, joka täyttyy, ratkaisee.
 * 1: haku katkesi, tiedostoa ei kirjoiteta.
 * 2: tiedosto kirjoitettiin, mutta siinä ei ole yhtään AI-arviota: uusia arvioita oli tehtävänä, mutta yksikään ei
 *    onnistunut eikä välimuistista tullut arviota. Ei riipu failed-laskurista, joten myös kaikki ohitetut (esim.
 *    kutsuraja 0) antavat koodin 2. Kun muu data on arvioitu, yksittäinen epäonnistuminen ei ole koodi 2.
 * 3: data kirjoitettiin ja julkaistaan, mutta erä pysähtyi pysyvään virheeseen (esim. väärä avain). Ajo merkitään
 *    epäonnistuneeksi, jotta virhe näkyy eikä jää hiljaa edellisen datan taakse.
 * 0: onnistui (pelkkä välimuisti riittää, tai osa uusista arvioista epäonnistui mutta datassa on arvioita).
 */
export function runExitCode(input: RunExitInput): 0 | 1 | 2 | 3 {
  if (input.truncated) return 1;
  if (input.pending > 0 && input.assessed === 0 && input.reused === 0) return 2;
  if (input.fatal) return 3;
  return 0;
}
