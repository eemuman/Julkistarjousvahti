import type { ListedTender } from "../api-types.js";
import type { Profile } from "../profile/automation.js";
import { assessConfidence } from "../scoring/confidence.js";

/**
 * Rivit julkiseen dataan (eräajo ja offline-varadata). Laskee varmuuden ja tyhjentää kuvauksen.
 *
 * Varmuus lasketaan ennen kuvauksen tyhjennystä, koska kuvauksen pituus on yksi ehdoista. Kuvaus voi sisältää
 * yhteyshenkilöiden sähköposteja ja puhelinnumeroita, eikä web-käyttöliittymä näytä sitä, joten se ei mene tiedostoon.
 * Erän epäonnistunut rivi on jo assessment null (ks. batch.ts), joten sen varmuus on null.
 * Välimuisti toimii, koska avain lasketaan ennen tätä kohtaa.
 */
export function toPublicItems(items: ListedTender[], profile: Profile): ListedTender[] {
  return items.map((row) => ({
    ...row,
    confidence: assessConfidence(row.tender, row.assessment, profile),
    tender: { ...row.tender, description: "" },
  }));
}
