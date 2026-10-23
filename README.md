# Tarjousvahti

POC, joka hakee Hilman julkiset hankintailmoitukset ja nostaa puhelimeen ne, jotka kiinnostavat rakennusautomaatiourakoitsijaa: rakennusautomaatio, savunpoisto, leikkaussalit ja puhdastilat sekä isot rakennushankkeet, joihin pääurakoitsija hankkii automaatiourakan.

> Tila: julkaisu GitHub Pagesiin päivittäisellä eräajolla on toteutettu ([docs/DEPLOY.md](docs/DEPLOY.md)). Sivu on staattinen: palvelinta tai rajapintaa ei ole.

## Miten se toimii

```
GitHub Actions, arkiaamuisin ja main-haaraan pushatessa
        │
        ▼
1. Hilma AVP-Read: 7 päivän aikana julkaistut tai vielä määräaikaansa odottavat ilmoitukset
   normalisointi, korvaukset ja keskeytykset
2. Esisuodatus koodilla
   CPV-koodit, avainsanat, toimipiste, määräaika
3. AI-arvio (Gemini) kärjestä alkaen
   relevanssi 0–100, kategoria, rooli, perustelu
        │
        ▼
data.json → GitHub Pages
        │
        ▼
Puhelin: säännöt koodilla (määräaika, toimipiste, kynnysarvot)
ja priorisoitu lista
```

Tekoäly tekee vain sen, missä se on hyvä: vapaamuotoisen ilmoitustekstin tulkinnan. Suodatus ja priorisointisäännöt ovat tavallista, testattavaa koodia.

Arviot tehdään eräajossa, joten AI-kulu ei kasva käyttäjämäärän mukaan. Jos yksittäinen arvio epäonnistuu, ilmoitus näytetään esisuodatuksen tiedoilla. Jos Hilma-haku epäonnistuu, mitään ei julkaista, ja edellinen versio jää näkyviin. Perustelut: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Rakenne

| Kansio | Sisältö |
|---|---|
| `packages/core` | Domain-logiikka ilman pilviriippuvuuksia: Hilma-asiakas, normalisointi, kohdeyrityksen profiili, esisuodatus, AI-arviot (Gemini), eräarviointi, säännöt. Testit. |
| `scripts` | Eräajo (`build-data.ts`) ja offline-varadata (`export-fixtures.ts`). |
| `web` | Vite + React, mobiili ensin. Lukee `data.json`:n, varana offline-varadata (`sample.json`). |
| `.github/workflows` | `ci.yml` (PR- ja push-tarkistus: testit ja buildit) ja `pages.yml` (eräajo ja julkaisu). |
| `docs` | Arkkitehtuuri, julkaisu ja muistiinpanot AI-avusteisesta kehityksestä. |

## Pikastartti

```bash
npm install
cp .env.example .env          # Hilma- ja Gemini-avaimet (tarvitaan vain eräajoon)
npm test                      # core-testit (eivät vaadi avaimia)
npm run dev:web               # UI: http://localhost:5173
```

Ilman `data.json`:ia UI näyttää offline-varadatan (`web/public/sample.json`, keksittyjä hankkeita). Sen luovat automaattisesti `dev`- ja `build`-komennot (`predev`/`prebuild` ajavat `npm run fixtures`).

Eräajo paikallisesti (vaatii avaimet `.env`:ssä, tekee oikeita Hilma- ja Gemini-kutsuja):

```bash
npm run data:build            # → web/public/data.json
```

Staattisen sivun voi esikatsella samalla tavalla kuin Pages-buildin:

```bash
VITE_BASE=/<repo>/ npm run build -w web -- --outDir dist-pages
```

Windowsin Git Bashissa lisää alkuun `MSYS_NO_PATHCONV=1`. Muuten Git Bash muuttaa arvon `/<repo>/` muotoon `C:/Program Files/Git/<repo>/`, eikä sivu lataudu. Actions ajaa Ubuntulla, joten siellä ongelmaa ei ole.

## Komennot

| Komento | Mitä tekee | Avaimet |
|---|---|---|
| `npm test` | Core-testit | ei |
| `npm run typecheck` | Tyyppitarkistus kaikille paketeille ja skripteille (rakentaa ensin coren) | ei |
| `npm run build` | Core ja web | ei |
| `npm run dev:web` | UI kehitystilassa | ei |
| `npm run data:build` | Eräajo → `web/public/data.json` | Hilma ja AI |

## AI-palvelu

- Eräajo käyttää Geminiä. Avain tulee muuttujasta `GEMINI_API_KEY`.
- Gemini-avain luodaan [Google AI Studiossa](https://aistudio.google.com/apikey). Mallin voi vaihtaa muuttujalla `GEMINI_MODEL` (oletus `gemini-3.5-flash-lite`).
- Eräajon rajat (`AI_CONCURRENCY`, `AI_MIN_INTERVAL_MS`, `AI_MAX_ASSESSMENTS`, `AI_TIME_BUDGET_MIN`): oletukset ja sallitut arvot ks. [.env.example](.env.example). Ajon kesto ja aikabudjetti: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#päivittäinen-eräajo).
- Arvioiden välimuisti: `PREVIOUS_DATA` on edellisen `data.json`:in URL tai tiedostopolku. Arvio käytetään uudelleen, kun ilmoitus ja arviointitapa eivät ole muuttuneet. Jos muuttujaa ei ole, käytetään tulostiedostoa, jos se on olemassa (npm-skriptit kirjoittavat `web/public/data.json`:iin). Ajon kesto ja perustelut: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Ilmaistaso ja ETA-alueen ehdot: [Gemini-ehdot](docs/ARCHITECTURE.md#gemini-ehdot).

## Tietosuoja ja tietoturva

- Data on julkista avointa dataa (Hilma, CC BY 4.0, Hansel Oy). Lähdemaininta näkyy sivulla.
- Avaimet ovat vain paikallisessa `.env`:ssä ja GitHub-secreteissä, eivät koskaan repossa. Selaimeen ei mene avaimia.
- Ilmoitusteksti on ulkopuolista syötettä. Se rajataan `<ilmoitus>`-tageihin, `<`-merkit escapetaan JSONissa, ja järjestelmäohje kieltää noudattamasta tekstin ohjeita. Mallin vastaus validoidaan skeemaa vasten (ks. `packages/core/src/scoring/ai.ts`). Tämä ei ole täydellinen suoja prompt injectionia vastaan: pahimmillaan injektio voi vääristää yksittäisen arvion relevanssia tai sanamuotoa. Mallille ei anna työkaluja.
- Julkaistulla sivulla ei ole rajapintaa, joka käynnistäisi AI-kutsun.

## Lähteet

- Data: [hankintailmoitukset.fi](https://www.hankintailmoitukset.fi) / Hansel Oy, AVP-Read API, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.fi)
- API-dokumentaatio: [Hankintailmoitukset/hilma-api](https://github.com/Hankintailmoitukset/hilma-api)
