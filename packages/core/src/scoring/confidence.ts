import type { Profile } from "../profile/automation.js";
import type { Assessment, Tender } from "../types.js";
import { directMatches } from "./prefilter.js";

/** Varmuustaso. Lasketaan koodissa signaalien yhtäpitävyydestä, ei mallin omana arviona. */
export type ConfidenceLevel = "korkea" | "kohtalainen" | "matala";

export interface Confidence {
  level: ConfidenceLevel;
  /** Lyhyet suomenkieliset perustelut ehdoista, jotka vaikuttivat tasoon. */
  reasons: string[];
}

/** Kuvaus, joka on tätä lyhyempi, ei anna AI:lle riittävästi tietoa. */
export const SHORT_DESCRIPTION_CHARS = 300;
/** Korkea vaatii vahvan signaalin ja vähintään tämän relevanssin. */
export const HIGH_MIN_RELEVANCE = 50;
/** Ilman vahvaa signaalia tämä relevanssi tai yli on silti matala varmuus: AI:n arvio ei ole tuettu koodilla. */
export const LOW_MIN_RELEVANCE_WITHOUT_SIGNAL = 80;

/**
 * Varmuus AI-arviolle. Puhdas funktio, ei AI-kutsuja.
 *
 * - null, jos arviota ei ole (assessment null tai erän AI-arvio epäonnistui).
 * - matala: niukka tieto (lyhyt kuvaus tai ei CPV:tä), TAI ei vahvaa signaalia mutta relevanssi vähintään LOW_MIN_RELEVANCE_WITHOUT_SIGNAL.
 * - korkea: vahva signaali ja relevanssi vähintään HIGH_MIN_RELEVANCE, eikä niukkaa tietoa.
 * - muuten kohtalainen.
 *
 * Vahva signaali on jokin seuraavista:
 * - suora CPV (profile.directCpvPrefixes),
 * - vahva avainsana, joka ei ole laaja (profile.directKeywords ilman profile.broadKeywords),
 * - aliurakkarooli ja rakennushankkeen CPV (profile.constructionCpvPrefixes).
 * Laaja avainsana ei yksin riitä signaaliksi. Esisuodatuksen läpäisy ei muutu tämän takia.
 * Kutsu tehdään ennen kuvauksen tyhjennystä, koska kuvauksen pituus on yksi ehdoista.
 */
export function assessConfidence(
  tender: Tender,
  assessment: Assessment | null,
  profile: Profile,
): Confidence | null {
  if (assessment === null) return null;

  const { directCpv, strongKeywords } = directMatches(tender, profile);
  const narrowKeywords = strongKeywords.filter((k) => !profile.broadKeywords.includes(k));
  const constructionCpv =
    assessment.role === "aliurakka" &&
    tender.cpvCodes.some((code) => profile.constructionCpvPrefixes.some((p) => code.startsWith(p)));
  const strong = directCpv.length > 0 || narrowKeywords.length > 0 || constructionCpv;
  const shortDescription = tender.description.trim().length < SHORT_DESCRIPTION_CHARS;
  const noCpv = tender.cpvCodes.length === 0;
  const sparse = shortDescription || noCpv;
  const relevance = assessment.relevance;

  const reasons: string[] = [];
  if (directCpv.length > 0) reasons.push("suora CPV-osuma tukee arviota");
  if (narrowKeywords.length > 0) reasons.push("vahva avainsanaosuma tukee arviota");
  if (constructionCpv) reasons.push("rakennushankkeen CPV tukee aliurakka-arviota");
  if (strongKeywords.length > 0 && narrowKeywords.length === 0) {
    reasons.push("laaja avainsanaosuma ei yksin riitä vahvaksi signaaliksi");
  }
  if (shortDescription) reasons.push(`ilmoituksen teksti on alle ${SHORT_DESCRIPTION_CHARS} merkkiä`);
  if (noCpv) reasons.push("CPV-koodit puuttuvat");

  let level: ConfidenceLevel;
  if (sparse) {
    level = "matala";
  } else if (!strong && relevance >= LOW_MIN_RELEVANCE_WITHOUT_SIGNAL) {
    level = "matala";
  } else if (strong && relevance >= HIGH_MIN_RELEVANCE) {
    level = "korkea";
  } else {
    level = "kohtalainen";
  }

  if (!strong) {
    reasons.push(
      relevance >= LOW_MIN_RELEVANCE_WITHOUT_SIGNAL
        ? `AI pitää relevanttina (vähintään ${LOW_MIN_RELEVANCE_WITHOUT_SIGNAL}) ilman vahvaa signaalia`
        : "vahvaa signaalia ei ole (suora CPV tai vahva avainsana)",
    );
  } else if (level === "korkea") {
    reasons.push(`AI:n relevanssi on vähintään ${HIGH_MIN_RELEVANCE}`);
  }

  return { level, reasons };
}
