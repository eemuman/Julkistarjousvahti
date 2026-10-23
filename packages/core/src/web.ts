/**
 * Selaimen entry. Web tuo coren tästä, ei barrel-entrystä (index.ts), jotta zod ja eräajon koodi
 * eivät päädy selainbundleen. Tänne saa lisätä vain puhdasta laskentaa, tyyppejä ja vakioita, ei I/O:ta tai schema-moduuleja.
 */
export { rankTenders, type Ranked } from "./scoring/ranking.js";
export { formatPrefilterMatches } from "./scoring/prefilter.js";
export {
  HIGH_MIN_RELEVANCE,
  LOW_MIN_RELEVANCE_WITHOUT_SIGNAL,
  SHORT_DESCRIPTION_CHARS,
  type Confidence,
  type ConfidenceLevel,
} from "./scoring/confidence.js";
export {
  HIGH_PRIORITY_MIN,
  LARGE_PROJECT_EUR,
  LOCATION_FLAG,
  NORMAL_PRIORITY_MIN,
  SUBCONTRACT_AWARD_BOOST,
  URGENT_BOOST,
  URGENT_DAYS_MAX,
  VISIBLE_RELEVANCE_MIN,
  type LocationScope,
} from "./scoring/rules.js";
export type { Role } from "./types.js";
export { isListedTender, type ListedTender, type RunStats, type TendersResponse } from "./api-types.js";
