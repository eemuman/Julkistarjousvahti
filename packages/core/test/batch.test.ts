import { describe, expect, it } from "vitest";
import type { Assessor } from "../src/scoring/ai.js";
import { GeminiError } from "../src/scoring/gemini.js";
import { assessAll, runExitCode, type RunExitInput } from "../src/service/batch.js";
import { fakeClock, makeAssessment, makeRows } from "./helpers.js";

const ok = makeAssessment();

function assessorThatCounts(error?: Error) {
  const counter = { calls: 0 };
  const assessor: Assessor = {
    assess: async () => {
      counter.calls++;
      if (error) throw error;
      return ok;
    },
  };
  return { assessor, counter };
}

const exit = (o: Partial<RunExitInput>): RunExitInput => ({
  truncated: false,
  pending: 0,
  assessed: 0,
  failed: 0,
  reused: 0,
  fatal: false,
  ...o,
});

describe("runExitCode", () => {
  it.each<[string, Partial<RunExitInput>, number]>([
    ["yksi epäonnistuminen 176 välimuistista → 0", { pending: 1, failed: 1, reused: 176 }, 0],
    ["ei arvioita eikä välimuistia (kutsuraja 0) → 2", { pending: 5 }, 2],
    ["kaikki uudet epäonnistuivat → 2", { pending: 177, failed: 5 }, 2],
    ["pysyvä virhe → 3, vaikka välimuistista on arvioita", { pending: 150, failed: 1, reused: 176, fatal: true }, 3],
    ["katkaisu → 1, ohittaa fatal-tilan", { truncated: true, pending: 5, failed: 1, fatal: true }, 1],
  ])("%s", (_name, input, code) => {
    expect(runExitCode(exit(input))).toBe(code);
  });
});

describe("assessAll", () => {
  it("maxAssessments 0: yksikään kutsu ei tehdy, kaikki skipped, ei fatal", async () => {
    const { assessor, counter } = assessorThatCounts();
    const result = await assessAll(makeRows(3), assessor, { ...fakeClock(), minIntervalMs: 0, maxAssessments: 0 });
    expect(counter.calls).toBe(0);
    expect(result).toMatchObject({ assessed: 0, failed: 0, skipped: 3, fatal: false });
  });

  it("aikabudjetin ylityttyä uusia kutsuja ei aloiteta, loput merkitään skippedByDeadline-riveiksi", async () => {
    const clock = fakeClock();
    const { assessor, counter } = assessorThatCounts();
    // Vuorot 0, 1000 ja 2000 ovat ennen rajaa; 3000 on sen jälkeen.
    const result = await assessAll(makeRows(10), assessor, {
      ...clock,
      concurrency: 1,
      minIntervalMs: 1000,
      deadlineMs: clock.now() + 2500,
    });
    expect(counter.calls).toBe(3);
    expect(result).toMatchObject({ assessed: 3, skipped: 7, skippedByDeadline: 7 });
  });

  it.each<[string, number, GeminiError, number, boolean]>([
    ["palvelun virheet (429) pysäyttävät viiden peräkkäisen jälkeen", 8, new GeminiError("kiintiö", 429, true), 5, false],
    ["pysyvä 401 pysäyttää heti ja merkitsee erän fatal-tilaan", 150, new GeminiError("väärä avain", 401), 1, true],
  ])("%s", async (_name, n, error, calls, fatal) => {
    const { assessor, counter } = assessorThatCounts(error);
    const result = await assessAll(makeRows(n), assessor, {
      ...fakeClock(),
      concurrency: 1,
      minIntervalMs: 0,
      maxConsecutiveFailures: 5,
    });
    expect(counter.calls).toBe(calls);
    expect(result).toMatchObject({ failed: calls, skipped: n - calls, fatal });
  });
});
