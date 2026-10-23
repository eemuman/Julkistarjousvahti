import { describe, expect, it } from "vitest";
import { reconcile } from "../src/hilma/reconcile.js";
import type { Tender } from "../src/types.js";

/** Tender oletusarvoilla, kentät ylikirjoitetaan testin mukaan. */
function tender(overrides: Partial<Tender> & { id: string }): Tender {
  return {
    kind: "contract",
    title: "",
    description: "",
    buyer: "",
    cpvCodes: [],
    nutsCodes: [],
    deadline: null,
    estimatedValueEur: null,
    winners: [],
    url: "",
    procedureId: null,
    supersedes: [],
    cancelled: false,
    ...overrides,
  };
}

describe("reconcile", () => {
  it.each<[string, Tender[], string[]]>([
    [
      "keskeytys poistaa koko menettelyn (myös osa-ilmoitukset), muut säilyvät",
      [
        tender({ id: "EF-59007", procedureId: "38402" }),
        tender({ id: "EF-60075", procedureId: "38402", cancelled: true }),
        tender({ id: "EF-3", procedureId: "999" }),
      ],
      ["EF-3"],
    ],
    [
      "korvaava ilmoitus poistaa korvatun version",
      [tender({ id: "EF-1" }), tender({ id: "EF-2", supersedes: ["EF-1"] })],
      ["EF-2"],
    ],
  ])("%s", (_name, input, expectedIds) => {
    expect(reconcile(input).map((t) => t.id)).toEqual(expectedIds);
  });
});
