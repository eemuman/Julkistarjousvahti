import { describe, expect, it } from "vitest";
import type { ListedTender } from "../src/api-types.js";
import { assessmentKey, mergeAssessed, reuseAssessments } from "../src/service/cache.js";
import type { Tender } from "../src/types.js";
import { makeAssessment, makeRows } from "./helpers.js";

const keyOf = (t: Tender) => assessmentKey(t, "malli-a");
const good = makeAssessment({ relevance: 70, role: "aliurakka", summary: "Vanha arvio.", reasons: ["peruste"] });

/** Edellisen ajon rivit: samat rivit, joilla on avain ja arvio. */
function previousOf(rows: ListedTender[]): ListedTender[] {
  return rows.map((row) => ({ ...row, assessment: good, assessmentKey: keyOf(row.tender) }));
}

type Mutate = (rows: ListedTender[]) => ListedTender[];
const same: Mutate = (rows) => rows;
const changedContent: Mutate = (rows) =>
  rows.map((row, i) =>
    i === 1 ? { ...row, tender: { ...row.tender, description: row.tender.description + " Lisäys." } } : row,
  );
const aiFailed: Mutate = (rows) => rows.map((row, i) => (i === 0 ? { ...row, assessment: null, aiFailed: true } : row));

describe("reuseAssessments", () => {
  it.each<[string, Mutate, Mutate, number[]]>([
    ["sama avain: edellinen arvio uudelleenkäytetään", same, same, []],
    ["muuttunut ilmoituksen sisältö: arvioidaan uudelleen", changedContent, same, [1]],
    ["aiFailed-rivi: arvioidaan uudelleen, vaikka avain täsmää", same, aiFailed, [0]],
  ])("%s", (_name, mutateListed, mutatePrevious, pending) => {
    const listed = makeRows(3);
    const result = reuseAssessments(mutateListed(listed), mutatePrevious(previousOf(listed)), keyOf);
    expect(result.pending).toEqual(pending);
    expect(result.reused).toBe(3 - pending.length);
  });

  it("mergeAssessed palauttaa järjestyksen oikein ja hylkää väärän ilmoituksen id:n", () => {
    const listed = makeRows(5);
    // Parilliset rivit ovat edellisessä ajossa, parittomat eivät.
    const reuse = reuseAssessments(listed, previousOf(listed.filter((_, i) => i % 2 === 0)), keyOf);
    expect(reuse.pending).toEqual([1, 3]);

    const assessed = reuse.pending.map((i) => ({
      ...listed[i]!,
      assessment: makeAssessment({ summary: `uusi ${i}` }),
      assessmentKey: keyOf(listed[i]!.tender),
    }));
    const merged = mergeAssessed(reuse, assessed);
    expect(merged.map((r) => r.tender.id)).toEqual(listed.map((r) => r.tender.id));
    expect(merged[1]!.assessment?.summary).toBe("uusi 1");
    expect(merged[0]!.assessment).toEqual(good);

    // Väärässä järjestyksessä id:t eivät täsmää, joten arvio ei saa kohdistua väärälle ilmoitukselle.
    expect(() => mergeAssessed(reuse, [assessed[1]!, assessed[0]!])).toThrow("on ilmoitukselle");
  });
});
