import { describe, expect, it } from "vitest";
import { automationProfile } from "../src/profile/automation.js";
import { prefilter } from "../src/scoring/prefilter.js";
import type { Tender } from "../src/types.js";
import { exampleTender } from "./helpers.js";

const make = (title: string, cpvCodes: string[]): Tender => ({ ...exampleTender(), title, description: "", cpvCodes });

describe("prefilter", () => {
  it.each<[string, string, string[], boolean]>([
    ["suora CPV ohittaa negatiivisen sanan", "Kokonaisurakka ja siivous", ["45331000"], true],
    ["heikko osuma + negatiivinen sana karsitaan", "Kokonaisurakka ja siivous", [], false],
    ["vahva avainsana päästää läpi negatiivisen sanan rinnalla", "Rakennusautomaatio ja siivous", [], true],
  ])("%s", (_name, title, cpv, pass) => {
    expect(prefilter(make(title, cpv), automationProfile).pass).toBe(pass);
  });
});
