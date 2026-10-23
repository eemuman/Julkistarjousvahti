import {
  formatPrefilterMatches,
  type LocationScope,
  rankTenders,
  type Ranked,
  type Role,
  type TendersResponse,
} from "@tarjousvahti/core/web";
import { useEffect, useMemo, useState } from "react";
import { fetchTenders } from "./api";
import { ROLE_LABEL, RunExplainer, RunSummary, TenderCard } from "./components";
import { Loader } from "./Loader";

const FILTERS: { key: Role | "all"; label: string }[] = [
  { key: "all", label: "Kaikki" },
  { key: "suora_tarjous", label: "Suora tarjous" },
  { key: "aliurakka", label: "Aliurakka" },
  { key: "seuraa", label: "Seuraa" },
];

/** Sijainnin teksti yksityiskohtanäkymään, kun lähintä toimipistettä ei ole. Laatu tulee rakenteisesta kentästä. */
const LOCATION_TEXT: Record<LocationScope, string> = {
  office: "–",
  nationwide: "koko Suomi, ei yksittäistä toimipistettä",
  wide: "laaja alue, ei yksittäistä toimipistettä",
  unknown: "sijainti tuntematon",
  unmapped: "ei toimipistettä alueella",
};

const eur = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("fi-FI", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
  timeZone: "Europe/Helsinki",
});
export function App() {
  const [data, setData] = useState<TendersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Role | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetchTenders().then(setData, (e) => setError(String(e)));
  }, []);

  const ranked = useMemo<Ranked[]>(() => (data ? rankTenders(data.items, new Date()) : []), [data]);

  const visible = ranked.filter((r) => r.visible);
  // Roolisuodatin käyttää vain AI:n lopullista roolia. Väliaikaisen arvion rooli ei ole varma.
  const shown = visible.filter((r) => filter === "all" || (!r.provisional && r.assessment.role === filter));
  // Otsikon "kiinnostavaa" ja "korkea prioriteetti" lasketaan vain AI-arvioiduista riveistä. Arvioimattomat eriteltynä omaan lukuun.
  const assessedVisible = visible.filter((r) => !r.provisional);
  const assessedCount = assessedVisible.length;
  const provisionalCount = visible.length - assessedCount;
  const highCount = assessedVisible.filter((r) => r.priority === "korkea").length;
  // Piilotetut rivit eriteltynä: AI karsi tai määräaika meni. Määräaikarivi ei ole AI:n päätös.
  const aiHiddenCount = ranked.filter((r) => !r.visible && !r.provisional && !r.deadlinePassed).length;
  const expiredCount = ranked.filter((r) => !r.visible && r.deadlinePassed).length;

  const openRanked = openId ? ranked.find((r) => r.item.tender.id === openId) : undefined;

  return (
    <div className="app">
      <header className="top">
        <h1>Tarjousvahti</h1>
        {data && (
          <RunSummary
            data={data}
            assessedCount={assessedCount}
            highCount={highCount}
            aiHiddenCount={aiHiddenCount}
            expiredCount={expiredCount}
            provisionalCount={provisionalCount}
          />
        )}
        {data && (
          <RunExplainer
            model={data.run?.model}
            days={data.fetch.days}
            maxAssessments={data.run?.maxAssessments}
            timeBudgetMin={data.run?.timeBudgetMin}
          />
        )}
      </header>

      {data?.source === "offline" && (
        <div className="banner">Eräajon data ei ole saatavilla. Näytetään tallennettu esimerkkidata (keksittyjä hankkeita).</div>
      )}

      <nav className="chips" aria-label="Suodata roolin mukaan">
        {FILTERS.map((f) => (
          <button key={f.key} className={filter === f.key ? "chip active" : "chip"} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </nav>

      {error && <p className="empty">Lataus epäonnistui: {error}</p>}
      {!data && !error && <Loader text="Haetaan ilmoituksia…" />}
      {data && shown.length === 0 && <p className="empty">Ei osumia tällä suodattimella.</p>}

      <ul className="list">
        {shown.map((r) => (
          <li key={r.item.tender.id}>
            <TenderCard r={r} onOpen={setOpenId} />
          </li>
        ))}
      </ul>

      <footer className="footer">
        Lähde: Hilma (<a href="https://www.hankintailmoitukset.fi" target="_blank" rel="noreferrer">hankintailmoitukset.fi</a>), Hansel Oy,{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/deed.fi" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
        . Pisteet ja arviot ovat tämän sovelluksen tuottamia.
      </footer>

      {openRanked && <Detail item={openRanked} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Detail({ item, onClose }: { item: Ranked; onClose: () => void }) {
  const { item: row, assessment: a, provisional } = item;
  const t = row.tender;
  const failed = row.aiFailed === true;
  const pre = formatPrefilterMatches(row.prefilter);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={t.title} onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Sulje">
          ×
        </button>
        {t.isExample && <p className="example-note">Esimerkkidata</p>}
        <h2>{t.title}</h2>
        <p className="card-meta">{t.buyer}</p>

        <dl className="verdict">
          <div>
            <dt>{provisional ? "Esisuodatus" : "AI-sopivuus"}</dt>
            <dd>{provisional ? `${a.relevance} (ei AI-arviota)` : `${a.relevance}/100`}</dd>
          </div>
          <div>
            <dt>Suositus</dt>
            <dd>{provisional ? "– (ei AI-arviota)" : ROLE_LABEL[a.role]}</dd>
          </div>
          <div>
            <dt>Prioriteetti</dt>
            <dd>
              {item.priority}
              {item.priorityReason && <span className="muted"> ({item.priorityReason})</span>}
            </dd>
          </div>
        </dl>

        <dl className="facts">
          <div>
            <dt>Määräaika</dt>
            <dd>{t.deadline ? date.format(new Date(t.deadline)) : "–"}</dd>
          </div>
          <div>
            <dt>Arvo</dt>
            <dd>{t.estimatedValueEur !== null ? eur.format(t.estimatedValueEur) : "–"}</dd>
          </div>
          <div>
            <dt>Lähin toimipiste</dt>
            <dd>
              {row.nearestOffice ?? LOCATION_TEXT[item.locationScope]}
            </dd>
          </div>
          {t.winners.length > 0 && (
            <div>
              <dt>Voittaja(t)</dt>
              <dd>{t.winners.join(", ")}</dd>
            </div>
          )}
        </dl>

        {provisional ? (
          <>
            <h3>Esisuodatus</h3>
            {failed ? (
              <p>AI-arvio ei saatavilla. Näytetään esisuodatuksen tiedot.</p>
            ) : (
              <p className="muted">AI-arviota ei ole tälle ilmoitukselle.</p>
            )}
          </>
        ) : (
          <>
            <h3>AI:n arvio</h3>
            <p>{a.summary}</p>
            {a.reasons.length > 0 && (
              <ul className="reasons">
                {a.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {a.automationScope && (
              <>
                <h3>Automaatio-osuus</h3>
                <p>{a.automationScope}</p>
              </>
            )}
            {a.nextStep && (
              <>
                <h3>Seuraava askel</h3>
                <p>{a.nextStep}</p>
              </>
            )}
          </>
        )}

        {row.confidence && (
          <>
            <h3>Varmuus</h3>
            <p>Taso: {row.confidence.level}</p>
            {row.confidence.reasons.length > 0 && (
              <ul className="reasons">
                {row.confidence.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </>
        )}

        <h3>Miksi tämä nousi</h3>
        <p className="muted">
          CPV: {pre.cpv}
          <br />
          Avainsanat: {pre.keywords}
        </p>

        {t.isExample ? (
          <p className="primary disabled">Esimerkkidata – ei Hilma-linkkiä</p>
        ) : (
          <a className="primary" href={t.url} target="_blank" rel="noreferrer">
            Avaa Hilmassa
          </a>
        )}
      </section>
    </div>
  );
}
