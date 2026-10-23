import { describe, expect, it } from "vitest";
import { isCancellationTitle, normalizeTender } from "../src/hilma/normalize.js";

describe("normalizeTender", () => {
  it("poimii kentät, jakaa CPV-koodit ja voittajat ja tunnistaa keskeytyksen", () => {
    const t = normalizeTender({
      id: "EF-1",
      titleFi: "Rakennusautomaation saneeraus",
      organisationNameFi: "Testikunta",
      cpvCodes: "42961000 45331000",
      nutsCodes: "FI197",
      datePublished: "2026-10-20T08:00:00Z",
      deadline: "2026-11-15T12:00:00Z",
      estimatedValue: 420000,
      mainType: "ContractNotices",
      winnerOrganisations: "A Oy (123-4)//Esimerkki Oy, Oulu (1234567-8)",
    });
    expect(t).toMatchObject({
      id: "EF-1",
      title: "Rakennusautomaation saneeraus",
      buyer: "Testikunta",
      cpvCodes: ["42961000", "45331000"],
      nutsCodes: ["FI197"],
      estimatedValueEur: 420000,
      kind: "contract",
      deadline: "2026-11-15T12:00:00.000Z",
      winners: ["A Oy (123-4)", "Esimerkki Oy, Oulu (1234567-8)"],
    });
  });

  it.each([
    ["Keskeytysilmoitus Maanteiden hoitourakka Oulu", true],
    ["KESTEYTETTY: hankinta Tampereen kaupunki", true],
    ["Hankinta keskeytetään Helsingin kaupunki", true],
    ["Keskeytymättömän sähkönsyötön (UPS) laitteet", false],
  ])("otsikon '%s' keskeytys → %s", (title, expected) => {
    expect(isCancellationTitle(title)).toBe(expected);
  });
});
