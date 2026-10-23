import type { Profile } from "../profile/automation.js";
import type { PrefilterResult, Tender } from "../types.js";

function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFC");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Osuu avainsanaan tekstissä.
 *
 * - "*" lopussa on sananvartalo: osuu taivutusmuotoihin (kokonaisurak* → kokonaisurakan).
 *   Pitkä sananvartalo osuu mihin tahansa kohtaan tekstiä (automaatio* → rakennusautomaatio).
 * - Lyhyt tunnus (≤ 5 merkkiä, esim. ddc, kvr, lvisa) vaatii aina alkavan sanarajan, jotta "ddc" ei osu sanan keskelle.
 *   Ilman "*":ää se vaatii myös loppuvan sanarajan. Lyhyt sananvartalo (lvi*) osuu sanan alusta, esim. "lvi-urakka" ja "lvijärjestelmä".
 * Avainsanat ja teksti ovat pieniä kirjaimia. Avainsanan merkit escapetaan, joten ne eivät ole säännöllisiä lausekkeita.
 */
function matchesKeyword(text: string, keyword: string): boolean {
  const normalized = normalizeText(keyword);
  const isStem = normalized.endsWith("*");
  const stem = isStem ? normalized.slice(0, -1) : normalized;
  if (stem.length === 0) return false;

  if (stem.length <= 5) {
    const end = isStem ? "" : "([^a-zåäö]|$)";
    return new RegExp(`(^|[^a-zåäö])${escapeRegExp(stem)}${end}`).test(text);
  }
  return text.includes(stem);
}

/** Talonrakennuksen CPV (4521, 453, 454 tai yleinen 45000000). Tyhjä lista = tuntematon. */
function hasBuildingSignal(cpvCodes: string[]): boolean {
  if (cpvCodes.length === 0) return true;
  return cpvCodes.some((c) => c === "45000000" || /^(4521|453|454)/.test(c));
}

/**
 * Suorat osumat: CPV directCpvPrefixes-listalta ja vahvat avainsanat. Sama logiikka kuin esisuodatuksessa,
 * joten varmuusarvio (scoring/confidence.ts) käyttää tätä eikä kopioi sääntöjä.
 */
export function directMatches(tender: Tender, profile: Profile): { directCpv: string[]; strongKeywords: string[] } {
  const text = normalizeText(`${tender.title} ${tender.description}`);
  return {
    directCpv: tender.cpvCodes.filter((code) => profile.directCpvPrefixes.some((p) => code.startsWith(p))),
    strongKeywords: profile.directKeywords.filter((k) => matchesKeyword(text, k)),
  };
}

/**
 * Deterministinen esisuodatus ennen AI:ta. Läpäisee suora tai rakennushankkeen CPV, vahva avainsana,
 * tai heikko rakennushankesana (vain talonrakennuksen CPV:llä tai ilman CPV:tä). Negatiivinen avainsana
 * karsii vain, jos osumaa ei tue suora CPV tai vahva avainsana. Hienojako tehdään AI:lla.
 */
export function prefilter(tender: Tender, profile: Profile): PrefilterResult {
  const text = normalizeText(`${tender.title} ${tender.description}`);
  const allPrefixes = [...profile.directCpvPrefixes, ...profile.constructionCpvPrefixes];

  const matchedCpv = tender.cpvCodes.filter((code) => allPrefixes.some((p) => code.startsWith(p)));
  const { directCpv, strongKeywords } = directMatches(tender, profile);
  const weakKeywords = profile.constructionKeywords.filter((k) => matchesKeyword(text, k));
  const matchedKeywords = [...strongKeywords, ...weakKeywords];
  const negativeHits = profile.negativeKeywords.filter((k) => matchesKeyword(text, k));

  const weakPass = weakKeywords.length > 0 && hasBuildingSignal(tender.cpvCodes);
  const hasPositive = matchedCpv.length > 0 || strongKeywords.length > 0 || weakPass;
  // Negatiivinen sana karsii heikon osuman. Suora CPV tai vahva avainsana ohittaa sen.
  // Rakennus-CPV (constructionCpvPrefixes) on heikko signaali, joten sitä ei lasketa ohitukseksi.
  const negativeDominates = negativeHits.length > 0 && directCpv.length === 0 && strongKeywords.length === 0;

  return {
    pass: hasPositive && !negativeDominates,
    matchedCpv,
    matchedKeywords,
  };
}

/** Esisuodatuksen osumat näyttötekstinä. "–", jos osumia ei ole. Core ja web käyttävät samaa muotoa. */
export function formatPrefilterMatches(pre: Pick<PrefilterResult, "matchedCpv" | "matchedKeywords">): {
  cpv: string;
  keywords: string;
} {
  return {
    cpv: pre.matchedCpv.join(", ") || "–",
    keywords: pre.matchedKeywords.join(", ") || "–",
  };
}
