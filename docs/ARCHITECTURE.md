# Arkkitehtuuri

## Tavoite

Rakennusautomaatiourakoitsijan myynnin ja avainasiakaspäälliköiden ei tarvitse selata Hilmaa. Puhelimeen tulee arkiaamuisin lyhyt, priorisoitu lista: mitä uutta on tullut, miksi se sopii kohdeyritykselle ja milloin pitää toimia.

Kaksi seurattavaa tyyppiä:

1. **Avoimet tarjouspyynnöt**, joihin kohdeyritys voi tarjota suoraan (esim. rakennusautomaation saneeraus, savunpoiston modernisointi, huoltosopimus).
2. **Jälki-ilmoitukset ja isot rakennushankkeet**, joissa kohdeyritys toimii aliurakoitsijana: kun pääurakoitsija on valittu, kenelle soitetaan automaatiourakasta.

## Päivittäinen eräajo

Julkaistu versio on staattinen sivu GitHub Pagesissa. Data päivitetään kerran päivässä GitHub Actionsilla. Käyttöönotto-ohje: [DEPLOY.md](DEPLOY.md).

```
GitHub Actions, arkisin klo 6.17 (Europe/Helsinki), käsin tai main-haaraan pushatessa
        │
        ▼
scripts/build-data.ts
  1. Hilma AVP-Read: 7 päivän aikana julkaistut tai vielä määräaikaansa odottavat (enintään 5000 ilmoitusta)
     → normalisointi, keskeytykset ja korjaukset
  2. Esisuodatus koodilla (listTenders): CPV, avainsanat, toimipiste,
     menneet määräajat pois
  3. Arvioiden välimuisti: edellisen ajon arviot (PREVIOUS_DATA) käytetään
     uudelleen, kun avain täsmää. Muut rivit menevät Geminille, kärjestä alkaen (assessAll):
     rinnakkaisuus, kutsujen väli ja kutsuraja (ks. .env.example),
     5 peräkkäisen virheen jälkeen lopetus, aikabudjetti (ks. .env.example)
        │
        ▼
web/public/data.json  (lista, arviot, ajon tilastot)
        │
        ▼
Vite-build (base /<repo>/) → GitHub Pages
        │
        ▼
Puhelin: lista + säännöt (rankTenders) selaimessa, "Päivitetty pp.kk. klo hh.mm"
```

Vikasietoisuus, koska demo ei saa kaatua:

| Tilanne | Mitä tapahtuu |
|---|---|
| Hilma-haku epäonnistuu | Skripti päättyy virheeseen ennen kuin tiedosto kirjoitetaan. Workflow ei julkaise, ja edellinen versio jää Pagesiin. |
| Hilma-haku katkeaa 5000 ilmoitukseen | Skripti päättyy koodilla 1 ennen kirjoitusta. Workflow ei julkaise, ja edellinen versio jää Pagesiin. |
| Yksittäinen AI-arvio epäonnistuu | Rivi saa `aiFailed: true`. Kortissa lukee "AI-arvio ei saatavilla", ja se näytetään esisuodatuksen tiedoilla. Gemini-asiakas yrittää 429- ja 503-virheet sekä aikakatkaisut ja verkkovirheet itse uudelleen. |
| Datassa ei ole yhtään AI-arviota (uusia oli tehtävänä, mutta yksikään ei onnistunut, eikä välimuistissa ollut arvioita; myös kutsuraja 0 tai kaikki ohitettu) | Tiedosto kirjoitetaan, mutta skripti päättyy koodilla 2. Workflow ei julkaise, joten edellinen, arvioitu versio jää näkyviin. |
| Pysyvä AI-virhe (väärä avain, kielletty pääsy, tuntematon malli: 400, 401, 403, 404) | Erä pysähtyy heti, ja loput rivit ohitetaan. Jos dataan jää arvioita (välimuisti tai onnistuneet uudet), tiedosto kirjoitetaan ja julkaistaan, mutta ajo merkitään punaiseksi (koodi 3). Jos arvioita ei jää, tulos on koodi 2. |
| Osa uusista AI-arvioista epäonnistuu (esim. päiväkiintiö), mutta dataan jää arvioita | Epäonnistuneet rivit jäävät arvioimatta. Ajo onnistuu ja data julkaistaan, koska yksittäinen epäonnistuminen ei estä julkaisua. Ne yritetään seuraavalla ajolla, ja varoitus kirjoitetaan lokiin. |
| Kiintiö loppuu kesken | 5 peräkkäisen virheen jälkeen arviointi lopetetaan. Jäljelle jäävät rivit näytetään ilman arviota ("ohitettu"). |
| Aikabudjetti täyttyy | Uusia arvioita ei aloiteta. Jäljelle jäävät rivit näytetään esisuodatuksen tiedoilla, ja ne arvioidaan seuraavalla ajolla. |
| `data.json` ei lataudu | UI näyttää offline-varadatan (`sample.json`) ja kertoo sen. |
| Ajastus viivästyy tai jää väliin | GitHub voi viivästää ajastettuja ajoja. Sivulla näkyy päivitysaika. Ennen demoa ajo käynnistetään käsin. |

