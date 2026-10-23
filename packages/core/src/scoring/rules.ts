import type { Profile } from "../profile/automation.js";
import type { Assessment, Priority, Tender } from "../types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Pienin relevanssi, jolla ilmoitus näkyy listalla (yhdessä roolin !== "ohita" kanssa). */
export const VISIBLE_RELEVANCE_MIN = 20;
/** Määräaika, jonka sisällä ilmoitus on kiireellinen (päivää, mukaan lukien). */
export const URGENT_DAYS_MAX = 7;
/** Hanke, jonka arvo on vähintään tämä (EUR), on "iso hanke". */
export const LARGE_PROJECT_EUR = 5_000_000;
/** Pisteet, jotka kiireellinen määräaika lisää relevanssiin. */
export const URGENT_BOOST = 10;
/** Pisteet, jotka aliurakkaroolin jälki-ilmoitus lisää relevanssiin. */
export const SUBCONTRACT_AWARD_BOOST = 10;
/** Pistemäärä, josta alkaen prioriteetti on korkea. */
export const HIGH_PRIORITY_MIN = 80;
/** Pistemäärä, josta alkaen prioriteetti on normaali. */
export const NORMAL_PRIORITY_MIN = 50;

/**
 * Sijainnin laatu. Näyttöteksti (LOCATION_FLAG) johdetaan tästä, ei päinvastoin.
 * office: toimipiste löytyi. nationwide: koko Suomi. wide: NUTS2-alue, jonka toimipisteet eroavat.
 * unknown: NUTS-koodeja ei ole. unmapped: koodit eivät vastaa karttaa.
 */
export type LocationScope = "office" | "nationwide" | "wide" | "unknown" | "unmapped";

/** Lippu, joka näytetään kortilla ja yksityiskohdissa. null = toimipiste löytyi, ei lippua. */
export const LOCATION_FLAG: Record<LocationScope, string | null> = {
  office: null,
  nationwide: "koko Suomi",
  wide: "laaja alue",
  unknown: "sijainti tuntematon",
  unmapped: "ei toimipistettä alueella",
};

/** Ilmoituksen sijainti: lähin toimipiste (tai null) ja sen laatu. */
export interface Location {
  office: string | null;
  scope: LocationScope;
}

/**
 * Ahvenanmaa on yksi NUTS3-alue (FI200). Karkeammat koodit (AX on ISO-koodi, FI2 ja FI20 ovat NUTS-tasoja)
 * tarkoittavat samaa aluetta.
 */
const ALAND_NUTS3 = "FI200";
const ALAND_COARSE_CODES = new Set(["AX", "FI2", "FI20"]);
/** Koodit, jotka kuuluvat koko maan tai Manner-Suomen ilmoitukseen. */
const NATIONWIDE_CODES = new Set(["FI", "FI1", "AX", "FI2", "FI20"]);
/** Koko maan (FI) tai Manner-Suomen (FI1) koodi. Ilman sitä ryhmä on pelkkä Ahvenanmaa, jolla on oma toimipiste. */
const NATIONWIDE_ANCHORS = new Set(["FI", "FI1"]);
/** NUTS2-koodin pituus, esim. FI1B tai FI19. */
const NUTS2_LENGTH = 4;

/** true, kun kaikki koodit kuuluvat koko maan joukkoon ja mukana on FI tai FI1 (esim. "FI", "FI1 + AX"). */
function isNationwide(nutsCodes: string[]): boolean {
  return (
    nutsCodes.length > 0 &&
    nutsCodes.every((code) => NATIONWIDE_CODES.has(code)) &&
    nutsCodes.some((code) => NATIONWIDE_ANCHORS.has(code))
  );
}

/** Toimipiste yhdelle NUTS-koodille (NUTS3-tarkkuus tai Ahvenanmaa). */
function officeForCode(code: string, profile: Profile): string | null {
  // Hyväksy myös tarkempi koodi (esim. kuntataso), vertaa NUTS3-prefiksiin.
  const key = ALAND_COARSE_CODES.has(code) ? ALAND_NUTS3 : code.slice(0, 5);
  return profile.officeByNuts3[key] ?? null;
}

/** Kartan NUTS3-koodit, jotka alkavat annetulla NUTS2-koodilla. */
function nuts3Under(nuts2: string, profile: Profile): string[] {
  return Object.keys(profile.officeByNuts3).filter((nuts3) => nuts3.startsWith(nuts2));
}

/**
 * Ilmoituksen sijainti NUTS-koodeista. Järjestys: tyhjä lista on tuntematon; koko maan koodit ovat koko Suomi;
 * NUTS3-koodi tai Ahvenanmaa antaa toimipisteen; NUTS2-koodilla toimipiste annetaan vain, jos kaikki sen
 * NUTS3-alueet ohjautuvat samaan toimipisteeseen, muuten alue on laaja. Muut koodit eivät vastaa karttaa.
 */
