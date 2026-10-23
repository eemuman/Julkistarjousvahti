import { isListedTender, type TendersResponse } from "@tarjousvahti/core/web";

/**
 * Kaikki staattiset tiedostot haetaan BASE_URL:n kautta, jotta ne toimivat GitHub Pagesin alipolulla.
 */
const BASE = import.meta.env.BASE_URL;

/**
 * Lukee eräajon tuloksen data.json:sta. Jos sitä ei saa tai sen muoto on väärä, käytetään web-buildin
 * mukana tulevaa offline-varadataa (sample.json).
 */
export async function fetchTenders(): Promise<TendersResponse> {
  const data = await fetchStaticData();
  if (data) return data;
  return fetchOfflineSample();
}

/** Lukee eräajon tuloksen. Palauttaa null, jos tiedosto puuttuu, ei ole luettavissa tai sen muoto on väärä. */
async function fetchStaticData(): Promise<TendersResponse | null> {
  try {
    const res = await fetch(`${BASE}data.json`, { cache: "no-cache" });
    if (!res.ok) return null;
    return validate(await res.json());
  } catch {
    return null;
  }
}

/** Offline-varadata, jonka build tallentaa sample.json-tiedostoon. */
async function fetchOfflineSample(): Promise<TendersResponse> {
  const res = await fetch(`${BASE}sample.json`);
  if (!res.ok) throw new Error(`Varadatan lataus epäonnistui (HTTP ${res.status})`);
  const data = validate(await res.json());
  if (!data) throw new Error("Varadatan muoto on virheellinen");
  return { ...data, source: "offline" };
}

/**
 * Kevyt muototarkistus ilman zodia. Kokonaisen datan muoto hylätään (null), jos items ei ole taulukko.
 * Yksittäinen rivi suodatetaan pois, jos sillä ei ole tender-objektia, jossa id ja title ovat merkkijonoja.
 * Muut kentät luotetaan: rivin puutteellinen rakenne jää ErrorBoundaryn varaan.
 */
function validate(raw: unknown): TendersResponse | null {
  if (typeof raw !== "object" || raw === null) return null;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return null;

  const valid = items.filter(isListedTender);
  if (valid.length < items.length) {
    console.warn(`Hylättiin ${items.length - valid.length} virheellistä riviä`);
  }
  const data = raw as Partial<TendersResponse>;
  return {
    ...(data as TendersResponse),
    items: valid,
    // Täydentää kentät, jotka tiedostosta voivat puuttua (esim. fetch).
    fetch: data.fetch ?? { total: null, days: 0 },
  };
}
