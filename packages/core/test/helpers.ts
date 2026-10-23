import { vi } from "vitest";
import type { ListedTender } from "../src/api-types.js";
import { exampleTenders } from "../src/fixtures.js";
import { automationProfile } from "../src/profile/automation.js";
import { toListedTender } from "../src/scoring/ranking.js";
import type { Assessment, Tender } from "../src/types.js";

export const TEST_NOW = new Date("2026-10-23T09:00:00Z");

/** Esimerkki-ilmoitus id:llä (oletus esim-001). */
export function exampleTender(id = "esim-001"): Tender {
  return exampleTenders(TEST_NOW).find((t) => t.id === id)!;
}

const exampleRows = exampleTenders(TEST_NOW)
  .map((t) => toListedTender(t, automationProfile))
  .filter((x): x is ListedTender => x !== null);

/** n riviä esimerkkiilmoituksista, id:t r0..r(n-1). */
export function makeRows(n: number): ListedTender[] {
  return Array.from({ length: n }, (_, i) => {
    const base = exampleRows[i % exampleRows.length]!;
    return { ...base, tender: { ...base.tender, id: `r${i}` } };
  });
}

/** Valekello: sleep vain siirtää kelloa. */
export function fakeClock(start = 1_000_000) {
  let clock = start;
  return {
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
  };
}

/** Kelpaava arvio testeihin. */
export function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    relevance: 50,
    category: "rakennusautomaatio",
    role: "seuraa",
    summary: "arvio",
    reasons: [],
    automationScope: null,
    nextStep: "Ota yhteyttä hankintayksikköön.",
    ...overrides,
  };
}

/** Fetch-korvike, joka palauttaa annetut vastaukset tai heittää virheen järjestyksessä. */
export function mockFetch(steps: (Response | Error)[]) {
  const fetchMock = vi.fn();
  for (const step of steps) {
    if (step instanceof Error) fetchMock.mockRejectedValueOnce(step);
    else fetchMock.mockResolvedValueOnce(step);
  }
  return { fetchMock, fetchImpl: fetchMock as unknown as typeof fetch };
}

/** JSON-vastaus annetulla tilakoodilla ja headereilla. */
export function jsonResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
