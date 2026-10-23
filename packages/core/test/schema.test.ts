import { describe, expect, it } from "vitest";
import { parseAssessment } from "../src/scoring/ai.js";
import { redactContacts } from "../src/scoring/schema.js";
import { makeAssessment } from "./helpers.js";

describe("parseAssessment", () => {
  it("puuttuva pakollinen kenttä (nextStep) hylätään", () => {
    const { nextStep: _omitted, ...withoutNextStep } = makeAssessment();
    expect(() => parseAssessment(JSON.stringify(withoutNextStep))).toThrow();
  });

  it("liian pitkä summary katkaistaan 300 merkkiin eikä hylätä", () => {
    const s = parseAssessment(JSON.stringify(makeAssessment({ summary: "a".repeat(301) }))).summary;
    expect(s).toHaveLength(300);
    expect(s.endsWith("…")).toBe(true);
  });
});

describe("redactContacts", () => {
  const MARK = "[yhteystieto Hilmassa]";

  it.each([
    ["sähköposti", "Ota yhteyttä matti.meikalainen@example.fi ennen jättöä", `Ota yhteyttä ${MARK} ennen jättöä`],
    ["matkapuhelin", "Soita 040 123 4567 iltapäivällä", `Soita ${MARK} iltapäivällä`],
    ["lankapuhelin", "Puh. 09-310 12345", `Puh. ${MARK}`],
    ["+358 kansainvälinen muoto", "Soita +358 (0)40 123 4567 pian", `Soita ${MARK} pian`],
    ["sähköposti kirjoitettuna (at)", "Kysy matti(at)hel.fi", `Kysy ${MARK}`],
  ])("poistaa yhteystiedon: %s", (_name, input, expected) => {
    expect(redactContacts(input)).toBe(expected);
  });

  it.each([
    ["CPV-koodit", "CPV 45331000 ja 09310000"],
    ["Y-tunnus", "Y-tunnus 1234567-8"],
    ["rahasumma", "Arvo 1 200 000 € tai 250 000 euroa"],
    ["päivämäärät", "Määräaika 31.12.2026, julkaistu 01.02.2026"],
    ["viitenumerot", "Tunniste 2026-0123456789, viite MAT-0400123456"],
  ])("säilyttää ei-yhteystiedon ennallaan: %s", (_name, input) => {
    expect(redactContacts(input)).toBe(input);
  });
});