`data.json` sisältää ajon tilastot (`run`): aloitus- ja lopetusaika, esisuodatettu, välimuistista käytetty (`reused`), arvioitu, epäonnistunut, ohitettu, malli sekä ajon kutsuraja ja aikabudjetti (vanhassa datassa ei ole). Haun tiedot (`fetch`): Hilman kokonaismäärä ja päivät. Katkaisu ei päädy dataan, koska katkaistu ajo pysähtyy ennen kirjoitusta. Tenderin `description` tyhjennetään tiedostoon kirjoitettaessa, koska se voi sisältää yhteyshenkilöiden yhteystietoja.

Sivu näyttää päivitysajan ja listan yläpuolella: haettu, esisuodatus, AI-arvioitu (välimuistista ja uudet yhteensä, sulkeissa uudet), ohitettu ja epäonnistunut. Otsikossa näkyvät lisäksi AI-arvion karsimat rivit ja määräajan mennyt -rivit. Hilman kokonaismäärää sivu ei näytä. Mallin nimi näkyy arvioiden alaviitteessä, ja kutsuraja ja aikabudjetti näkyvät selitteessä.

### Hakuikkuna

Haku palauttaa ilmoitukset, jotka on julkaistu viimeisen 7 päivän aikana TAI joiden määräaika on vielä tulevaisuudessa (`deadline ge now`). Näin avoin tarjouspyyntö pysyy listalla määräaikaansa asti, vaikka julkaisusta olisi yli viikko. Haussa on 23.10.2026 noin 1 800 ilmoitusta. Haun katto on 5000 ilmoitusta. Jos haku katkeaa kattoon, ajo päättyy koodilla 1 eikä julkaistua dataa korvata, koska puutteellinen lista olisi huonompi kuin edellinen versio.

### Arvioiden välimuisti

Hilma-haku tehdään joka ajossa, koska se on halpa. Gemini-arviot käytetään uudelleen, jos ilmoitus ja arviointitapa eivät ole muuttuneet. Ilman tätä jokainen ajo arvioisi kaikki kelpaavat ilmoitukset uudelleen, vaikka useimmat ovat samoja kuin edellisellä kerralla. Se kuluttaisi Geminin ilmaistason kiintiötä ja pidentäisi ajoa.

Arviot eivät sisällä suhteellisia aikailmauksia (esim. "huomenna"), koska ne tallennetaan välimuistiin. Määräajat ja kiireellisyys lasketaan selaimessa avaushetkellä (`rankTenders`/`applyRules`).