export function locate(tender: Tender, profile: Profile): Location {
  const codes = tender.nutsCodes;
  if (codes.length === 0) return { office: null, scope: "unknown" };
  if (isNationwide(codes)) return { office: null, scope: "nationwide" };

  for (const code of codes) {
    const office = officeForCode(code, profile);
    if (office) return { office, scope: "office" };
  }

  let wide = false;
  for (const code of codes) {
    if (code.length !== NUTS2_LENGTH) continue;
    const children = nuts3Under(code, profile);
    if (children.length === 0) continue;
    const offices = new Set(children.map((nuts3) => profile.officeByNuts3[nuts3]!));
    if (offices.size === 1) return { office: Array.from(offices)[0]!, scope: "office" };
    wide = true;
  }
  return { office: null, scope: wide ? "wide" : "unmapped" };
}

/** Lähin toimipiste NUTS-koodien perusteella, tai null (ks. locate). */
export function nearestOffice(tender: Tender, profile: Profile): string | null {
  return locate(tender, profile).office;
}

/**
 * Sijainnin laatu ilman toimipistekarttaa. Käytetään vanhalle datalle, jossa locationScope-kenttää ei ole.
 * Osaa vain tyhjän listan, koko maan ja toimipisteen; NUTS2-alueet näkyvät vanhassa datassa "ei toimipistettä alueella".
 */
export function fallbackLocationScope(nutsCodes: string[], office: string | null): LocationScope {
  if (nutsCodes.length === 0) return "unknown";
  if (isNationwide(nutsCodes)) return "nationwide";
  return office ? "office" : "unmapped";
}

function priorityOf(score: number): Priority {
  return score >= HIGH_PRIORITY_MIN ? "korkea" : score >= NORMAL_PRIORITY_MIN ? "normaali" : "matala";
}

export interface RuleResult {
  priority: Priority;
  flags: string[];
  /** false = piilotetaan listalta (esim. määräaika mennyt). */
  visible: boolean;
  /** Lyhyt syy, miksi prioriteetti nousi pisteiden lisäyksen takia, tai null. Esim. "määräaika 5 pv". */
  priorityReason: string | null;
  /** true, kun tarjousten määräaika on mennyt. */
  deadlinePassed: boolean;
  /** Päivät määräaikaan, kun määräaika on 7 pv tai alle (ylöspäin pyöristetty), muuten null. */
  urgentDays: number | null;
  /** Sijainnin laatu. Sijaintilippu flags-listassa on johdettu tästä (LOCATION_FLAG). */
  locationScope: LocationScope;
}

/**
 * Faktoihin perustuvat säännöt AI-arvion päälle. Määräaikoja ja sijainteja
 * ei arvioida mallilla, ne lasketaan.
 */
export function applyRules(tender: Tender, assessment: Assessment, locationScope: LocationScope, now: Date): RuleResult {
  const flags: string[] = [];
  let visible = assessment.role !== "ohita" && assessment.relevance >= VISIBLE_RELEVANCE_MIN;
  let urgentDays: number | null = null;
  let deadlinePassed = false;

  if (tender.deadline) {
    const daysLeft = (new Date(tender.deadline).getTime() - now.getTime()) / DAY_MS;
    if (daysLeft < 0) {
      visible = false;
      deadlinePassed = true;
      flags.push("määräaika mennyt");
    } else if (daysLeft <= URGENT_DAYS_MAX) {
      urgentDays = Math.ceil(daysLeft);
      flags.push(`määräaika ${urgentDays} pv`);
    }
  }

  if (tender.kind === "award" && tender.winners.length > 0) flags.push("voittaja valittu");
  if (tender.kind === "plan") flags.push("hankintasuunnitelma");
  const locationFlag = LOCATION_FLAG[locationScope];
  if (locationFlag) flags.push(locationFlag);
  if (tender.estimatedValueEur !== null && tender.estimatedValueEur >= LARGE_PROJECT_EUR) flags.push("iso hanke");

  // Pisteiden lisäykset kerätään ensin, ja syy kirjataan vain, jos ne muuttivat prioriteettia.
  const boosts: string[] = [];
  let score = assessment.relevance;
  if (urgentDays !== null) {
    score += URGENT_BOOST;
    boosts.push(`määräaika ${urgentDays} pv`);
  }
  if (tender.kind === "award" && assessment.role === "aliurakka") {
    score += SUBCONTRACT_AWARD_BOOST;
    boosts.push("aliurakka jälki-ilmoituksessa");
  }

  const priority = priorityOf(score);
  const changedByBoosts = priority !== priorityOf(assessment.relevance);
  return {
    priority,
    flags,
    visible,
    priorityReason: changedByBoosts && boosts.length > 0 ? boosts.join(", ") : null,
    deadlinePassed,
    urgentDays,
    locationScope,
  };
}
