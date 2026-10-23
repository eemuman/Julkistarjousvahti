import { describe, expect, it } from "vitest";
import { automationProfile } from "../src/profile/automation.js";
import { applyRules, locate, nearestOffice } from "../src/scoring/rules.js";
import type { Tender } from "../src/types.js";
import { exampleTender, makeAssessment, TEST_NOW } from "./helpers.js";

const withNuts = (nutsCodes: string[]): Tender => ({ ...exampleTender(), nutsCodes });

/** NUTS 2024 -luokituksen Manner-Suomen NUTS3-alueet (18 kpl). Lähde: automation.ts:n kartan kommentit. */
const MANNER_SUOMI_NUTS3_2024 = [
  "FI1B1", "FI1C1", "FI1C2", "FI1C5", "FI1C6", "FI1C7", "FI196", "FI198", "FI199",
  "FI19A", "FI19B", "FI1D5", "FI1D7", "FI1D8", "FI1D9", "FI1DA", "FI1DB", "FI1DC",
];

describe("toimipisteet (nearestOffice)", () => {
  it("jokaisella Manner-Suomen NUTS 2024 -alueella on toimipiste, FI19B → Tampere", () => {
    for (const code of MANNER_SUOMI_NUTS3_2024) {
      expect(nearestOffice(withNuts([code]), automationProfile), code).not.toBeNull();
    }
    expect(nearestOffice(withNuts(["FI19B"]), automationProfile)).toBe("Tampere");
  });
});

describe("sijaintitilat (locate + sijainnin liput)", () => {
  it.each<[string, string[], string, string | null, string | null]>([
    ["NUTS3 → toimipiste", ["FI1D9"], "office", "Oulu", null],
    ["NUTS2, kaikki alueet samaan toimipisteeseen → toimipiste", ["FI1B"], "office", "Helsinki", null],
    ["NUTS2, alueet useaan toimipisteeseen → laaja alue", ["FI1C"], "wide", null, "laaja alue"],
    ["FI tai FI+AX → koko Suomi", ["FI", "AX"], "nationwide", null, "koko Suomi"],
    ["pelkkä Ahvenanmaa → Turku", ["AX"], "office", "Turku", null],
    ["tuntematon NUTS3 → ei toimipistettä alueella", ["FI1X9"], "unmapped", null, "ei toimipistettä alueella"],
    ["tyhjä NUTS-lista → sijainti tuntematon", [], "unknown", null, "sijainti tuntematon"],
  ])("%s", (_name, codes, scope, office, flag) => {
    const tender = withNuts(codes);
    const location = locate(tender, automationProfile);
    const flags = applyRules(tender, makeAssessment(), location.scope, TEST_NOW).flags;

    expect(location).toEqual({ office, scope });
    if (flag) expect(flags).toContain(flag);
    // Koko Suomi -lippu vain koko maan tapauksessa, eikä muissa mene "ei toimipistettä" -lippua.
    expect(flags.includes("koko Suomi")).toBe(scope === "nationwide");
    expect(flags.includes("ei toimipistettä alueella")).toBe(scope === "unmapped");
  });
});