- **Edellinen data.** `PREVIOUS_DATA` on URL (http/https, haku 15 s aikarajalla) tai tiedostopolku. Workflow antaa sen arvoksi `${base_url}/data.json` julkaistusta sivusta. Jos muuttujaa ei ole, käytetään tulostiedostoa, jos se on olemassa. Npm-skriptit kirjoittavat sen `web/public/data.json`:iin.
- **Avain** (`assessmentKey`, `packages/core/src/service/cache.ts`). sha256 seuraavasta: arviointitapa (system-prompt, Gemini-skeema, mallin nimi), ilmoituksen `id` ja täsmälleen se teksti, joka mallille lähetetään (`buildUserMessage`). Siihen kuuluvat tyyppi, otsikko, kuvaus (katkaistuna 4000 merkkiin), hankintayksikkö, CPV-koodit, NUTS-koodit, arvioitu arvo ja voittajat. Päivämäärät, esisuodatuksen tulokset ja muut kentät, joita mallille ei lähetetä, eivät vaikuta avaimeen. Tiiviste lasketaan `node:crypto`:lla; web ei tuo tätä moduulia, joten se ei päädy selainbundleen.
- **Versio.** Kun prompt, skeema tai malli muuttuu, avain muuttuu ja kaikki arvioidaan uudelleen. Mitään ei tarvitse tehdä käsin.
- **Uudelleenkäyttö.** Arvio otetaan edellisestä datasta vain, jos avain täsmää, rivillä ei ole `aiFailed`-merkintää ja arvio läpäisee zod-skeeman (`assessmentSchema`). Muut rivit, eli uudet, muuttuneet, epäonnistuneet, ohitetut ja virheelliset, arvioidaan. Vain nämä lasketaan `AI_MAX_ASSESSMENTS`-rajaan ja kutsurajoihin.
- **Vikasietoisuus.** Puuttuva (404), verkkovirheellinen, virheellinen JSON tai väärän muotoinen edellinen data kirjoitetaan lokiin varoituksena, jonka jälkeen kaikki arvioidaan uudelleen. Ajo ei kaadu. Vanhassa datassa ei ole avaimia, joten ensimmäinen ajo välimuistin kanssa arvioi kaiken.
- **Exit-koodi.** Ensimmäinen täyttyvä ehto ratkaisee (`runExitCode`, `packages/core/src/service/batch.ts`):
  - **0**: onnistui. Pelkästään välimuistista koostuva ajo onnistuu, ja yksittäinen epäonnistuminen (esim. päiväkiintiö) ei ole virhe, kun dataan jää arvioita.
  - **1**: Hilma-haku epäonnistui tai katkesi `MAX_NOTICES`-rajaan. Tiedostoa ei kirjoiteta.
  - **2**: datassa ei ole yhtään AI-arviota. Uusia oli tehtävänä, mutta yksikään ei onnistunut eikä välimuistista tullut arvioita. Ehto ei riipu epäonnistumisten laskurista, joten myös kutsuraja 0 tai kaikki ohitettu antaa koodin 2. Tiedosto kirjoitetaan, mutta workflow ei julkaise.
  - **3**: pysyvä AI-virhe pysäytti erän. Tiedosto kirjoitetaan ja julkaistaan (data on kelvollinen), mutta ajo merkitään punaiseksi: `pages.yml` tallentaa koodin job-outputiin, ja deploy-jobin viimeinen vaihe epäonnistuu.
  Workflow julkaisee koodeilla 0 ja 3 ja pysäyttää koodeilla 1 ja 2.

### Ajon kesto

- Tavallisesti vain uudet tai muuttuneet ilmoitukset arvioidaan, joten ajo kestää muutamia minuutteja.
- Ensimmäinen ajo, jossa kaikki kelpaavat ilmoitukset arvioidaan, voi kestää pidempään. Täysi kutsuraja (ks. .env.example) oletusrinnakkaisuudella ja 20–25 s:n vasteajalla vie noin 30 minuuttia tai enemmän.
- `AI_TIME_BUDGET_MIN` (oletus ja yläraja: ks. .env.example) lasketaan skriptin alusta, joten se kattaa Hilma-haun ja tiedoston kirjoituksen. Kun aika täyttyy, uusia kutsuja ei aloiteta. Jäljelle jääneet arvioidaan seuraavalla ajolla välimuistin ansiosta.
- Budjetin ulkopuolelle jäävät `npm ci`, build, testit ja deploy sekä käynnissä olevan kutsun uusintayritysten häntä.
- Workflow'n job-aikaraja on 60 min. Budjetti jättää varaa näille vaiheille.

Perustelut:

