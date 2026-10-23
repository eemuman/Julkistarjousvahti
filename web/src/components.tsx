import {
  formatPrefilterMatches,
  HIGH_MIN_RELEVANCE,
  HIGH_PRIORITY_MIN,
  LARGE_PROJECT_EUR,
  LOW_MIN_RELEVANCE_WITHOUT_SIGNAL,
  NORMAL_PRIORITY_MIN,
  type Ranked,
  type Role,
  SHORT_DESCRIPTION_CHARS,
  SUBCONTRACT_AWARD_BOOST,
  type TendersResponse,
  URGENT_BOOST,
  URGENT_DAYS_MAX,
  VISIBLE_RELEVANCE_MIN,
} from "@tarjousvahti/core/web";

export const ROLE_LABEL: Record<Role, string> = {
  suora_tarjous: "Suora tarjous",
  aliurakka: "Aliurakka",
  seuraa: "Seuraa",
  ohita: "Ohita",
};

const updatedDay = new Intl.DateTimeFormat("fi-FI", { day: "numeric", month: "numeric", timeZone: "Europe/Helsinki" });
const updatedTime = new Intl.DateTimeFormat("fi-FI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" });

/** Staattisen datan päivitysaika, esim. "23.10. klo 14.35" (Helsingin aikaa). */
function formatUpdated(iso: string): string {
  const d = new Date(iso);
  return `${updatedDay.format(d)} klo ${updatedTime.format(d)}`;
}

/** Esisuodatuksen osumat, joita näytetään AI-arvion puuttuessa. */
function prefilterText(r: Ranked): string {
  const { cpv, keywords } = formatPrefilterMatches(r.item.prefilter);
  return `Esisuodatus: CPV ${cpv}, avainsanat ${keywords}`;
}

