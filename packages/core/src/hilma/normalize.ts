import type { Tender, TenderKind } from "../types.js";

/**
 * Hilman raakadata → Tender.
 *
 * KAIKKI Hilman kenttänimet ovat tässä tiedostossa. Kun indeksi muuttuu,
 * muutos tehdään vain tänne.
 *
 * Kentät on varmistettu oikeilla ilmoituksilla 2026-10-23.
 */

/**
 * Hilma palauttaa cpvCodes- ja nutsCodes-kentät välilyönnillä erotettuna merkkijonona
 * ("45000000 45330000"), ja winnerOrganisations "//"-erotettuna ("A Oy (123-4)//B Oy (567-8)"),
 * jossa nimessä voi olla pilkku ("Esimerkki Oy, Oulu (1234567-8)").
 */
const FIELDS = {
  id: ["id"],
  title: ["titleFi", "titleEn", "titleSv", "titleOther"],
  description: ["descriptionFi", "descriptionEn", "descriptionSv", "descriptionOther"],
  buyer: ["organisationNameFi", "organisationNameEn", "organisationNameSv", "organisationNameOther"],
  cpv: ["cpvCodes"],
  nuts: ["nutsCodes"],
  deadline: ["deadline"],
  value: ["estimatedValue"],
  winners: ["winnerOrganisations"],
  mainType: ["mainType"],
  isPlan: ["isPlan"],
  procedureId: ["procedureId"],
  noticeId: ["noticeId"],
  planId: ["planId"],
  previousIds: ["previousSearchIds"],
  isCancelled: ["isCancelled"],
} as const;

type Raw = Record<string, unknown>;

const HILMA_BASE = "https://www.hankintailmoitukset.fi";

function pick(raw: Raw, keys: readonly string[]): unknown {
  for (const k of keys) {
    const v = raw[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function asString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

function asStringArray(v: unknown, separator: RegExp): string[] {
  if (Array.isArray(v)) return v.map(asString).filter(Boolean);
  const s = asString(v);
  return s
    ? s
        .split(separator)
        .map((part) => part.trim())
        .filter(Boolean)
    : [];
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asIsoDate(v: unknown): string | null {
  const s = asString(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** CPV-koodi ilman tarkistusnumeroa: "45331000-6" → "45331000". */
export function cleanCpv(code: string): string {
  return code.replace(/-\d$/, "").replace(/\D/g, "");
}

/**
 * Hilman mainType-arvot (varmistettu facet-haulla):
 * ContractNotices → contract, ContractAwardNotices → award,
 * PriorInformationNotices ja ProcurementPlan → plan, muut (esim. Modification,
 * NationalNotices) → other. isPlan=true on aina plan.
 */
export function mapKind(mainType: string, isPlan: boolean): TenderKind {
  if (isPlan) return "plan";
  switch (mainType) {
    case "ContractNotices":
      return "contract";
    case "ContractAwardNotices":
      return "award";
    case "PriorInformationNotices":
    case "ProcurementPlan":
      return "plan";
    default:
      return "other";
  }
}

/**
 * Ilmoituksen linkki Hilmaan:
 * - hankintailmoitus (EF-): /fi/public/procedure/{procedureId}/enotice/{noticeId}
 * - hankintasuunnitelma (PLAN-): /fi/public/plan/{planId}
 * - muut (OLD-): OLD-ilmoituksille ei löytynyt suoraa linkkiä, joten linkki vie etusivulle.
 */
function noticeUrl(raw: Raw): string {
  const id = asString(pick(raw, FIELDS.id));
  const procedureId = asNumber(pick(raw, FIELDS.procedureId)) ?? 0;
  const noticeId = asNumber(pick(raw, FIELDS.noticeId)) ?? 0;
  const planId = asNumber(pick(raw, FIELDS.planId)) ?? 0;
  if (id.startsWith("EF-") && procedureId > 0 && noticeId > 0) {
    return `${HILMA_BASE}/fi/public/procedure/${procedureId}/enotice/${noticeId}`;
  }
  if (id.startsWith("PLAN-") && planId > 0) {
    return `${HILMA_BASE}/fi/public/plan/${planId}`;
  }
  return HILMA_BASE;
}

/**
 * Otsikko kertoo keskeytyksestä. Ankkuroitu otsikon alkuun, koska sanan osuma keskellä otsikkoa (esim. "Keskeytymättömän")
 * ei ole keskeytys. Tunnetut muodot Hilmassa (edustava otos testattu normalize.test.ts:ssä):
 * "Keskeytysilmoitus ...", "KESKEYTETTY: ...", "HANKINTA KESTEYTETTY ..." (kirjoitusvirhe),
 * "JÄLKI-ILMOITUS: hankintamenettelyn keskeyttäminen ...", "Hankinta keskeytetään ...", "Hankinta keskeytään ...".
 * Kirjainkoolla ei ole väliä. Sanan loppu tarkistetaan \p{L}-lookaheadilla, koska \b ei tunnista ä:tä sanan merkiksi.
 */
const CANCELLED_TITLE =
  /^(jälki-ilmoitus:\s*)?(hankintamenettelyn\s+|hankinta\s+)?(keskeytysilmoitus|keskeytetty|kesteytetty|keskeytetään|keskeytään|keskeyttäminen)(?!\p{L})/iu;

export function isCancellationTitle(title: string): boolean {
  return CANCELLED_TITLE.test(title);
}

export function normalizeTender(raw: Raw): Tender {
  const title = asString(pick(raw, FIELDS.title));
  const procedureId = asNumber(pick(raw, FIELDS.procedureId)) ?? 0;
  return {
    id: asString(pick(raw, FIELDS.id)),
    kind: mapKind(asString(pick(raw, FIELDS.mainType)), pick(raw, FIELDS.isPlan) === true),
    title,
    description: asString(pick(raw, FIELDS.description)),
    buyer: asString(pick(raw, FIELDS.buyer)),
    cpvCodes: asStringArray(pick(raw, FIELDS.cpv), /[\s,;]+/).map(cleanCpv).filter(Boolean),
    nutsCodes: asStringArray(pick(raw, FIELDS.nuts), /[\s,;]+/),
    deadline: asIsoDate(pick(raw, FIELDS.deadline)),
    estimatedValueEur: asNumber(pick(raw, FIELDS.value)),
    winners: asStringArray(pick(raw, FIELDS.winners), /\s*\/\/\s*/),
    url: noticeUrl(raw),
    procedureId: procedureId > 0 ? String(procedureId) : null,
    supersedes: asStringArray(pick(raw, FIELDS.previousIds), /[\s,;]+/),
    cancelled: pick(raw, FIELDS.isCancelled) === true || isCancellationTitle(title),
  };
}