- **0 €.** Pages ja Actions ovat ilmaisia julkiselle repolle. Gemini-ilmaistaso riittää, kun kutsuja on kerran päivässä enintään kutsuraja (ks. .env.example).
- **AI-kulu ei kasva käyttäjämäärän mukaan.** Arviot tehdään kerran ajossa, eivät jokaiselle avaukselle. Julkiselle sivulle ei tarvita rajoitinta, koska sivulla ei ole AI-rajapintaa, jota voisi kutsua.
- **Yksinkertainen.** Ei palvelinta, tietokantaa, kylmäkäynnistystä, avaimia selaimessa tai sovellusasetuksia. Avaimet ovat vain GitHub-secreteissä.
- **Nopea avaus.** Lista on valmis staattinen tiedosto. Ensimmäinen avaus ei odota Hilma-hakua.

Haitat:

- Data on enintään päivän vanhaa.
- GitHubin ajastus voi viivästyä tai jäädä väliin ruuhkassa. Julkisen repon ajastus pysähtyy, jos repossa ei ole tapahtunut mitään 60 päivään.
- Jos haku katkeaa 5000 ilmoitukseen, ajo pysähtyy eikä data päivity. Katkaistu lista olisi puutteellinen, koska haku on vanhin ensin.

### Varmuus

Jokaiselle AI-arviolle lasketaan varmuustaso (korkea, kohtalainen, matala) ja perustelut `assessConfidence`-funktiolla (`scoring/confidence.ts`). Se on puhdas koodi, ei AI-kutsua. Se lasketaan joka ajossa `toPublicItems`-funktiossa (`service/public.ts`), joka tyhjentää kuvauksen julkista tiedostoa varten. Taso seuraa signaalien yhtäpitävyyttä: suora CPV-osuma, vahva avainsanaosuma, aliurakkarooli rakennushankkeen CPV:llä, kuvauksen pituus, puuttuva CPV ja AI:n relevanssi. Vahva signaali on suora CPV tai avainsana, joka ei ole `broadKeywords`-listalla (esim. `automaatio*`). Laaja avainsana ei yksin riitä signaaliksi, vaikka se läpäisee esisuodatuksen. Esisuodatuksen läpäisy ei muutu tämän takia. Arvio ilman tekstiä (`null`) ja erän epäonnistunut arvio saavat `null`-varmuuden. Varmuus ei kuulu välimuistiavaimeen, joten sääntöjen muutos ei vaadi AI-arvioiden uudelleenajoa. Vanha data ilman kenttää toimii, ja web näyttää varmuuden kortissa vain, kun sen on laskettu.

## Komponentit

### packages/core
Puhdasta TypeScriptiä, ei pilviriippuvuuksia. Kaikki logiikka on testattavissa ilman verkkoa.

