import { describe, expect, it } from "vitest";
import { fetchNotices } from "../src/hilma/fetch.js";

describe("fetchNotices", () => {
  it("rajaa julkaistuihin ja voimassa oleviin ja järjestää datePublished ja id mukaan", async () => {
    const calls: { filter: string; orderby: string }[] = [];
    const client = {
      searchAll: async (query: { filter: string; orderby: string }) => {
        calls.push(query);
        return { items: [], total: 0, truncated: false };
      },
    };
    await fetchNotices(client, { since: "2026-10-01T00:00:00.000Z", now: "2026-10-23T12:00:00.000Z", max: 2000 });

    expect(calls[0]!.filter).toBe(
      "(datePublished ge 2026-10-01T00:00:00.000Z) or (deadline ge 2026-10-23T12:00:00.000Z)",
    );
    expect(calls[0]!.orderby).toBe("datePublished asc, id asc");
  });
});
