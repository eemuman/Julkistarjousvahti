import { describe, expect, it } from "vitest";
import { automationProfile } from "../src/profile/automation.js";
import { rankTenders, toListedTender } from "../src/scoring/ranking.js";
import { applyRules } from "../src/scoring/rules.js";
import { exampleTender, makeAssessment, TEST_NOW } from "./helpers.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(TEST_NOW.getTime() + days * DAY_MS).toISOString();

describe("ranking ja prioriteetti", () => {
  it("väliaikainen arvio on enintään normaali eikä saa priorityReasonia", () => {
    const base = toListedTender(exampleTender(), automationProfile)!;
    const item = { ...base, preScore: 75, tender: { ...base.tender, deadline: inDays(3) } };
    const [r] = rankTenders([item], TEST_NOW);
    expect(r).toMatchObject({ provisional: true, visible: true, priority: "normaali", priorityReason: null });
  });

  it("kiireellinen määräaika nostaa prioriteetin korkeaksi ja kertoo syyn", () => {
    const t = { ...exampleTender(), deadline: inDays(5) };
    const r = applyRules(t, makeAssessment({ relevance: 75, role: "suora_tarjous" }), "office", TEST_NOW);
    expect(r.priority).toBe("korkea");
    expect(r.priorityReason).toBe("määräaika 5 pv");
  });
});