- `hilma/client.ts` – AVP-Read-haku (Azure Search -tyylinen POST). Avain headerissa `Ocp-Apim-Subscription-Key`. Rajapinta ei palauta CORS-otsakkeita, joten kutsut tehdään aina eräajosta.
- `hilma/fetch.ts` – `fetchNotices`: haku (julkaistu `since`-hetken jälkeen tai `deadline ge now`), normalisointi, id-suodatus ja korvaukset/keskeytykset yhdessä funktiossa. Haku on julkaisupäivän mukaan nousevassa järjestyksessä. Katkaisu merkitään `truncated`-kentällä.
- `hilma/normalize.ts` – Hilman raakadata → oma `Tender`-tyyppi. **Kaikki Hilman kenttänimet ovat vain tässä tiedostossa**, jotta indeksin muutokset koskevat yhtä paikkaa.
- `hilma/normalize.ts` tunnistaa keskeytysilmoitukset otsikon alusta (`isCancellationTitle`). `hilma/reconcile.ts` poistaa keskeytetyt menettelyt ja korvatut versiot. Haku kootaan joka ajossa uudelleen, joten korvattua versiota ei tarvitse poistaa tallennuksesta. Rajoite: `Tender` ei sisällä osatunnistetta (lot), joten osan (lot) keskeytys poistaa koko saman `procedureId`:n menettelyn.
- `profile/automation.ts` – kohdeyrityksen profiili (`automationProfile`): toimipisteet, kiinnostavat CPV-koodit, avainsanat. Tämä on se osa, jonka myynti säätäisi itse.
- `scoring/prefilter.ts` – deterministinen esisuodatus. Halpa, nopea, selitettävä. Negatiivinen avainsana karsii vain heikon osuman: suora CPV tai vahva avainsana ohittaa sen.
- `scoring/ai.ts` – järjestelmäohje, ilmoituksen rajaus `<ilmoitus>`-tageihin, `parseAssessment` (zod-validointi) ja `Assessor`-rajapinta. Prompt injectionia vastaan JSON-tekstin `<` escapetaan muotoon `\u003c`, joten kuvaus ei voi sulkea `<ilmoitus>`-rajausta.
- `scoring/gemini.ts` – `GeminiAssessor`: REST `generateContent` ja `responseJsonSchema`, ilman SDK:ta. Avain headerissa. 429- ja 503-virheet sekä aikakatkaisu ja verkkovirhe yritetään uudelleen enintään kaksi kertaa. Odotus on RetryInfo tai Retry-After, muuten eksponentiaalinen viive, enintään 60 s. Aikakatkaisu on 60 s.
- `scoring/schema.ts` – yksi arvioskeema kahdessa muodossa: zod (`assessmentSchema`) ja Gemini-skeema (`assessmentGeminiSchema`). Skeemat ylläpidetään käsin rinnakkain. Automaattista vertailutestia ei ole (jatkokehitys).
- `scoring/provider.ts` – `geminiFromEnv` luo Gemini-arvioijan muuttujasta `GEMINI_API_KEY` (malli `GEMINI_MODEL`). Puuttuvasta avaimesta tuleva virhe kertoo vain muuttujan nimen.
- `scoring/ranking.ts` – `listTenders` (esisuodatettu lista, käytössä eräajossa), `toListedTender`, `provisionalAssessment` ja `rankTenders` (säännöt ja järjestys).
- `scoring/rules.ts` – `locate` (sijainti: toimipiste, koko Suomi, laaja alue, tuntematon tai ei toimipistettä; lipun teksti johdetaan `LOCATION_FLAG`-taulusta) ja `applyRules` (määräaika, kynnysarvot).
- `service/batch.ts` – `assessAll`: eräajon arviointi. Rajattu rinnakkaisuus, kutsujen väli, enimmäismäärä, peräkkäisten virheiden raja ja aikabudjetti (`deadlineMs`). Ei heitä virhettä, vaan epäonnistunut rivi merkitään. Palauttaa `fatal`-lipun pysyvää virhettä varten. `runExitCode` muuntaa tulokset exit-koodeiksi.
- `service/public.ts` – `toPublicItems`: laskee varmuuden ja tyhjentää kuvauksen. Käytössä eräajossa ja offline-varadatan generoinnissa.
- `api-types.ts` – `TendersResponse`, `ListedTender` (`aiFailed`, `assessmentKey`), `RunStats` (`reused`).
- `service/cache.ts` – `assessmentKey`, `assessmentVersion`, `reuseAssessments` ja `mergeAssessed`. `assessmentKey` laskee tiivisteen `node:crypto`:n `createHash`-funktiolla suoraan, ei parametrina. Siksi moduuli ei kuulu web-entryyn.
- `web.ts` – selaimen entry `@tarjousvahti/core/web`. Tuo `rankTenders`, `formatPrefilterMatches`, `isListedTender`, tyypit sekä säännöjen ja varmuuden vakiot (esim. `HIGH_PRIORITY_MIN`, `SHORT_DESCRIPTION_CHARS`), joten zod ja eräajon koodi eivät päädy selainbundleen. Selite lukee vakiot täältä, joten luvut eivät ole kovakoodattuja web-koodissa. Bundle pieneni 207 → 154 kB.

### scripts
- `build-data.ts` – päivittäinen eräajo, ks. yllä. Paikallisesti `npm run data:build` (lukee `.env`:n).
- `export-fixtures.ts` – offline-varadata (`sample.json`) jokaisessa web-buildissa.

### web
Vite + React, mobiili ensin.

- `api.ts` – `fetchTenders`. Lukee `data.json`:n. Jos sitä ei saa, käytetään `sample.json`:ia. Tiedostot haetaan `BASE_URL`:n kautta, jotta Pagesin alipolku toimii. Muototarkistus pudottaa rivit, joilla ei ole `tender.id`:tä ja `title`:a. Muu rakenne luotetaan, ja sen virheet jäävät ErrorBoundaryn varaan.
- `App.tsx` – lista, roolisuodatin, kortit, yksityiskohtanäkymä, päivitysaika, ajon tilastot ja Hilman lähdemaininta (CC BY 4.0). Säännöt (`rankTenders`) ajetaan selaimessa.
- `main.tsx` kääri sovelluksen `ErrorBoundary`-komponenttiin. Renderöintivirhe näkyy virheviestinä tyhjän sivun sijaan.

