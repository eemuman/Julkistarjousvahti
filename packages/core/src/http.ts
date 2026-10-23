/**
 * Yhteinen uudelleenyritys HTTP-kutsuille (Hilma, Gemini).
 *
 * Verkkovirheet ja aikakatkaisut yritetään aina uudelleen, kunnes yrityksiä on jäljellä.
 * HTTP-virheissä päätös (yritetäänkö, kuinka kauan odotetaan) tulee kutsujan antamalta callbackilta.
 */

/** Kutsujan päätös ei-onnistuneesta HTTP-vastauksesta. */
export interface RetryDecision {
  /** true = yritetään uudelleen, jos yrityksiä on jäljellä. */
  retry: boolean;
  /** Odotus ennen seuraavaa yritystä millisekunteina. */
  delayMs: number;
}

export interface FetchWithRetryOptions {
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** Uudelleenyritysten määrä; yrityksiä on yhteensä maxRetries + 1. */
  maxRetries: number;
  /** Verkkovirheen oletusviive: baseDelayMs * 2^attempt. */
  baseDelayMs: number;
  timeoutMs: number;
  /**
   * Päättää ei-onnistuneesta vastauksesta. Kutsutaan vain, kun uudelleenyrityksiä on jäljellä.
   * Jos luet vastauksen bodyn, lue klooni (res.clone()), koska alkuperäinen vastaus välitetään kutsujalle.
   */
  decide: (res: Response, attempt: number) => RetryDecision | Promise<RetryDecision>;
}

export type FetchWithRetryResult =
  /** Vastaus saatiin: onnistunut (res.ok) tai lopullinen HTTP-virhe, jota kutsuja käsittelee. */
  | { kind: "response"; res: Response; attempts: number }
  /** Verkko- tai aikakatkaisuvirhe, eikä yrityksiä jäänyt. */
  | { kind: "network"; error: unknown; attempts: number };

/**
 * Hakee URL:n uudelleenyrityksin. Palauttaa aina tuloksen eikä heitä virheitä,
 * jotta kutsuja päättää virheviestin ja -tyypin.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: FetchWithRetryOptions,
): Promise<FetchWithRetryResult> {
  for (let attempt = 0; ; attempt++) {
    const attempts = attempt + 1;
    let res: Response;
    try {
      res = await opts.fetchImpl(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs) });
    } catch (error) {
      if (attempt >= opts.maxRetries) return { kind: "network", error, attempts };
      await opts.sleep(opts.baseDelayMs * 2 ** attempt);
      continue;
    }

    if (res.ok || attempt >= opts.maxRetries) return { kind: "response", res, attempts };

    const decision = await opts.decide(res, attempt);
    if (!decision.retry) return { kind: "response", res, attempts };
    await opts.sleep(decision.delayMs);
  }
}

/**
 * Retry-After-headerin arvo millisekunteina. Hyväksytään vain pelkkä numero (sekunteina).
 * Palauttaa null, jos headeria ei ole tai sen muoto on tuntematon.
 */
export function parseRetryAfterMs(res: Response): number | null {
  const header = res.headers.get("retry-after")?.trim() ?? "";
  if (!/^\d+(\.\d+)?$/.test(header)) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}
