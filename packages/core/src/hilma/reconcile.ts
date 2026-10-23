import type { Tender } from "../types.js";

/**
 * Ratkaisee erän korvaukset ja keskeytykset. Ei I/O:ta. Palauttaa arvioitavat ilmoitukset: ei keskeytettyjä menettelyjä, ei korvattuja versioita.
 *
 * Hilman indeksissä on vain ilmoituksen uusin versio, joten korvattu versio ei tule hakutuloksiin.
 * Haku kootaan joka ajossa kokonaan uudelleen, joten korvattua versiota ei tarvitse poistaa mistään.
 * Keskeytys on oma ilmoituksensa, ja alkuperäinen tarjouspyyntö jää indeksiin ilman merkintää, joten
 * keskeytetty menettely tunnistetaan saman procedureId:n kautta.
 * Rajoite: normalisoidussa Tenderissä ei ole osatunnistetta (lot), joten osan keskeytys poistaa koko menettelyn.
 * Katso docs/ARCHITECTURE.md.
 */
export function reconcile(tenders: Tender[]): Tender[] {
  const supersededIds = new Set(tenders.flatMap((t) => t.supersedes ?? []));
  const cancelledSet = new Set(
    tenders.filter((t) => t.cancelled && t.procedureId).map((t) => t.procedureId as string),
  );
  const isInCancelledProcedure = (t: Tender) => Boolean(t.procedureId && cancelledSet.has(t.procedureId));

  return tenders.filter((t) => !t.cancelled && !supersededIds.has(t.id) && !isInCancelledProcedure(t));
}