### Workflowt

- Kaikki GitHub Actions -actionit on kiinnitetty commit-SHA:han.
- `pages.yml`: eräajo ja julkaisu, `timeout-minutes: 60`. Eräajo kirjoittaa `data.json`:in ja lukee edellisen julkaisun `PREVIOUS_DATA`:sta. Exit-koodi 1 tai 2 estää julkaisun. Koodi 3 julkaistaan, ja deploy-jobi merkitsee ajon punaiseksi (ks. Exit-koodi).
- `ci.yml`: testit, typecheck ja buildit PR:ille ja main-haaraan.

## Miksi näin

| Valinta | Peruste |
|---|---|
| Eräajo ja staattinen JSON | 0 €, ei palvelinta, eikä AI-kulu kasva käyttäjämäärän mukaan. Ks. yllä. |
| Esisuodatus ennen AI:ta | Valtaosa ilmoituksista on siivousta, IT:tä yms. Ei kannata tehdä mallikutsua jokaisesta. Lisäksi selitettävä. |
| Structured output + zod | Mallin vastaus on aina validia dataa tai se hylätään. Ei regex-parsintaa. |
| Gemini REST ilman SDK:ta | Ei uutta riippuvuutta. Testattavissa mock-fetchillä. |
| Avain headerissa | Avain ei päädy URL:iin eikä virheviesteihin. |
| Säännöt AI:n jälkeen koodissa | Määräajat ja etäisyydet ovat faktoja, niitä ei arvioida mallilla. |
| Hilma-kentät yhdessä tiedostossa | Indeksi on muuttunut ennenkin (`avp/notices` → `avp/eformnotices`). |
| Offline-varadata | Sivu ei jää tyhjäksi, vaikka eräajon tulos puuttuu. |

## Gemini-ehdot

Ehdot tarkistettu 2026-10-23 seuraavista lähteistä. Ehdot muuttuvat, joten tarkista ne ennen julkaisua.

- https://ai.google.dev/gemini-api/terms
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/available-regions

Havainnot:

- Ilmaistasolla Google voi käyttää syötteitä ja vastauksia tuotteidensa kehittämiseen, ja ihmiset voivat lukea niitä. ETA-alueella maksullisen palvelun datakäytön ehdot koskevat kuitenkin myös ilmaiskiintiötä. Hilman data on julkista (CC BY 4.0), joten tällä ei ole merkitystä tässä.
- Ehdoissa on API-asiakasta koskeva rajoitus: Euroopan talousalueen, Sveitsin ja Ison-Britannian käyttäjille API-asiakasta saa tarjota vain maksullisilla palveluilla.
- Suomi on Gemini API:n tuettujen alueiden listalla.

**Tulkinta eräajosta.** Tämä on tulkinta, ei juridinen arvio. Eräajo on kehittäjän oma API-käyttö: kehittäjän ajastettu skripti kutsuu Gemini API:a kehittäjän avaimella ja tallentaa tuloksen staattiseen tiedostoon. Sivun käyttäjät eivät kutsu Gemini API:a eivätkä voi lähettää sille mitään. Sivu ei siis tarjoa käyttäjille API-asiakasta, joten ilmaistaso on tulkinnan mukaan sallittu.

## Skeemaratkaisu

