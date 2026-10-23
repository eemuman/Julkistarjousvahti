import type { ListedTender } from "../api-types.js";
import type { Profile } from "../profile/automation.js";
import type { Assessment, Priority, PrefilterResult, Tender } from "../types.js";
import { formatPrefilterMatches, prefilter } from "./prefilter.js";
import { applyRules, fallbackLocationScope, locate, type LocationScope } from "./rules.js";

const PRIORITY_ORDER = { korkea: 0, normaali: 1, matala: 2 } as const;

/** Esisuodatuksen pistemäärän enimmäisarvo. */
export const PRE_SCORE_MAX = 75;
const PRE_SCORE_BASE = 30;
const PRE_SCORE_PER_CPV = 15;
const PRE_SCORE_PER_KEYWORD = 10;

/** Esisuodatuksen osumista laskettu pistemäärä: perusarvo + osuma per CPV ja avainsana, enintään PRE_SCORE_MAX. */
export function preScore(pre: PrefilterResult): number {
  return Math.min(
    PRE_SCORE_MAX,
    PRE_SCORE_BASE + PRE_SCORE_PER_CPV * pre.matchedCpv.length + PRE_SCORE_PER_KEYWORD * pre.matchedKeywords.length,
  );
}

/**
 * Väliaikainen arvio ennen AI-arviota. Pisteet tulevat esisuodatuksen osumista, joten arvio ei ole mallin
 * tuottama. Lista merkitsee sen erikseen (flags "ei AI-arviota", provisional).
 */
export function provisionalAssessment(item: Pick<ListedTender, "tender" | "prefilter" | "preScore">): Assessment {
  const { tender, prefilter: pre } = item;
  const hasMatch = pre.matchedCpv.length > 0 || pre.matchedKeywords.length > 0;
  const matches = formatPrefilterMatches(pre);
  return {
    relevance: item.preScore,
    category: !hasMatch ? "ei_relevantti" : tender.kind === "award" ? "rakennushanke_aliurakka" : "rakennusautomaatio",
    role: tender.kind === "award" && tender.winners.length > 0 ? "aliurakka" : "seuraa",
    summary: "Ei vielä AI-arviota: pisteet laskettu esisuodatuksen osumista.",
    reasons: [`CPV-osumat: ${matches.cpv}`, `Avainsanat: ${matches.keywords}`],
    automationScope: null,
  };
}

export interface Ranked {
  item: ListedTender;
  assessment: Assessment;
  provisional: boolean;
  priority: Priority;
  /** Syy prioriteetin nousulle (esim. "määräaika 5 pv"), tai null. */
  priorityReason: string | null;
  /** Näyttöteksti. Tilat ovat rakenteisissa kentissä (deadlinePassed, urgentDays, provisional), ei tekstissä. */
  flags: string[];
  visible: boolean;
  /** true, kun tarjousten määräaika on mennyt. */
  deadlinePassed: boolean;
  /** Päivät määräaikaan, kun se on 7 pv tai alle, muuten null. */
  urgentDays: number | null;
  /** Sijainnin laatu. Lippu flags-listassa on johdettu tästä. */
  locationScope: LocationScope;
}

/**
 * Sovittaa säännöt jokaiselle riville ja järjestää ne. Palauttaa myös piilotetut rivit,
 * jotta näkymä voi näyttää ne erikseen.
 */
export function rankTenders(items: ListedTender[], now: Date): Ranked[] {
  const ranked = items.map((item): Ranked => {
    const provisional = item.assessment === null;
    const assessment = item.assessment ?? provisionalAssessment(item);
    // Vanhasta datasta puuttuu locationScope, jolloin laatu päätellään toimipisteestä ja koodeista.
    const scope = item.locationScope ?? fallbackLocationScope(item.tender.nutsCodes, item.nearestOffice);
    const rules = applyRules(item.tender, assessment, scope, now);
    // Väliaikainen arvio ei saa piilottaa ilmoitusta. Piilotus tulee vain menneestä määräajasta.
    const visible = provisional ? !rules.deadlinePassed : rules.visible;
    // Esisuodatuksen pisteet eivät ole AI:n arvio, joten väliaikainen rivi ei nouse korkeaan prioriteettiin.
    // Järjestys (score) jää ennalleen, vain prioriteetti rajataan applyRules-boostien jälkeen.
    const capped = provisional && rules.priority === "korkea";
    const priority: Priority = capped ? "normaali" : rules.priority;
    return {
      item,
      assessment,
      provisional,
      priority,
      // Rajattu rivi ei ole korkea, joten korkeaan nousun syy ei päde sille.
      priorityReason: capped ? null : rules.priorityReason,
      flags: provisional ? ["ei AI-arviota", ...rules.flags] : rules.flags,
      visible,
      deadlinePassed: rules.deadlinePassed,
      urgentDays: rules.urgentDays,
      locationScope: rules.locationScope,
    };
  });

  return ranked.sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.assessment.relevance - a.assessment.relevance,
  );
}

/** Muuntaa ilmoituksen listariviksi. null, jos esisuodatus ei päästä sitä läpi. */
export function toListedTender(tender: Tender, profile: Profile): ListedTender | null {
  const pre = prefilter(tender, profile);
  if (!pre.pass) return null;
  const location = locate(tender, profile);
  return {
    tender,
    prefilter: pre,
    nearestOffice: location.office,
    locationScope: location.scope,
    preScore: preScore(pre),
    assessment: null,
  };
}

/**
 * Esisuodatus listaksi: mennyt määräaika ja duplikaatti-id pois, järjestys preScore laskevasti.
 * Ei tee AI-kutsuja. Sama rajaus kaikille, jotka näyttävät listan.
 */
export function listTenders(tenders: Tender[], profile: Profile, now: Date): ListedTender[] {
  const seen = new Set<string>();
  const items: ListedTender[] = [];
  for (const tender of tenders) {
    // Menneen määräajan ilmoitus ei ole enää tarjouskelpoinen.
    if (tender.deadline && new Date(tender.deadline).getTime() < now.getTime()) continue;
    if (seen.has(tender.id)) continue;
    const item = toListedTender(tender, profile);
    if (!item) continue;
    seen.add(tender.id);
    items.push(item);
  }
  return items.sort((a, b) => b.preScore - a.preScore);
}
