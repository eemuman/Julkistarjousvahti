import { describe, expect, it, vi } from "vitest";
import { GeminiAssessor, GeminiError } from "../src/scoring/gemini.js";
import { exampleTender, jsonResponse, mockFetch } from "./helpers.js";

const validJson = JSON.stringify({
  relevance: 90,
  category: "rakennusautomaatio",
  role: "suora_tarjous",
  summary: "Rakennusautomaation saneeraus.",
  reasons: ["DDC-alakeskukset ovat kohdeyrityksen ydinosaamista."],
  automationScope: "DDC ja valvomo",
  nextStep: "Lataa tarjouspyyntöasiakirjat ja tarkista huoltosopimus.",
});

const okBody = (text: string) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] });

/** 429-virhebody, jossa on RetryInfo-kohta (Googlen rpc-muoto). */
const retryBody = (retryDelay: string) => ({
  error: {
    status: "RESOURCE_EXHAUSTED",
    message: "Quota exceeded",
    details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay }],
  },
});

function assessorWith(steps: (Response | Error)[], extra: { maxRetries?: number } = {}) {
  const { fetchImpl } = mockFetch(steps);
  const sleep = vi.fn(async (_ms: number) => {});
  const assessor = new GeminiAssessor({ apiKey: "TEST-KEY-abc123", fetch: fetchImpl, sleep, ...extra });
  return { assessor, sleep };
}

describe("GeminiAssessor", () => {
  it("RetryInfo.retryDelay (17 s) antaa odotusajan ja uusinta onnistuu", async () => {
    const { assessor, sleep } = assessorWith([jsonResponse(429, retryBody("17s")), jsonResponse(200, okBody(validJson))]);
    const a = await assessor.assess(exampleTender());
    expect(a.relevance).toBe(90);
    expect(sleep).toHaveBeenCalledWith(17_000);
  });

  it.each<[string, number, boolean, boolean]>([
    ["429 on palvelun tilaan liittyvä: transient, ei fatal", 429, true, false],
    ["401 on avainvirhe: ei transient, fatal", 401, false, true],
  ])("%s", async (_name, status, transient, fatal) => {
    const { assessor } = assessorWith([jsonResponse(status, { error: { status: "VIRHE" } })], { maxRetries: 0 });
    const err = (await assessor.assess(exampleTender()).catch((e: unknown) => e)) as GeminiError;
    expect(err).toBeInstanceOf(GeminiError);
    expect(err.status).toBe(status);
    expect(err.transient).toBe(transient);
    expect(err.fatal).toBe(fatal);
  });
});
