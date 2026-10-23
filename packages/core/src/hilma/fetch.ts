import type { Tender } from "../types.js";
import type { HilmaClient } from "./client.js";
import { normalizeTender } from "./normalize.js";
import { reconcile } from "./reconcile.js";

/** Hilman päivämääräkenttä, jonka mukaan haku rajataan ja järjestetään. */
const DATE_FIELD = "datePublished";

export interface FetchNoticesOptions {
  /** Haetaan ilmoitukset, jotka on julkaistu tämän hetken (ISO-aika) jälkeen. */
  since: string;
  /** Hetki, jolla määräajan tulevaisuus tarkistetaan (ISO-aika). Oletus: nykyhetki. */
  now?: string;
  /** Enimmäismäärä ilmoituksia. Pakollinen: kutsuja valitsee katon (eräajo MAX_NOTICES). */
  max: number;
}

export interface FetchNoticesResult {
  /** Hilman raakarivit sellaisinaan. */
  raw: Record<string, unknown>[];
  /** Korvausten ja keskeytysten jälkeen jäävät ilmoitukset. */
  reconciled: Tender[];
  /** Hilman ilmoittama kokonaismäärä, tai null jos ei tiedossa. */
  total: number | null;
  /** true, jos haku katkaistiin max-rajaan ennen kokonaismäärää. */
  truncated: boolean;
}

/**
 * Yhteinen Hilma-hakuketju: haku → normalisointi → id-suodatus → korvaukset ja keskeytykset.
 * Käytössä päivittäisessä eräajossa (scripts/build-data.ts, GitHub Actions).
 *
 * Haku palauttaa ilmoitukset, jotka on julkaistu since-hetken jälkeen TAI joiden määräaika on
 * vielä tulevaisuudessa (now). Näin avoin tarjouspyyntö säilyy listalla, kunnes sen määräaika menee.
 * Tulos on aina päivämäärän mukaan nousevassa järjestyksessä. Jos haku katkaistiin max-rajaan,
 * result.truncated on true.
 */
export async function fetchNotices(
  client: Pick<HilmaClient, "searchAll">,
  opts: FetchNoticesOptions,
): Promise<FetchNoticesResult> {
  const now = opts.now ?? new Date().toISOString();
  const result = await client.searchAll(
    {
      filter: `(${DATE_FIELD} ge ${opts.since}) or (deadline ge ${now})`,
      // id toisena järjestysavaimena: sivutus pysyy vakaana, kun useammalla ilmoituksella on sama päivämäärä.
      orderby: `${DATE_FIELD} asc, id asc`,
    },
    opts.max,
  );
  const raw = result.items;
  const tenders: Tender[] = raw.map(normalizeTender).filter((t) => t.id);
  const reconciled = reconcile(tenders);
  return { raw, reconciled, total: result.total, truncated: result.truncated };
}
