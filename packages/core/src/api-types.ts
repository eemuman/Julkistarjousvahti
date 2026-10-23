import type { Confidence } from "./scoring/confidence.js";
import type { LocationScope } from "./scoring/rules.js";
import type { Assessment, PrefilterResult, Tender } from "./types.js";

/** Listan rivi ennen AI-arviota tai sen jälkeen. assessment null = ei vielä arvioitu. */
export interface ListedTender {
  tender: Tender;
  prefilter: PrefilterResult;
  nearestOffice: string | null;
  /** Sijainnin laatu (ks. scoring/rules.ts). Puuttuu vanhasta datasta; ranking päättelee silloin toimipisteestä. */
  locationScope?: LocationScope;
  /** Esisuodatuksen osumista laskettu pistemäärä 0–PRE_SCORE_MAX. EI ole AI:n arvio. */
  preScore: number;
  assessment: Assessment | null;
  /** true = eräajon AI-arvio epäonnistui; rivi näytetään esisuodatuksen tiedoilla. */
  aiFailed?: boolean;
  /**
   * Arvion välimuistiavain (ks. service/cache.ts). Kun ilmoitus tai arviointitapa muuttuu, avain muuttuu
   * ja arvio tehdään uudelleen. Puuttuu vanhasta datasta, jolloin arvio tehdään aina uudelleen.
   */
  assessmentKey?: string;
  /**
   * Varmuus AI-arviolle, lasketaan koodissa joka ajossa (scoring/confidence.ts). Ei kuulu välimuistiavaimeen.
   * Puuttuu vanhasta datasta; null = arviota ei ole.
   */
  confidence?: Confidence | null;
}

/** Tyyppivahti: onko arbitraari JSON-rivi kelvollinen ListedTender (tender.id ja tender.title merkkijonoja). Ei zodia, joten web voi käyttää sitä. */
export function isListedTender(x: unknown): x is ListedTender {
  if (typeof x !== "object" || x === null) return false;
  const tender = (x as { tender?: unknown }).tender;
  if (typeof tender !== "object" || tender === null) return false;
  const { id, title } = tender as { id?: unknown; title?: unknown };
  return typeof id === "string" && typeof title === "string";
}

/** "static" = eräajon data.json, "offline" = web-buildin mukana tuleva varadata (sample.json). */
export type TenderSource = "static" | "offline";

/**
 * Eräajon tilastot (source "static"). Haun tiedot (kokonaismäärä, katkaisu, päivät) ovat
 * TendersResponse.fetch-kentässä, eikä niitä toisteta tässä.
 */
export interface RunStats {
  startedAt: string; // ISO
  finishedAt: string; // ISO
  fetched: number; // Hilmasta haetut
  prefiltered: number; // esisuodatuksen läpäisseet (listan rivit)
  reused: number; // arvio käytettiin edellisen ajon välimuistista (ei AI-kutsua)
  assessed: number; // AI-arvio onnistui (vain uudet ja muuttuneet rivit)
  failed: number; // AI-arvio epäonnistui
  skipped: number; // ei yritetty (kutsuraja täynnä, peräkkäiset virheet tai aikabudjetti AI_TIME_BUDGET_MIN täynnä)
  model: string;
  /** Ajon kutsuraja (AI_MAX_ASSESSMENTS). Valinnainen: vanha data ei sisällä. */
  maxAssessments?: number;
  /** Ajon aikabudjetti minuutteina (AI_TIME_BUDGET_MIN). Valinnainen: vanha data ei sisällä. */
  timeBudgetMin?: number;
}

export interface TendersResponse {
  source: TenderSource;
  generatedAt: string;
  items: ListedTender[];
  fetch: { total: number | null; days: number };
  run?: RunStats;
}
