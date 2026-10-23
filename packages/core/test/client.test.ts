import { describe, expect, it, vi } from "vitest";
import { HilmaClient } from "../src/hilma/client.js";
import { jsonResponse, mockFetch } from "./helpers.js";

const item = (id: string) => ({ id });

describe("HilmaClient.search: uudelleenyritys", () => {
  it("503 onnistuu toisella yrityksellä viiveen 1 s jälkeen", async () => {
    const { fetchMock, fetchImpl } = mockFetch([jsonResponse(503), jsonResponse(200, { value: [item("EF-1")] })]);
    const sleep = vi.fn(async (_ms: number) => {});
    const client = new HilmaClient({ apiKey: "test", fetchImpl, sleep });

    const r = await client.search({});
    expect(r.value).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });
});

describe("HilmaClient.searchAll: sivutus ja katkaisu", () => {
  const twoItems = { value: [item("a"), item("b")] };
  it.each<[string, object[], number, { total: number | null; items: number; truncated: boolean }]>([
    [
      "total puuttuu, sivut täynnä ja raja saavutettu → katkaistu",
      [twoItems, twoItems],
      4,
      { total: null, items: 4, truncated: true },
    ],
    [
      "limit alle total → katkaistu, vaikka sivut täysiä",
      [
        { ...twoItems, "@odata.count": 5 },
        { ...twoItems, "@odata.count": 5 },
      ],
      3,
      { total: 5, items: 3, truncated: true },
    ],
    [
      "items >= total → haku loppuu, ei katkaistu",
      [{ ...twoItems, "@odata.count": 2 }],
      10,
      { total: 2, items: 2, truncated: false },
    ],
  ])("%s", async (_name, pages, limit, expected) => {
    const { fetchImpl } = mockFetch(pages.map((body) => jsonResponse(200, body)));
    const client = new HilmaClient({ apiKey: "test", fetchImpl });

    const r = await client.searchAll({ top: 2 }, limit);
    expect(r).toMatchObject({ total: expected.total, truncated: expected.truncated });
    expect(r.items).toHaveLength(expected.items);
  });
});
