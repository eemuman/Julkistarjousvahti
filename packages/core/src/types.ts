/** Ilmoituksen tyyppi omassa mallissamme (Hilman tyypit mapataan tähän normalize.ts:ssä). */
export type TenderKind = "contract" | "award" | "plan" | "other";

/** Normalisoitu hankintailmoitus. Ei riipu Hilman kenttänimistä. */
export interface Tender {
  id: string;
  kind: TenderKind;
  title: string;
  description: string;
  buyer: string;
  cpvCodes: string[];
  /** NUTS3-koodit, esim. "FI197" (Pirkanmaa). */
  nutsCodes: string[];
  /** Tarjousten määräaika ISO-muodossa. Jälki-ilmoituksilla yleensä null. */
  deadline: string | null;
  estimatedValueEur: number | null;
  /** Jälki-ilmoituksissa voittaja(t). */
  winners: string[];
  url: string;
  /** Hilman hankintamenettelyn tunniste. Sama kaikilla saman menettelyn ilmoituksilla (tarjouspyyntö, korjaus, jälki-ilmoitus). */
  procedureId?: string | null;
  /** Ilmoitukset, jotka tämä korjausilmoitus korvaa (Hilman indeksissä on vain uusin versio). */
  supersedes?: string[];
  /** true, jos ilmoitus kertoo hankinnan keskeytyksestä. */
  cancelled?: boolean;
  /** true, jos tämä on keksittyä esimerkkidataa (fixture). Näytetään UI:ssa selvästi. */
  isExample?: boolean;
}

/** Arvion kategoriat. Lista on tässä, jotta sekä zod-skeema (scoring/schema.ts) että tyyppi voivat käyttää sitä. */
export const CATEGORIES = [
  "rakennusautomaatio",
  "savunpoisto",
  "leikkaussali_puhdastila",
  "huolto_modernisointi",
  "rakennushanke_aliurakka",
  "ei_relevantti",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Arvion roolit. */
export const ROLES = ["suora_tarjous", "aliurakka", "seuraa", "ohita"] as const;

export type Role = (typeof ROLES)[number];

/** AI:n arvio yhdestä ilmoituksesta. Validoidaan skeemalla (scoring/schema.ts). */
export interface Assessment {
  relevance: number;
  category: Category;
  role: Role;
  summary: string;
  reasons: string[];
  automationScope: string | null;
  /**
   * Yksi konkreettinen suomenkielinen seuraava askel (enintään 160 merkkiä). Valinnainen, koska
   * väliaikaisella arviolla ja vanhalla data.json:lla sitä ei ole. AI:n vastauksessa pakollinen.
   */
  nextStep?: string;
}

export type Priority = "korkea" | "normaali" | "matala";

export interface PrefilterResult {
  pass: boolean;
  matchedCpv: string[];
  matchedKeywords: string[];
}
