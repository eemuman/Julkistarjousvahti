import { describe, expect, it } from "vitest";
import { automationProfile } from "../src/profile/automation.js";
import { assessConfidence, type ConfidenceLevel } from "../src/scoring/confidence.js";
import type { Assessment, Tender } from "../src/types.js";
import { exampleTender, makeAssessment } from "./helpers.js";

const LONG_DESCRIPTION = "Kuvaus ilmoituksen sisällöstä. ".repeat(20);
const make = (overrides: Partial<Tender>): Tender => ({
  ...exampleTender(),
  title: "Yleinen hankinta",
  description: LONG_DESCRIPTION,
  cpvCodes: ["45331000"],
  ...overrides,
});

describe("assessConfidence", () => {
  it.each<[string, Partial<Tender>, number | null, Assessment["role"], ConfidenceLevel | null]>([
    ["korkea: suora CPV, pitkä kuvaus, relevanssi ≥ 50", {}, 60, "seuraa", "korkea"],
    ["matala: ei suoraa osumaa, relevanssi ≥ 80", { cpvCodes: ["71000000"] }, 85, "seuraa", "matala"],
    ["matala: lyhyt kuvaus, vaikka osuma hyvä", { description: "Lyhyt." }, 90, "seuraa", "matala"],
    ["matala: pelkkä laaja avainsana, relevanssi ≥ 80", { title: "Automaatiourakka", cpvCodes: ["71000000"] }, 90, "seuraa", "matala"],
    ["kohtalainen: pelkkä laaja avainsana, relevanssi < 80 ei riitä", { title: "Automaatiourakka", cpvCodes: ["71000000"] }, 60, "seuraa", "kohtalainen"],
    ["korkea: vahva avainsana (DDC), relevanssi ≥ 50", { title: "DDC-alakeskukset", cpvCodes: ["71000000"] }, 60, "seuraa", "korkea"],
    ["korkea: aliurakka + rakennushankkeen CPV tukee", { cpvCodes: ["45210000"] }, 60, "aliurakka", "korkea"],
    ["kohtalainen: rakennus-CPV ilman aliurakkarooli ei tue", { cpvCodes: ["45210000"] }, 60, "seuraa", "kohtalainen"],
    ["null: arviota ei ole", {}, null, "seuraa", null],
  ])("%s", (_name, overrides, relevance, role, level) => {
    const assessment = relevance === null ? null : makeAssessment({ relevance, role });
    const result = assessConfidence(make(overrides), assessment, automationProfile);
    expect(result?.level ?? null).toBe(level);
    if (level) expect(result!.reasons.length).toBeGreaterThan(0);
  });
});
