import { createHash } from "node:crypto";
import type { ListedTender } from "../api-types.js";
import { buildUserMessage, SYSTEM_PROMPT } from "../scoring/ai.js";
import { assessmentGeminiSchema, assessmentSchema } from "../scoring/schema.js";
import type { Tender } from "../types.js";

/**
 * Arvioiden välimuisti: edellisen ajon arviota käytetään uudelleen, jos ilmoitus ja arviointitapa eivät ole muuttuneet.
 * Web ei tuo tätä moduulia (ks. web.ts), joten node:crypto on täällä turvallinen.
 */

/**
 * Arviointitavan versio: system-prompt, mallille lähetettävä skeema ja mallin nimi.
 * Kun mikä tahansa näistä muuttuu, kaikki arviot lasketaan uudelleen.
 */
export function assessmentVersion(model: string): string {
  return JSON.stringify({ prompt: SYSTEM_PROMPT, schema: assessmentGeminiSchema, model });
}

/**
 * Välimuistiavain: versio + ilmoituksen id + täsmälleen se teksti, joka mallille lähetetään (buildUserMessage).
 * Näin avain kattaa kaikki arvioon vaikuttavat kentät (kind, title, description, buyer, cpv, nuts, arvo, winners)
 * eikä lista pääse eriytymään lähetettävästä datasta. Kentät, joita ei lähetetä (esim. päivämäärät), eivät muuta avainta.
 */
export function assessmentKey(tender: Tender, model: string): string {
  return createHash("sha256")
    .update(`${assessmentVersion(model)}\n${tender.id}\n${buildUserMessage(tender)}`)
    .digest("hex");
}

export interface ReuseResult {
  /** Samassa järjestyksessä kuin listed. Jokaisella rivillä on assessmentKey; uudelleenkäytetyllä myös arvio. */
  items: ListedTender[];
  /** items-taulukon indeksit, jotka pitää arvioida AI:lla. */
  pending: number[];
  /** Montako arviota otettiin välimuistista. */
  reused: number;
}

/**
 * Palauttaa AI-arvioidut rivit niiden alkuperäisiin paikkoihin (reuse.pending) ja säilyttää järjestyksen.
 * assessed on samassa järjestyksessä kuin pending. Heittää, jos määrä tai tender.id ei täsmää: silloin
 * arvio kohdistuisi väärälle ilmoitukselle, eikä sitä saa hiljaa kirjoittaa tiedostoon.
 */
export function mergeAssessed(reuse: ReuseResult, assessed: ListedTender[]): ListedTender[] {
  if (assessed.length !== reuse.pending.length) {
    throw new Error(
      `mergeAssessed: ${assessed.length} arvioitua riviä, mutta ${reuse.pending.length} arvioitavaa paikkaa`,
    );
  }
  const items = [...reuse.items];
  reuse.pending.forEach((index, k) => {
    const row = assessed[k]!;
    const expectedId = items[index]!.tender.id;
    if (row.tender.id !== expectedId) {
      throw new Error(`mergeAssessed: rivi ${k} on ilmoitukselle ${row.tender.id}, odotettiin ${expectedId}`);
    }
    items[index] = row;
  });
  return items;
}

/** Käytetäänkö edellisen ajon riviä sellaisenaan. Vaatii saman avaimen, onnistuneen arvion ja zod-validoinnin. */
function reusableAssessment(prev: ListedTender, key: string): ListedTender["assessment"] {
  if (prev.assessmentKey !== key) return null;
  if (prev.aiFailed === true || prev.assessment == null) return null;
  const parsed = assessmentSchema.safeParse(prev.assessment);
  return parsed.success ? parsed.data : null;
}

/**
 * Jakaa listan rivit välimuistista uudelleenkäytettäviin ja arvioitaviin. Puhdas funktio, ei I/O:ta.
 * Rivit, joilla ei ole edellisessä ajossa kelpaavaa arviota (muuttunut avain, aiFailed, puuttuva tai
 * virheellinen arvio), menevät pending-listalle. Järjestys säilyy.
 */
export function reuseAssessments(
  listed: ListedTender[],
  previousItems: ListedTender[],
  keyOf: (tender: Tender) => string,
): ReuseResult {
  const previousById = new Map<string, ListedTender>();
  for (const prev of previousItems) previousById.set(prev.tender.id, prev);

  const items: ListedTender[] = [];
  const pending: number[] = [];
  let reused = 0;

  listed.forEach((row, index) => {
    const assessmentKey = keyOf(row.tender);
    const prev = previousById.get(row.tender.id);
    const cached = prev ? reusableAssessment(prev, assessmentKey) : null;
    if (cached) {
      items.push({ ...row, assessment: cached, assessmentKey });
      reused++;
    } else {
      // Avain tallennetaan myös tälle riville. Jos arvio epäonnistuu, se ei ole uudelleenkäytettävä (assessment null).
      items.push({ ...row, assessment: null, assessmentKey });
      pending.push(index);
    }
  });

  return { items, pending, reused };
}
