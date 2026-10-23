/**
 * Kirjoittaa UI:n offline-varadatan TendersResponse-muodossa. Arviot ovat valmiina (FixtureAssessor),
 * joten ei AI-kutsuja eikä verkkoa.
 *
 *   node --experimental-strip-types scripts/export-fixtures.ts <tulostiedosto>
 */
import { writeFileSync } from "node:fs";
import {
  automationProfile,
  exampleTenders,
  FixtureAssessor,
  type ListedTender,
  toListedTender,
  toPublicItems,
  type TendersResponse,
} from "@tarjousvahti/core";

const out = process.argv[2] ?? "sample.json";
const tenders = exampleTenders();
const assessor = new FixtureAssessor();

const rows: ListedTender[] = [];
for (const tender of tenders) {
  const listed = toListedTender(tender, automationProfile);
  if (!listed) continue;
  const assessment = await assessor.assess(tender);
  rows.push({ ...listed, assessment });
}
// Sama julkinen muoto kuin eräajossa (varmuus, kuvauksen tyhjennys), jotta offline-data vastaa eräajon tulosta.
const items = toPublicItems(rows, automationProfile);

const response: TendersResponse = {
  source: "offline",
  generatedAt: new Date().toISOString(),
  items,
  fetch: { total: tenders.length, days: 0 },
};
writeFileSync(out, JSON.stringify(response, null, 2));
console.log(`Kirjoitettu ${items.length} ilmoitusta → ${out}`);
