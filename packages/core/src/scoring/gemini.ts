import { fetchWithRetry, parseRetryAfterMs, type RetryDecision } from "../http.js";
import type { Assessment, Tender } from "../types.js";
import { type Assessor, buildUserMessage, parseAssessment, SYSTEM_PROMPT } from "./ai.js";
import { assessmentGeminiSchema } from "./schema.js";

/** Oletusmalli, jota provider.ts käyttää, kun GEMINI_MODEL ei ole asetettu. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
/** Uudelleenyritys koskee 429:ää, 503:a, aikakatkaisua ja verkkovirheitä. Muut virheet ovat pysyviä (esim. väärä avain tai pyyntö). */
const RETRYABLE_STATUSES = new Set([429, 503]);
/** Pysyvät pyyntö- ja avainvirheet: 400 (virheellinen pyyntö), 401/403 (avain), 404 (tuntematon malli). */
const FATAL_STATUSES = new Set([400, 401, 403, 404]);
/** Yksittäisen odotuksen yläraja, kun odotusaika tulee palvelimelta (Retry-After tai RetryInfo). */
const MAX_RETRY_DELAY_MS = 60_000;
/** Virhebodysta lainataan viestiin vain lyhyt pätkä, ettei mitään arkaluonteista pääse lokiin. */
const MAX_ERROR_DETAIL_CHARS = 200;

export interface GeminiAssessorOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export class GeminiError extends Error {
  readonly status: number | null;
  /**
   * true = palvelun tilaan liittyvä virhe (verkko, aikakatkaisu, 429, 5xx). false = mallin sisältövirhe
   * (esim. estetty, tyhjä tai keskeytynyt vastaus). Eräajo laskee peräkkäisiksi vain transient-virheet.
   */
  readonly transient: boolean;
  /**
   * true = virhe, joka koskee koko avainta tai asetuksia (väärä avain, kielletty pääsy, tuntematon malli).
   * Sama virhe toistuisi jokaisella rivillä, joten erä pysäytetään heti.
   */
  readonly fatal: boolean;

  constructor(message: string, status: number | null, transient = false) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.transient = transient;
    this.fatal = status !== null && FATAL_STATUSES.has(status);
  }
}

/** Minimirajapinta Gemini-vastaukselle: vain kentät, joita luetaan. */
interface GeminiResponse {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
}

export class GeminiAssessor implements Assessor {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;

  constructor(opts: GeminiAssessorOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_GEMINI_MODEL;
    // Kääre, ettei fetch menetä this-kontekstiaan.
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
    this.maxRetries = opts.maxRetries ?? 2;
    this.baseDelayMs = opts.baseDelayMs ?? 1000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  async assess(tender: Tender): Promise<Assessment> {
    // Avain kulkee vain headerissa, ei URL:ssa.
    const url = `${BASE_URL}/${encodeURIComponent(this.model)}:generateContent`;
    const headers = { "content-type": "application/json", "x-goog-api-key": this.apiKey };
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: buildUserMessage(tender) }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseJsonSchema: assessmentGeminiSchema,
      },
    });

    const result = await fetchWithRetry(
      url,
      { method: "POST", headers, body },
      {
        fetchImpl: this.fetchImpl,
        sleep: this.sleep,
        maxRetries: this.maxRetries,
        baseDelayMs: this.baseDelayMs,
        timeoutMs: this.timeoutMs,
        decide: (res, attempt) => this.decideRetry(res, attempt),
      },
    );

    if (result.kind === "network") {
      const name = result.error instanceof Error ? result.error.name : "virhe";
      throw new GeminiError(`Gemini-yhteysvirhe (${name}) ${result.attempts} yrityksen jälkeen`, null, true);
    }
    const { res } = result;
    if (res.ok) {
      const data = (await res.json()) as GeminiResponse;
      return parseAssessment(extractText(data));
    }

    const { detail } = await readErrorBody(res, this.apiKey);
    const transient = res.status === 429 || (res.status >= 500 && res.status <= 599);
    throw new GeminiError(`Gemini-virhe ${res.status}${detail ? `: ${detail}` : ""}`, res.status, transient);
  }

  /**
   * Päättää uudelleenyrityksen 429:stä ja 503:sta. Odotusaika: RetryInfo.retryDelay (error.details) ensin,
   * sitten Retry-After-header, muuten eksponentiaalinen viive baseDelayMs * 2^attempt. Yläraja 60 s.
   */
  private async decideRetry(res: Response, attempt: number): Promise<RetryDecision> {
    // Klooni, jotta sama body voidaan lukea myöhemmin virheviestiä varten.
    const { retryDelayMs } = await readErrorBody(res.clone(), this.apiKey);
    const ms = retryDelayMs ?? parseRetryAfterMs(res) ?? this.baseDelayMs * 2 ** attempt;
    return { retry: RETRYABLE_STATUSES.has(res.status), delayMs: Math.min(ms, MAX_RETRY_DELAY_MS) };
  }
}

/** Poimii vastauksesta tekstin. Estetty tai keskeytynyt vastaus on virhe, koska JSON olisi katkaistu. */
function extractText(data: GeminiResponse): string {
  const blockReason = data.promptFeedback?.blockReason;
  if (blockReason) throw new GeminiError(`Gemini esti pyynnön: ${blockReason}`, null);

  const candidate = data.candidates?.[0];
  if (!candidate) throw new GeminiError("Gemini ei palauttanut vastausta", null);
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new GeminiError(`Gemini keskeytti vastauksen: ${candidate.finishReason}`, null);
  }
  return (candidate.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

/**
 * Lukee virhebodyn: lainaa viestiin vain error.status ja error.message (poistaa avaimen, jos se heijastuu takaisin),
 * ja palauttaa RetryInfo-odotusajan, jos sellainen on.
 */
async function readErrorBody(
  res: Response,
  apiKey: string,
): Promise<{ detail: string; retryDelayMs: number | null }> {
  const text = await res.text().catch(() => "");
  let detail = "";
  let retryDelayMs: number | null = null;
  try {
    const err = (JSON.parse(text) as GeminiErrorBody).error;
    detail = [err?.status, err?.message].filter((v): v is string => typeof v === "string").join(": ");
    retryDelayMs = retryInfoDelayMs(err?.details);
  } catch {
    // Ei JSON-muotoa: bodya ei liitetä viestiin eikä odotusaikaa lueta.
  }
  if (apiKey) detail = detail.split(apiKey).join("[poistettu]");
  return { detail: detail.slice(0, MAX_ERROR_DETAIL_CHARS), retryDelayMs };
}

/** Virhebodyn muoto. Luetaan vain error.status, error.message ja error.details (RetryInfo). */
interface GeminiErrorBody {
  error?: { status?: unknown; message?: unknown; details?: unknown };
}

/**
 * Hakee error.details-listasta RetryInfo-kohdan retryDelay-kentän (protobuf Duration, esim. "17s" tai "0.5s").
 * Palauttaa millisekunnit tai null, jos kenttää ei ole tai sen muoto on tuntematon.
 */
function retryInfoDelayMs(details: unknown): number | null {
  if (!Array.isArray(details)) return null;
  for (const item of details) {
    if (!item || typeof item !== "object") continue;
    const { "@type": type, retryDelay } = item as Record<string, unknown>;
    if (typeof type !== "string" || !type.endsWith("RetryInfo")) continue;
    const match = typeof retryDelay === "string" ? /^(\d+(?:\.\d+)?)s$/.exec(retryDelay.trim()) : null;
    if (match) return Number(match[1]) * 1000;
  }
  return null;
}