/** Luettelo "a, b tai c". */
function listOr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} tai ${items[items.length - 1]}`;
}

export function RunSummary({
  data,
  assessedCount,
  highCount,
  aiHiddenCount,
  expiredCount,
  provisionalCount,
}: {
  data: TendersResponse;
  assessedCount: number;
  highCount: number;
  aiHiddenCount: number;
  expiredCount: number;
  provisionalCount: number;
}) {
  const isStatic = data.source === "static";
  const run = data.run;
  // Välimuistista käytetyt arviot ovat myös AI-arvioita, joten ne lasketaan mukaan.
  const reused = run?.reused ?? 0;

  return (
    <>
      <p className="sub">
        {assessedCount} kiinnostavaa · {highCount} korkea prioriteetti
        {aiHiddenCount > 0 && <> · {aiHiddenCount} karsittu AI-arviolla</>}
        {expiredCount > 0 && <> · {expiredCount} määräaika mennyt</>}
        {provisionalCount > 0 && <> · {provisionalCount} arvioimatonta</>}
      </p>
      {isStatic && (
        <>
          <p className="updated">Päivitetty {formatUpdated(run?.finishedAt ?? data.generatedAt)}</p>
          {run && (
            <p className="muted">
              Haettu {run.fetched} · esisuodatus {run.prefiltered} · AI-arvioitu {run.assessed + reused}
              {reused > 0 && <> (uusia {run.assessed})</>}
              {run.skipped > 0 && <> · {run.skipped} ohitettu</>}
              {run.failed > 0 && <> · {run.failed} epäonnistui</>}
            </p>
          )}
        </>
      )}
    </>
  );
}

/**
 * Selite ajotilaston ja otsikon luvuille. Natiivi details, oletuksena suljettu.
 * Ajokohtaiset luvut (päivät, kutsuraja, aikabudjetti) tulevat datasta. Jos kenttä puuttuu, luku jätetään pois.
 * Säännöjen vakiot tulevat coresta, joten selite ja laskenta eivät eroa toisistaan.
 */
export function RunExplainer({
  model,
  days,
  maxAssessments,
  timeBudgetMin,
}: {
  model?: string;
  days?: number;
  maxAssessments?: number;
  timeBudgetMin?: number;
}) {
  const periodText = days !== undefined && days > 0 ? `viimeisen ${days} päivän julkaisut ja ` : "julkaisut ja ";
  const limits: string[] = [];
  if (maxAssessments !== undefined) limits.push(`kutsuraja (${maxAssessments})`);
  if (timeBudgetMin !== undefined) limits.push(`aikabudjetti (${timeBudgetMin} min)`);
  limits.push("peräkkäiset palvelinvirheet", "pysyvä AI-virhe (esim. väärä avain), joka pysäyttää arvioinnin");

  return (
    <details className="explainer">
      <summary>Mitä luvut tarkoittavat?</summary>
      <div className="explainer-body">
        <h3>Luvut</h3>
        <h4>Ajotilasto</h4>
        <dl>
          <div>
            <dt>Haettu</dt>
            <dd>Hilmasta haetut ilmoitukset: {periodText}ilmoitukset, joiden määräaika ei ole vielä mennyt.</dd>
          </div>
          <div>
            <dt>Esisuodatus</dt>
            <dd>
              Keskeytetyt ja korvatut ilmoitukset, päättyneen määräajan ilmoitukset sekä CPV- ja avainsanasuodatuksen ulkopuolelle jäävät poistetaan. Jäljelle jäävät ovat esisuodatuksen läpäisseitä (ei AI:ta).
            </dd>
          </div>
          <div>
            <dt>AI-arvioitu</dt>
            <dd>Ilmoitukset, joilla on AI-arvio: tässä ajossa tehty tai edellisen ajon välimuistista. Sulkeissa on tässä ajossa uudet arviot.</dd>
          </div>
          <div>
            <dt>Ohitettu</dt>
            <dd>
              Esisuodatuksen läpäissyt, mutta tässä ajossa ei arvioitu. Syy: {listOr(limits)}. Arvioidaan seuraavalla ajolla.
            </dd>
          </div>
          <div>
            <dt>Epäonnistui</dt>
            <dd>AI-kutsu epäonnistui. Rivi näkyy esisuodatuksen tiedoilla ja merkinnällä "AI-arvio ei saatavilla".</dd>
          </div>
        </dl>

        <h4>Otsikon luvut</h4>
        <dl>
          <div>
            <dt>kiinnostavaa</dt>
            <dd>AI-arvioidut näkyvät rivit, joiden määräaika ei ole mennyt. Arvioimattomat lasketaan erikseen.</dd>
          </div>
          <div>
            <dt>korkea prioriteetti</dt>
            <dd>Näistä ne, joiden prioriteetti on korkea.</dd>
          </div>
          <div>
            <dt>karsittu AI-arviolla</dt>
            <dd>AI:n arvion perusteella piilotetut: rooli on "ohita" tai relevanssi alle {VISIBLE_RELEVANCE_MIN}.</dd>
          </div>
          <div>
            <dt>määräaika mennyt</dt>
            <dd>Tarjousten määräaika on päättynyt, rivi piilotetaan.</dd>
          </div>
          <div>
            <dt>arvioimatonta</dt>
            <dd>Näkyvät rivit ilman AI-arviota, pelkän esisuodatuksen varassa. Näytetään vain, jos niitä on.</dd>
          </div>
        </dl>

        <h3>Kortin merkinnät</h3>
        <h4>Pallurat</h4>
        <dl>
          <div>
            <dt>
              <span className="dot korkea" /> Punainen
            </dt>
            <dd>Korkea prioriteetti: pisteet vähintään {HIGH_PRIORITY_MIN}.</dd>
          </div>
          <div>
            <dt>
              <span className="dot normaali" /> Keltainen
            </dt>
            <dd>
              Normaali prioriteetti: pisteet {NORMAL_PRIORITY_MIN}–{HIGH_PRIORITY_MIN - 1}.
            </dd>
          </div>
          <div>
            <dt>
              <span className="dot matala" /> Harmaa
            </dt>
            <dd>Matala prioriteetti: pisteet alle {NORMAL_PRIORITY_MIN}.</dd>
          </div>
        </dl>

        <h4>Tagit ja pisteet</h4>
        <dl>
          <div>
            <dt>
              <span className="tag urgent">määräaika 3 pv</span>
            </dt>
            <dd>
              Määräaika enintään {URGENT_DAYS_MAX} päivän päässä. Nostaa prioriteettipisteitä {URGENT_BOOST}.
            </dd>
          </div>
          <div>
            <dt>
              <span className="tag ai-failed">AI-arvio ei saatavilla</span>
            </dt>
            <dd>AI-kutsu epäonnistui. Rivi näkyy esisuodatuksen tiedoilla.</dd>
          </div>
          <div>
            <dt>
              <span className="tag role">Aliurakka</span>
            </dt>
            <dd>AI:n rooli. Ei näy arvioimattomalla rivillä.</dd>
          </div>
          <div>
            <dt>
              <span className="tag">ei AI-arviota</span>
            </dt>
            <dd>Rivi on pelkän esisuodatuksen varassa, ei AI:n arviota.</dd>
          </div>
          <div>
            <dt>
              <span className="tag">iso hanke</span>
            </dt>
            <dd>Arvo vähintään {LARGE_PROJECT_EUR / 1_000_000} miljoonaa euroa.</dd>
          </div>
          <div>
            <dt>
              <span className="tag">voittaja valittu</span> / <span className="tag">hankintasuunnitelma</span>
            </dt>
            <dd>Jälki-ilmoitus, jossa voittaja on listattu, tai hankintasuunnitelma.</dd>
          </div>
          <div>
            <dt>
              <span className="tag">ei toimipistettä alueella</span>
            </dt>
            <dd>Toimipistettä ei löydy ilmoituksen alueesta. Muuten kortissa ja yksityiskohdissa näkyy lähin toimipiste.</dd>
          </div>
          <div>
            <dt>
              <span className="tag">koko Suomi</span>
            </dt>
            <dd>Ilmoitus koskee koko Suomea (alue FI tai FI1), joten lähintä toimipistettä ei yksilöidä.</dd>
          </div>
          <div>
            <dt>
              <span className="tag">laaja alue</span>
            </dt>
            <dd>
              Ilmoitus koskee laajaa aluetta, jonka toimipisteet eroavat toisistaan, joten lähintä toimipistettä ei yksilöidä.
            </dd>
          </div>
          <div>
            <dt>
              <span className="tag">sijainti tuntematon</span>
            </dt>
            <dd>Ilmoituksessa ei ole aluekoodia.</dd>
          </div>
          <div>
            <dt>
              <span className="score">78</span>
            </dt>
            <dd>Kortin oikeassa reunassa on AI-sopivuus (0–100).</dd>
          </div>
          <div>
            <dt>
              <span className="score provisional">42</span>
            </dt>
            <dd>Katkoviivakehys ja himmeä luku: esisuodatuksen pisteet, ei AI:n arvio.</dd>
          </div>
        </dl>

        <h4>Varmuus</h4>
        <p>
          Varmuus kertoo, kuinka hyvin arvio tukeutuu ilmoituksen tietoihin. Sen laskee koodi, ei tekoäly: taso
          seuraa signaalien yhtäpitävyyttä (suora CPV- tai avainsanaosuma, aliurakkana rakennushankkeen CPV, kuvauksen
          pituus ja AI:n relevanssi). Yksityiskohtanäkymässä näkyvät perustelut kertovat, mitkä ehdot vaikuttivat.
        </p>
        <dl>
          <div>
            <dt>
              <span className="tag conf-korkea">varmuus: korkea</span>
            </dt>
            <dd>
              Vahva signaali (suora CPV, avainsana, joka ei ole laaja, tai aliurakka rakennushankkeen CPV:llä), AI:n
              relevanssi vähintään {HIGH_MIN_RELEVANCE}, kuvaus vähintään {SHORT_DESCRIPTION_CHARS} merkkiä ja CPV-koodit
              on oltava (puuttuva CPV antaa aina matalan).
            </dd>
          </div>
          <div>
            <dt>
              <span className="tag conf-kohtalainen">varmuus: kohtalainen</span>
            </dt>
            <dd>Kaikki muut tapaukset.</dd>
          </div>
          <div>
            <dt>
              <span className="tag conf-matala">varmuus: matala</span>
            </dt>
            <dd>
              Lyhyt kuvaus (alle {SHORT_DESCRIPTION_CHARS} merkkiä) tai puuttuva CPV-koodi, tai ei vahvaa signaalia mutta
              AI:n relevanssi vähintään {LOW_MIN_RELEVANCE_WITHOUT_SIGNAL}. Pelkkä laaja avainsana (esim. automaatio) ei
              ole vahva signaali.
            </dd>
          </div>
        </dl>

        <h4>Suodattimet</h4>
        <dl>
          <div>
            <dt>Suora tarjous</dt>
            <dd>AI:n mukaan kohdeyritys voi tarjota suoraan.</dd>
          </div>
          <div>
            <dt>Aliurakka</dt>
            <dd>Pääurakoitsija hankkii automaation, kohdeyritys aliurakoitsijana.</dd>
          </div>
          <div>
            <dt>Seuraa</dt>
            <dd>Kiinnostava, mutta ei vielä toimittavaa. Arvioimattomat rivit näkyvät vain "Kaikki"-näkymässä.</dd>
          </div>
        </dl>

        <h4>Prioriteetti</h4>
        <p>
          Pisteet = AI:n relevanssi (0–100), +{URGENT_BOOST} jos määräaika on enintään {URGENT_DAYS_MAX} päivän päässä,
          +{SUBCONTRACT_AWARD_BOOST} aliurakkana jälki-ilmoituksessa. Korkea: vähintään {HIGH_PRIORITY_MIN}. Normaali:{" "}
          {NORMAL_PRIORITY_MIN}–{HIGH_PRIORITY_MIN - 1}. Matala: alle {NORMAL_PRIORITY_MIN}. Arvioimaton rivi on enintään
          normaali.
        </p>

        <h3>Huomioitavaa</h3>
        <p>
          <code>[yhteystieto Hilmassa]</code>: sähköposti tai puhelinnumero on poistettu. Yhteystiedot löytyvät Hilman ilmoituksesta.
        </p>

        <p className="explainer-note">
          Arviot tekee tekoäly{model ? ` (malli ${model})` : ""}, ja ne voivat olla virheellisiä. Tarkista aina Hilman ilmoituksesta. Data päivittyy automaattisesti arkiaamuisin ja aina, kun sovellus päivitetään.
        </p>
      </div>
    </details>
  );
}

export function TenderCard({ r, onOpen }: { r: Ranked; onOpen: (id: string) => void }) {
  const t = r.item.tender;
  const failed = r.item.aiFailed === true;
  // Kiireellisyys tulee urgentDays-kentästä. Vastaava lippu näytetään urgent-tagina eikä tavallisena tagina.
  const urgentFlag = r.urgentDays !== null ? `määräaika ${r.urgentDays} pv` : null;
  // Varmuus on null tai puuttuu vanhasta datasta: silloin kortissa ei näytetä varmuutta.
  const confidence = r.item.confidence ?? null;

  return (
    <button className="card" onClick={() => onOpen(t.id)}>
      <span className={`dot ${r.priority}`} aria-label={`Prioriteetti ${r.priority}`} />
      <span className="card-body">
        <span className="card-title">{t.title}</span>
        <span className="card-meta">
          {t.buyer}
          {r.item.nearestOffice && <> · {r.item.nearestOffice}</>}
        </span>
        <span className="card-summary">{r.provisional ? prefilterText(r) : r.assessment.summary}</span>
        <span className="tags">
          {confidence && <span className={`tag conf-${confidence.level}`}>varmuus: {confidence.level}</span>}
          {!r.provisional && <span className="tag role">{ROLE_LABEL[r.assessment.role]}</span>}
          {failed && <span className="tag ai-failed">AI-arvio ei saatavilla</span>}
          {urgentFlag !== null && <span className="tag urgent">{urgentFlag}</span>}
          {r.flags
            .filter((f) => f !== urgentFlag)
            .map((f) => (
              <span key={f} className="tag">
                {f}
              </span>
            ))}
        </span>
      </span>
      <span className="card-side">
        {r.provisional ? (
          <span className="score-box" aria-label={`Esisuodatuksen pisteet ${r.assessment.relevance}, ei AI-arvio`}>
            <span className="score-label">esisuodatus</span>
            <span className="score provisional">{r.assessment.relevance}</span>
          </span>
        ) : (
          <span className="score-box" aria-label={`AI-sopivuus ${r.assessment.relevance} / 100`}>
            <span className="score-label">AI-sopivuus</span>
            <span className="score">{r.assessment.relevance}</span>
          </span>
        )}
        {/* Vihje siitä, että koko kortti on painike. Nimi tulee kortin painikkeelta, joten vihje on piilotettu aputeknologialta. */}
        <span className="card-open" aria-hidden="true">
          Avaa ›
        </span>
      </span>
    </button>
  );
}
