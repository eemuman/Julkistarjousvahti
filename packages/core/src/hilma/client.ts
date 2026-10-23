/**
 * Hilma AVP-Read -asiakas.
 *
 * - Haku on Azure Search -tyylinen POST (search, filter, top, skip, orderby).
 * - Avain headerissa Ocp-Apim-Subscription-Key.
 * - Rajapinta ei palauta CORS-otsakkeita → kutsu aina palvelimelta, ei selaimesta.
 * - Kutsuja rajoitetaan avainkohtaisesti → älä aja tiheämmin kuin tarvitaan.
 */
import { fetchWithRetry, parseRetryAfterMs, type RetryDecision } from "../http.js";

const HILMA_BASE_URL = "https://api.hankintailmoitukset.fi/avp/eformnotices";

export interface HilmaSearchQuery {
  /** OData-filtteri, esim. "datePublished ge 2026-10-01T00:00:00Z".  */
  filter?: string;
  top?: number;
  skip?: number;
  orderby?: string;
  count?: boolean;
}

interface HilmaSearchResponse {
  value: Record<string, unknown>[];
  "@odata.count"?: number;
}

/** Sivutetun haun tulos. total on ensimmäisen sivun @odata.count, tai null jos Hilma ei sitä palauttanut. */
interface SearchAllResult {
  items: Record<string, unknown>[];
  total: number | null;
  truncated: boolean;
}

/** Uudelleenyritys koskee 429:ää ja 5xx:ää. Muut 4xx ovat pysyviä. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Azure Searchin skip-raja (learn.microsoft.com/rest/api/searchservice/documents/search-post). */
const MAX_SKIP = 100_000;
/** Yläraja 429:n Retry-After-odotukselle. */
const MAX_RETRY_DELAY_MS = 30_000;

export interface HilmaClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

export class HilmaError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "HilmaError";
    this.status = status;
  }
}

export class HilmaClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;

  constructor(opts: HilmaClientOptions) {
    if (!opts.apiKey) throw new Error("HILMA_API_KEY puuttuu");
    this.apiKey = opts.apiKey;
    // Kääre, ettei fetch menetä this-kontekstiaan.
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 1000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async search(query: HilmaSearchQuery): Promise<HilmaSearchResponse> {
    const headers = {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": this.apiKey,
    };
    const body = JSON.stringify({ top: 50, count: true, ...query });

    const result = await fetchWithRetry(
      `${HILMA_BASE_URL}/docs/search`,
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
      throw new HilmaError(`Hilma-yhteysvirhe (${name}) ${result.attempts} yrityksen jälkeen`, null);
    }
    const { res } = result;
    if (res.ok) return (await res.json()) as HilmaSearchResponse;
    throw new HilmaError(`Hilma-haku epäonnistui: ${res.status} ${res.statusText}`, res.status);
  }

  /**
   * 429 ja 5xx yritetään uudelleen. 429:ssä Retry-After (sekunteina) on ensisijainen, yläraja 30 s.
   * Muuten eksponentiaalinen viive: baseDelayMs * 2^attempt (1 s, 2 s, 4 s).
   */
  private decideRetry(res: Response, attempt: number): RetryDecision {
    const exponential = this.baseDelayMs * 2 ** attempt;
    const retryAfter = res.status === 429 ? parseRetryAfterMs(res) : null;
    return {
      retry: isRetryableStatus(res.status),
      delayMs: retryAfter !== null ? Math.min(retryAfter, MAX_RETRY_DELAY_MS) : exponential,
    };
  }

  /**
   * Hakee sivutettuna enintään maxResults kpl. Kertoo, onko tulos katkaistu (osa hakutuloksesta jäi hakematta),
   * jotta kutsuja ei käsittele osittaista erää hiljaa kokonaisena.
   */
  async searchAll(query: HilmaSearchQuery, maxResults: number): Promise<SearchAllResult> {
    const pageSize = Math.min(query.top ?? 100, 100);
    // Sivukoko 0 tai alle ei etene skipissä, joten silmukka jäisi ikuiseksi.
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      throw new RangeError(`top pitää olla kokonaisluku vähintään 1, sai ${query.top}`);
    }
    const limit = Math.min(maxResults, MAX_SKIP);
    const items: Record<string, unknown>[] = [];
    let total: number | null = null;
    let lastPageFull = false;
    for (let skip = 0; skip < limit; skip += pageSize) {
      const page = await this.search({ ...query, top: pageSize, skip });
      if (skip === 0) {
        const count = page["@odata.count"];
        total = typeof count === "number" ? count : null;
      }
      items.push(...page.value);
      lastPageFull = page.value.length >= pageSize;
      if (!lastPageFull) break;
      if (total !== null && items.length >= total) break;
    }
    const out = items.slice(0, limit);
    const truncated = total !== null ? out.length < total : lastPageFull && out.length >= limit;
    return { items: out, total, truncated };
  }
}