- Gemini-skeema (`assessmentGeminiSchema`) on JSON Schema -objekti, jonka Gemini hyväksyy `responseJsonSchema`-kenttänä. Gemini pakottaa numeroiden rajat ja taulukon pituuden: relevanssi 0–100 ja perustelut enintään 3.
- Merkkijonojen pituudet tarkistaa zod (`assessmentSchema`). Liian pitkä teksti katkaistaan sanan rajalta eikä arviota hylätä. Rajat: yhteenveto 300, perustelu 200, automaatio-osuus 300 ja seuraava askel 160 merkkiä. Gemini ei pakota pituusrajoja.
- Zod-validointi (`parseAssessment`) on aina viimeinen portti. Puuttuva kenttä tai virheellinen arvo hylätään.
- Yhteystiedot poistetaan vapaatekstikentistä zod-validoinnissa (`redactContacts`), koska prompt ei yksin riitä estämään niiden kirjoittamista. Tunnistetut muodot: sähköposti `@`-merkillä sekä kirjoitettuna `(at)` tai `[at]`; suomalainen puhelinnumero `+358`-muodossa (myös `+358 (0)40 123 4567`) ja 0-alkuisena, välilyönnein tai väliviivoin ryhmiteltynä (myös suuntanumero sulkeissa, esim. `(09) 310 12345`). Numeroa, jota edeltää kirjain tai numero ja väliviiva tai kauttaviiva (esim. `2026-0123456789`, `MAT-0400123456`), ei poisteta. Tämä ei ole kaikki mahdolliset yhteystietomuodot: muut muodot jäävät promptin varaan.

## Avoimet asiat

- [ ] **Hilman hakuindeksin kenttänimet.** Kenttänimet on varmistettu oikeilla ilmoituksilla 2026-10-23. Päivämääräkenttä on kovakoodattu `datePublished`.
- [ ] **CPV-koodilista.** `profile/automation.ts`:n koodit ovat lähtökohta, ei tarkistettu lista. Tarkista CPV-hakemistosta ja kohdeyrityksen myynniltä.
- [ ] **Toimipisteet.** Profiilin toimipisteet (Tampere, Helsinki, Turku, Oulu) ovat esimerkki, eivät kohdeyrityksen todellinen verkosto.
- [ ] **Gemini-ilmaistason rajat.** Rajat näkyvät vain AI Studiossa. Eräajo pitää välin kutsujen aloitusten välillä ja rajoittaa kutsujen määrän (`AI_MIN_INTERVAL_MS`, `AI_MAX_ASSESSMENTS`; oletukset ks. .env.example). Jos päiväkiintiö loppuu, arviointi lopetetaan 5 peräkkäisen virheen jälkeen. Yksittäinen kutsu on kestänyt ilmaistasolla 20–25 s, joten workflow'n aikaraja on 60 minuuttia ja aikabudjetti (`AI_TIME_BUDGET_MIN`) on säädettävissä (ks. .env.example).
- [ ] **Katkaisu 5000 ilmoitukseen.** Katto on 5000, ja katkaisu pysäyttää ajon. Jos ilmoitusmäärä kasvaa katon yli, tarvitaan tuotantoversion tallennus ja jatkokohta.

## Jatkokehitys / tuotantoversio (esitetään, ei toteuteta POC:ssa)

- **Azure-tuotantoversio.** Ajastettu Azure Functions (Flex Consumption) hakee ja arvioi. Tulokset tallennetaan Table Storageen tai Cosmos DB:hen, jolloin haku voi jatkua tallennetusta kohdasta eikä katkaisua tarvitse ratkaista yhdellä haulla. AI:na Azure OpenAI EU:n Data Zone -deployment (esim. Sweden Central). Mallin ja API-version valinta tarkistetaan silloin mallikohtaisesti, koska esim. päättelymallit eivät tue kaikkia parametreja. UI Static Web Appsissa, ja kirjautuminen Entra ID:llä. Avaimet Key Vaultiin tai managed identity.
- Täysi ilmoitus (eForms XML) Read-endpointista → tarkempi arvio ja yhteystiedot.
- Teams-ilmoitus aamulla, palaute "kiinnostava / ei" → profiilin säätö.
- Integraatio CRM:ään tai toiminnanohjausjärjestelmään.
- **Laadunmittaus (golden set).** Myynti merkitsee 30–50 oikeaa Hilma-ilmoitusta (relevantti kyllä/ei, rooli). Jokainen prompt- tai mallimuutos (esim. siirto Azure OpenAI:hin) mitataan niitä vastaan ennen julkaisua: relevanssin ja roolin tarkkuus sekä useampi kierros mallin vaihtelun takia. Ilmoitustekstien yhteystiedot peitetään ennen tallennusta. POC:ssa tätä ei ole, koska merkinnät vaativat toimialaosaamista.
