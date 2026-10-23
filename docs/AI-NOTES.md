# Muistiinpanot AI-avusteisesta kehityksestä

Tähän kirjataan kohdat, joissa tekoälyn tuottama koodi, teksti tai oletus oli väärin tai puutteellinen, ja miten se huomattiin. Tarkoitus on näyttää, että tuotokset tarkistetaan eikä ensimmäiseen vastaukseen tyydytä.

Muoto: mitä AI ehdotti → mikä oli vialla → miten huomattiin → mitä tehtiin.

## Pohjan luonti

### Hilman API-endpoint
- **AI ehdotti:** vanhaa endpointia `avp/notices/docs/search` (löytyi vanhasta R-kirjastosta).
- **Vika:** Hilman oma esimerkkirepo on merkitty vanhentuneeksi; nykyinen indeksi on eForms-pohjainen.
- **Huomattiin:** tarkistamalla Hilman virallinen dokumentaatio ja vertaamalla useaan toteutukseen.
- **Tehtiin:** endpoint `avp/eformnotices/docs/search`, kenttänimet eristetty `normalize.ts`:iin ja merkitty varmistettaviksi.

### CPV-koodit
- **AI ehdotti:** listan CPV-koodeja rakennusautomaatiolle.
- **Vika:** listaa ei ole tarkistettu virallisesta CPV-hakemistosta.
- **Tehtiin:** merkitty profiiliin (nyk. `profile/automation.ts`) TODO:ksi, esisuodatus käyttää myös avainsanoja, jotta yksittäinen väärä koodi ei kaada osumaa.

## Kehityksen aikana

### 2026-10-23 – Tiedostopolut `new URL(...).pathname`-muodossa
- **AI ehdotti:** skripteissä (`scripts/env.ts` ja muut skriptit; myöhemmin poistettu `hilma-sample` ja `run-eval`) tiedostopolku muodossa `new URL("../.env", import.meta.url).pathname`.
- **Vika:** `pathname` on URL-polku, ei tiedostopolku. Windowsilla siitä tulee `C:\C:\...`, ja välilyönnit muuttuvat muotoon `%20` (myös Linuxilla). `env.ts` nieli virheen hiljaa, joten `.env` ei olisi latautunut koskaan ja Hilma-skripti olisi kaatunut harhaanjohtavaan viestiin "HILMA_API_KEY puuttuu".
- **Huomattiin:** ajamalla CI:n eval-vaihe paikallisesti Windowsilla (vaihe poistettu myöhemmin), kun polussa on välilyönti: `ENOENT ... mkdir 'C:\C:\Users\Etunimi%20Sukunimi\...'`. Build ja testit menivät läpi, koska skriptejä ei tyyppitarkisteta eikä testata.
- **Tehtiin:** `fileURLToPath` `scripts/env.ts`:ssä (ainoa paikka, jossa polku muodostettiin URL:sta). `loadEnv` ohittaa enää vain puuttuvan tiedoston (`ENOENT`), muut virheet näkyvät. Varmistettu: eval kirjoittaa tuloksen, ja `.env`-savutesti lataa muuttujan. (myöhemmin poistettu: golden-setti ja eval poistettiin POC:sta, ks. ARCHITECTURE.md jatkokehitys)

### 2026-10-23 – Node-versiovaatimus
- **AI ehdotti:** `"engines": { "node": ">=20" }`.
- **Vika:** skriptit ajetaan `node --experimental-strip-types`, joka on olemassa vasta Node 22.6:sta alkaen. Node 20:llä `fixtures`, `eval` ja `hilma:*` eivät käynnisty.
- **Huomattiin:** käymällä läpi, mitä Node-ominaisuuksia `package.json`-skriptit käyttävät, kun koneelle asennettiin Node.
- **Tehtiin:** `engines` → `>=22.6` (CI käyttää jo 22:ta). Lisäksi juuren `package.json`:iin `"type": "module"`, mikä poisti jokaisella ajolla tulleen `MODULE_TYPELESS_PACKAGE_JSON`-varoituksen.

### 2026-10-23 – Esimerkkidatan perustelut toistivat yhteenvedon
- **AI ehdotti:** `FixtureAssessor` palautti `reasons: [summary]`.
- **Vika:** yksityiskohtanäkymässä "AI:n arvio" näytti saman lauseen kahdesti. Demossa se näyttää siltä, että malli vain toistaa itseään.
- **Huomattiin:** tarkistamalla UI 375 px leveydellä selaimessa.
- **Tehtiin:** jokaiselle esimerkkitapaukselle omat, konkreettiset perustelut (`packages/core/src/fixtures.ts`).

### 2026-10-23 – Yksityiskohtanäkymän sulkupainike ja vieritys mobiilissa
- **AI ehdotti:** sulkupainike `position: absolute` vierittyvän paneelin sisällä, ei vierityksen lukitusta.
- **Vika:** pitkässä ilmoituksessa sulkupainike vierittyi pois näkyvistä, ja paneelin vieritys vieritti myös taustalla olevaa listaa.
- **Huomattiin:** selaimessa 375 px: painikkeen sijainti mitattiin paneelin yläreunan yläpuolelle, ja `window.scrollY` muuttui paneelia vierittäessä.
- **Tehtiin:** `position: sticky` painikkeelle, `overscroll-behavior: contain` paneelille ja `body`-vierityksen lukitus paneelin ollessa auki.

### 2026-10-23 – "Avaa Hilmassa" esimerkkidatalla
- **AI ehdotti:** sama "Avaa Hilmassa" -linkki kaikille ilmoituksille. Esimerkkidatan URL on Hilman etusivu.
- **Vika:** demossa painike veisi Hilman etusivulle, ei ilmoitukseen. Näyttää rikkinäiseltä.
- **Huomattiin:** linkin `href` tarkistettiin selaimessa.
- **Tehtiin:** esimerkkidatalla painikkeen tilalla harmaa merkintä "Esimerkkidata – ei Hilma-linkkiä".

### 2026-10-23 – Offline-varadata puuttui buildista
- **AI ehdotti:** UI hakee API:n kaatuessa tiedoston `/sample.json`, joka generoidaan komennolla `npm run fixtures -w web`.
- **Vika:** mikään ei aja komentoa CI:ssä tai julkaisussa, eikä tiedosto ole versionhallinnassa. Julkaistusta versiosta olisi puuttunut juuri se varadata, jonka takia demo ei saa kaatua.
- **Huomattiin:** `git status` näytti tiedoston seuraamattomana, ja sen jäljitettiin, mistä build saa sen.
- **Tehtiin:** `prebuild`-skripti generoi tiedoston jokaisessa web-buildissa. Tiedosto on `.gitignore`ssa, koska päivämäärät lasketaan build-hetkestä eikä versionhallintaan kuulu vanhenevaa dataa.

### 2026-10-23 – Aliagenttien väärät hälytykset ja ohjevirhe
Koodausta tehdään AI-aliagenteilla (Haiku), ja pääagentti tarkistaa tulokset.
- **Aliagentti väitti:** `sample.json`:n ääkköset ovat rikki ("jÃ¤rjestelmÃ¤") ja fixture-skriptissä on merkistövika.
- **Vika:** väite oli väärä. PowerShell 5.1 lukee UTF-8-tiedoston oletuksena väärällä merkistöllä, ja tiedosto oli kunnossa.
- **Huomattiin:** selaimessa ääkköset näkyivät oikein. Mitään ei muutettu.
- **Toisin päin:** pääagentin aliagentille antama CSS-ohje oli väärä (`.sheet p { margin: 0 }` ohitti painikkeen ylämarginaalin spesifisyyden takia). Aliagentti huomasi tämän, ja se varmistettiin selaimessa (`marginTop: 0px`). Korjattu.

### 2026-10-23 – Hilman kenttänimet ja arvojen muodot
- **AI ehdotti:** `normalize.ts`:n kenttänimet arvattiin ilman indeksin dokumentaatiota, samoin monikenttien muodot.
- **Vika:** hankintayksikön ja voittajien kentät olivat väärin, joten ne olisivat jääneet hiljaa tyhjiksi. CPV-koodien ja voittajien erottimet jäsennettiin väärin, ja tyyppi oli `mainType`, ei eForms-koodi.
- **Huomattiin:** ajamalla oikeita hakuja raakana. Yksikkötestit menivät läpi, koska ne käyttivät samoja arvattuja kenttiä.
- **Tehtiin:** kentät varmistettiin Hilman indeksistä, erottimet ja `mapKind` korjattiin, ilmoituslinkki muotoon `/fi/public/procedure/{procedureId}/enotice/{noticeId}`, ja `normalize.test.ts` kattaa kenttien poiminnan ja CPV-erottimen. Testien tiedot ovat keksittyjä.

### 2026-10-23 – Keskeytykset ja korjausilmoitukset
- **AI ehdotti:** perutut hankinnat karsitaan `isCancelled`-lipulla, ja korjaukset korvataan saman haun sisällä.
- **Vika:** `isCancelled` on vain vanhan järjestelmän ilmoituksissa. eFormsissa keskeytys on oma jälki-ilmoituksensa, ja alkuperäinen tarjouspyyntö jää indeksiin ilman merkintää. Korjausten edeltäjiä ei ole indeksissä.
- **Huomattiin:** facet-haulla, otsikkohaulla "keskeytetty" ja hakemalla saman `procedureId`:n ilmoitukset.
- **Tehtiin:** keskeytys tunnistetaan otsikosta ("Keskeytysilmoitus", "KESKEYTETTY:"), ja `reconcile` poistaa koko menettelyn ilmoitukset ennen arviointia ja julkaisua. Tunnettu rajoite: osan (lot) keskeytys piilottaa koko menettelyn.

### 2026-10-23 – Pitkät yhdyssanat rikkoivat mobiilinäkymän
- **AI ehdotti:** korttien ja yksityiskohtanäkymän tekstit ilman rivityssääntöä pitkille sanoille.
- **Vika:** oikeissa Hilma-otsikoissa on pitkiä yhdyssanoja (esim. "Elektrofysiologiatoimenpidelaitteistokokonaisuus"), jotka eivät rivity. Sivu leveni 375 px:stä 425 px:iin ja vieritti sivuttain. Keksityssä esimerkkidatassa näin pitkiä sanoja ei ollut, joten vaiheen 2 tarkistus ei voinut löytää vikaa.
- **Huomattiin:** ensimmäisessä ajossa oikealla datalla (`?hilma`-testitila, myöhemmin poistettu) selaimessa: `scrollWidth` 425.
- **Tehtiin:** `overflow-wrap: anywhere` korttien tekstille ja otsikolle. Opetus: UI tarkistetaan myös oikealla datalla, ei vain esimerkkidatalla.

### 2026-10-23 – Vanhentuneet NUTS-aluekoodit
- **AI ehdotti:** Profiilin toimipistekartta NUTS 2021 -koodeilla (esim. Pirkanmaa `FI197`).
- **Vika:** Hilma käyttää NUTS 2024 -luokitusta, jossa Suomen maakuntakoodit muuttuivat (Pirkanmaa `FI19B`, Keski-Suomi `FI198`, Pohjois-Savo `FI1DB` jne.). Esimerkiksi Taysin ilmoitukselle ei löytynyt Pirkanmaan toimipistettä.
- **Huomattiin:** oikean datan testitilassa 29/69 ilmoitusta jäi ilman toimipistettä; toimipisteettömien NUTS-koodit listattiin, ja Taysin `FI19B` ei ollut kartassa.
- **Tehtiin:** uudet koodit varmistettiin EU:n virallisesta NUTS 2024 -listasta (Eionet) eikä arvattu; vanhat jätettiin rinnalle vanhoja ilmoituksia ja esimerkkidataa varten. Testi `rules.test.ts`: `FI19B` → Tampere, ja kaikki Manner-Suomen NUTS 2024 -alueet saavat toimipisteen.

### 2026-10-23 – Esisuodatuksen avainsanat: taivutus ja liian laveat sanat
- **AI ehdotti:** avainsanat perusmuodossa ja osumahaku merkkijonona; jokainen rakennushankesana (esim. "sairaala") riitti yksin läpäisyyn.
- **Vika:** suomen astevaihtelu rikkoi osumat ("kokonaisurakka" ei osu sanaan "kokonaisurakan", "talotekniikka" ei sanaan "talotekniikan"), ja "automaatio" sekä "perusparannus" puuttuivat, joten relevantteja karsiutui. Toisaalta "sairaala" ja "kokonaisurakka" päästivät läpi lääkintälaitteita, siltoja ja louhintaa.
- **Huomattiin:** oikean Hilma-datan näyteajossa (458 ilmoitusta) käytiin läpi sekä läpäisseet että hylätyt.
- **Tehtiin:** avainsanat sananvartaloina (`kokonaisurak*`), uudet sanat `automaatio*` ja `perusparannu*`, ja heikot rakennushankesanat vaativat lisäksi talonrakennuksen CPV:n (4521/453/454/45000000) tai puuttuvan CPV:n. Väärä negatiivinen on kalliimpi kuin väärä positiivinen, joten epävarmat päästetään AI:lle. Muutoksen vaikutus mitattiin samalla näytteellä ennen ja jälkeen: läpäisseitä 68 → 53 ilmoitusta, joista toimipisteettömiä 28 → 7.

### 2026-10-23 – Hilma-haun katkaisu hyväksyttiin hiljaa
- **AI ehdotti:** `searchAll(query, max)` hakee sivuja enintään `max` kappaletta ja palauttaa pelkän listan. Ajastettu haku siirsi `lastRun`-kohdan aina ajon alkuun. (myöhemmin poistettu: `lastRun` ja jatkokohta. Katkaisu pysäyttää nykyään ajon, ks. merkintä 2026-10-23 "Hakuikkuna putosi julkaisupäivän mukaan".)
- **Vika:** jos uusia ilmoituksia oli enemmän kuin `max`, ylimenevät katosivat pysyvästi, koska seuraava ajo alkoi jo niiden ohi. Hilma palauttaa kokonaismäärän (`@odata.count`), ja asiakas pyysi sitä (`count: true`), mutta mikään ei lukenut sitä. Haku oli lisäksi uusin ensin, joten katkaistu osa ei ollut yhtenäinen alku, josta voisi jatkaa.
- **Huomattiin:** arkkitehtuuriarviossa. 14 päivän testihaku palautti tasan 500 (katon), eikä mikään varoittanut.
- **Tehtiin:** `searchAll` palauttaa `total` ja `truncated`. Haku, normalisointi ja karsinta ovat nyt yhdessä paikassa (`fetchNotices`), ja haku on vanhin ensin. Katkaistessa `lastRun` siirtyy viimeisen haetun ilmoituksen päivämäärään, joten seuraava ajo jatkaa siitä eikä mitään jää väliin. (myöhemmin poistettu: tämä jatkokohta. Nykyään katkaisu pysäyttää ajon.) Ikkunointia päiväkohtaisesti ei tarvittu, koska jatkokohta tekee saman yhdellä haulla. Azure Searchin `skip`-raja (100 000, Hilman dokumentaatio viittaa Azure Searchin sääntöihin) varmistettiin Microsoftin dokumentaatiosta. Sama 14 päivän haku: 960/960.

### 2026-10-23 – Epäonnistuneet AI-arviot jäivät pysyviksi
- **AI ehdotti:** AI-kutsun kaatuessa vara-arvio ("AI-arvio epäonnistui") ja `lastRun` siirtyy ajon alussa.
- **Vika:** vara-arviota ei arvioitu uudelleen, joten virhe jäi pysyväksi. Kategoria `ei_relevantti` ja rooli `seuraa` olivat ristiriidassa.
- **Huomattiin:** arkkitehtuuriarviossa.
- **Tehtiin:** (myöhemmin poistettu: vara-arvio ja `lastRun`-logiikka). Nykyään epäonnistunut rivi on `aiFailed: true` ja näytetään esisuodatuksen tiedoilla.

### 2026-10-23 – Skriptit tyyppitarkistuksen ulkopuolella
- **AI ehdotti:** `scripts/` ja `eval/` ajetaan Noden tyyppien poistolla (`--experimental-strip-types`), mutta ne eivät kuulu mihinkään tsconfigiin.
- **Vika:** CI:n `npm run typecheck` ei koskaan tarkistanut skriptejä. Coren rajapinnan muutos (esim. `searchAll`in paluuarvo) olisi rikkonut skriptit huomaamatta.
- **Huomattiin:** arkkitehtuuriarviossa. Alkuperäinen perustelu oli, että vaiheen 1 `URL.pathname`-bugi pääsi läpi tästä syystä. Tarkistuksessa perustelu osoittautui vääräksi: `pathname` on tyypiltään `string`, joten tsc ei olisi löytänyt sitä. Sen löytää vain ajo. Tyyppitarkistus on silti tarpeen rajapintamuutosten takia.
- **Tehtiin:** `tsconfig.scripts.json` (lisäksi `verbatimModuleSyntax` ja `erasableSyntaxOnly`, jotka vastaavat tyyppien poiston rajoituksia) liitettiin juuren `typecheck`-skriptiin. Tyyppivirheitä ei löytynyt. Tarkistuksen toimivuus varmistettiin tahallisella virheellä, joka kaatoi sen. (myöhemmin poistettu: golden-setti ja eval poistettiin POC:sta, ks. ARCHITECTURE.md jatkokehitys)

### 2026-10-23 – Gemini-ilmaistaso ETA-alueella
- **AI ehdotti:** arkkitehtuuripäätöksen taustaoletuksena, että ilmaistason ehto datan käytöstä Googlen tuotekehitykseen ei haittaa, koska Hilman data on julkista. Demo voisi siis toimia ilmaistasolla.
- **Vika:** ehdot vaativat maksullisen tason, kun API-asiakas tarjotaan ETA-alueen käyttäjille. ETA-alueella datakäytön ehdot koskevat myös ilmaiskiintiötä. Oletus osui väärään kysymykseen: julkisuus ei ratkaise, mikä taso on sallittu.
- **Huomattiin:** lukemalla Gemini API Additional Terms -sivu ennen toteutusta. Tehtävä vaati tarkistuksen virallisista lähteistä, ei muistista.
- **Tehtiin:** koodi ei riipu tasosta, koska avain ja projekti ratkaisevat. Ilmaistaso jää kehitykseen ja evaliin (myöhemmin poistettu: golden-setti ja eval poistettiin POC:sta, ks. ARCHITECTURE.md jatkokehitys). Julkaisua varten päätetään maksullinen taso tai Azure OpenAI. Kirjattu `ARCHITECTURE.md`:hen avoimeksi päätökseksi. (Nykyinen ratkaisu: ilmaistaso on tulkittu sallituksi kehittäjän omaan päivittäiseen eräajoon, koska sivun käyttäjät eivät kutsu Gemini API:a. Tulkinta ei ole juridinen arvio. Ks. [ARCHITECTURE.md Gemini-ehdot](ARCHITECTURE.md#gemini-ehdot).)

### 2026-10-23 – Mallinimet muistista
- **AI ehdotti:** Gemini-mallit 2.0 Flash-Lite ja 2.5 Flash-Lite muistista.
- **Vika:** 2.0-sarja on suljettu, ja 2.5-sarja on vain aiemmille käyttäjille. Malli ei olisi enää kelvannut.
- **Huomattiin:** Gemini-mallisivulta ennen toteutusta.
- **Tehtiin:** oletukseksi `gemini-3.5-flash-lite`. Malli on vaihdettavissa `GEMINI_MODEL`-muuttujalla, joten mallin vaihto ei vaadi koodimuutosta.

### 2026-10-23 – Skeemarajoitukset
- **AI ehdotti:** muistista tuli oletus, että Gemini hyväksyy vain OpenAPI-osajoukon (`responseSchema`, `nullable`-avainsana, ei tyyppitaulukoita). Skeema pitäisi siis kirjoittaa erikseen.
- **Vika:** oletus oli vanhentunut. Nykyinen `responseJsonSchema` tukee JSON Schema -osajoukkoa, myös tyyppitaulukot kuten `["string","null"]`. Lisäksi `maxLength` ja `minLength` hyväksytään, mutta niitä ei pakoteta. Structured output -sivu esittelee nyt ensisijaisesti uuden Interactions API:n, mutta `generateContent` on edelleen dokumentoitu eikä vanhentunut.
- **Huomattiin:** Gemini structured output -dokumentaatiosta ennen toteutusta.
- **Tehtiin:** skeema johdetaan yhteisestä skeemasta (`assessmentGeminiSchema`). (myöhemmin poistettu: `assessmentJsonSchema`, jota Gemini-skeema levitti. Nyt `assessmentGeminiSchema` on oma JSON Schema -objekti.) Rajat, jotka Gemini pakottaa (`minimum`, `maximum`, `maxItems`), lisätään skeemaan. Pituudet jätetään zodille. Skeemat ylläpidetään käsin rinnakkain. `schema.test.ts` testaa yhteystietojen poiston (`redactContacts`) ja arvion validoinnin (`parseAssessment`), ei Gemini-skeemaa. Vertailutesti zod-skeemaan on jatkokehitystä.

### 2026-10-23 – Jälki-ilmoitus tulkittiin ohita-tapaukseksi
- **AI ehdotti:** jälki-ilmoitukselle (Vaasan jäähdytys- ja automaatiosaneeraus, voittaja valittu) relevanssi 0–20 ja rooli ohita, koska kohdeyritys ei voi enää osallistua.
- **Vika:** jälki-ilmoitus on aliurakkasignaali, koska pääurakoitsijalle tarjotaan automaatiourakkaa. Prompt ei sanonut tätä suoraan.
- **Huomattiin:** ensimmäisessä oikeassa Gemini-testissä, kolme ajoa, kaikki ohita.
- **Tehtiin:** SYSTEM_PROMPTiin sääntö: jälki-ilmoitus on aliurakka, jos hankinta koskee rakentamista, talotekniikkaa tai kokonaisurakkaa (poikkeus: voitettu automaatiourakka toiselle toimittajalle → seuraa). Mittaus: relevanssit 20, 0, 0 (ohita) → 65–75 (aliurakka).

### 2026-10-23 – Azure OpenAI -arvioija ei olisi toiminut valitulla mallilla
- **AI ehdotti:** `AzureOpenAIAssessor` `temperature: 0` -parametrilla ja mallilla `gpt-5.6-luna` (ohjeen tiedosto poistettu).
- **Vika:** päättelymalli ei tue `temperature`a, joten jokainen kutsu olisi epäonnistunut. Testit käyttivät vain valeasiakasta.
- **Huomattiin:** julkaisun valmistelussa, kun parametrituki tarkistettiin Microsoftin dokumentaatiosta.
- **Tehtiin:** ei korjattu, koska julkaisu siirtyi GitHub Pagesiin. Azure-korjausohjeet poistettiin ARCHITECTURE.md:stä.

### 2026-10-23 – Eräajon aikaraja arvioitiin liian pieneksi
- **AI ehdotti:** (pääagentin ohje aliagentille) Pages-workflow'n build-jobin aikaraja 30 minuuttia.
- **Vika:** eräajo tekee enintään 150 Gemini-kutsua rinnakkaisuudella 2. Ilmaistasolla yksittäinen kutsu on mitattu 20–25 sekunniksi, joten pahimmillaan ajo kestää noin 30 minuuttia tai enemmän. Aikakatkaisu olisi kaatanut ajon juuri kiireisenä päivänä, eikä uutta dataa olisi julkaistu.
- **Huomattiin:** vertaamalla ohjetta aiempaan mittaukseen tässä samassa tiedostossa (kohta "Jälki-ilmoitus tulkittiin ohita-tapaukseksi").
- **Tehtiin:** aikaraja 60 minuuttiin. Arvioiden enimmäismäärä on säädettävä repomuuttujalla `AI_MAX_ASSESSMENTS`. (Myöhemmin lisätty: aikabudjetti `AI_TIME_BUDGET_MIN`, oletus 40 min.)

### 2026-10-23 – Ristiriitainen ohje eräajon paluukoodista
- **AI ehdotti:** (pääagentin ohje aliagentille) "jos kaikki AI-arviot epäonnistuvat, päätä koodilla 2" ja samassa kappaleessa "workflow julkaisee normaalisti".
- **Vika:** GitHub Actions kaataa vaiheen jokaisella nollasta poikkeavalla koodilla, joten molemmat eivät voi pitää paikkaansa.
- **Huomattiin:** tarkistettaessa aliagentin toteutusta (`scripts/build-data.ts`).
- **Tehtiin:** päätettiin, että koodi 2 estää julkaisun. Pagesiin jää silloin edellinen, AI-arvioitu versio, mikä on demolle parempi kuin lista ilman arvioita. Kirjattu `ARCHITECTURE.md`:n vikasietoisuustaulukkoon.

### 2026-10-23 – Gemini-kutsun aikakatkaisua ei yritetty uudelleen
- **AI ehdotti:** `GeminiAssessor` yrittää uudelleen vain statuksilla 429 ja 503, ja aikakatkaisu on 30 s.
- **Vika:** ilmaistason kutsu voi kestää yli 30 s. Aikakatkaisu johti suoraan epäonnistuneeseen arvioon.
- **Huomattiin:** oikeassa eräajossa 4/56 arviota epäonnistui virheellä "The operation was aborted due to timeout".
- **Tehtiin:** aikaraja nostettiin 60 s:iin. Aikakatkaisu ja verkkovirhe yritetään uudelleen samalla backoffilla kuin 429/503. Testit: `gemini.test.ts` kattaa RetryInfo-odotusajan ja 429-virheen merkinnän palvelun virheeksi, ja `batch.test.ts` kattaa palvelun virheiden peräkkäisrajan ja pysyvän virheen pysäytyksen. Aikakatkaisun ja verkkovirheen uusintaa ei ole testattu erikseen. Uusinta-ajossa 56/56 onnistui.

### 2026-10-23 – Malli toisti yhteyshenkilön tiedot julkiselle sivulle
- **AI ehdotti:** `nextStep`-kentän ohje ("konkreettinen seuraava askel") ilman rajausta henkilötietoihin.
- **Vika:** malli kirjoitti nextStepiin ilmoituksen yhteyshenkilön nimen ja puhelinnumeron. Tieto on Hilmassa julkista, mutta sitä ei ole tarkoitus koostaa julkiselle sivulle.
- **Huomattiin:** käymällä oikean eräajon nextStep-arvot läpi ennen julkaisua.
- **Tehtiin:** promptiin lisättiin kielto kirjoittaa henkilöiden nimiä, puhelinnumeroita ja sähköposteja. Uusinta-ajon tekstikentistä haettiin säännöllisillä lausekkeilla: puhelinnumeroita 0, sähköposteja 0.

### 2026-10-23 – Hakuikkuna putosi julkaisupäivän mukaan
- **AI ehdotti:** haku rajattiin julkaisupäivän 7 päivän ikkunaan.
- **Vika:** avoimet tarjouspyynnöt putosivat listalta viikossa, eikä kiireellisyyssääntö lauennut oikeassa datassa. Kiireellisyys lasketaan määräajasta (alle 7 päivää), joten ilmoitus, joka oli julkaistu yli viikko sitten mutta jonka määräaika oli vielä edessä, ei päässyt hakuun.
- **Huomattiin:** kontekstiton code review -agentti huomasi.
- **Tehtiin:** haku laajennettiin `deadline ge now` -ehdolla: `(datePublished ge since) or (deadline ge now)`. Katto nostettiin 5000:een, ja katkaisu pysäyttää ajon.

### 2026-10-23 – Malli kirjoitti virkailijan sähköpostin nextStep-kenttään
- **AI ehdotti:** `nextStep`-kentän ohje, jossa kielto yhteystiedoille oli vain promptissa.
- **Vika:** malli kirjoitti nextStepiin kohdeilmoituksen yhteyshenkilön sähköpostiosoitteen kiellosta huolimatta. Prompt ei ole riittävä raja, koska malli voi rikkoa sen.
- **Huomattiin:** julkaistusta `data.json`:sta, jota ei ollut tarkistettu yhteystietojen varalta.
- **Tehtiin:** deterministinen poisto zod-validointiin (`redactContacts` ja `assessmentSchema`). Sähköpostit ja puhelinnumerot korvataan merkinnällä `[yhteystieto Hilmassa]`. Välimuistin vanhat arviot kulkevat saman validoinnin läpi, joten ne siivoutuvat ilman uutta AI-kutsua. Alkuperäisen ilmoituksen yhteystiedot löytyvät Hilmasta ilmoituslinkin kautta.

### 2026-10-23 – Yksi epäonnistunut AI-arvio esti koko julkaisun
- **AI ehdotti:** eräajon paluukoodi 2, kun kaikki uudet AI-arviot epäonnistuvat. Koodi 2 esti julkaisun.
- **Vika:** Gemini palautti päiväkiintiön loppumisen (429) yhdelle uudelle arviolle. Ajossa oli 177 arviota, joista 176 tuli välimuistista. Yksi epäonnistui, joten `runExitCode` palautti 2 ("kaikki yritetyt AI-arviot epäonnistuivat") ja julkaisu estyi, vaikka data oli lähes kokonaan arvioitu. Sääntö oli kapeampi kuin sen tarkoitus.
- **Huomattiin:** ensimmäisistä GitHub Actions -ajoista, joissa julkaisu jäi tekemättä lähes täysin arvioidulla datalla.
- **Tehtiin:** sääntö rajattiin tilanteeseen, jossa datassa ei ole yhtään AI-arviota (`reused === 0`). Yksittäinen epäonnistuminen julkaistaan, varoitus kirjoitetaan lokiin ja rivit yritetään seuraavalla ajolla. Testit: 1 epäonnistunut + 176 välimuistista → 0, 177 pending + 5 epäonnistunut + 0 välimuistista → 2.

### 2026-10-23 – Pysyvä AI-virhe jäi vihreän ajon taakse
- **AI ehdotti:** edellisen kohdan korjaus rajasi koodin 2 ehdon muotoon `reused === 0`, joten välimuistista tullut yksikin arvio riitti vihreään ajoon.
- **Vika:** pysyvä virhe (väärä avain tai tuntematon malli, fatal 401/404) pysäytti erän, mutta jos välimuistissa oli arvioita, ajo onnistui eikä virhe näkynyt missään. Julkaistu data jäi vanhoille arvioille, ja virhe jäi huomaamatta.
- **Huomattiin:** riippumattomassa katselmoinnissa, joka luki paluukoodilogiikan ilman aiempaa kontekstia.
- **Tehtiin:** erä kertoo pysyvän virheen (`fatal`), ja `runExitCode` palauttaa koodin 3: data kirjoitetaan ja julkaistaan, mutta ajo merkitään punaiseksi (`pages.yml`:n deploy-jobi). Koodi 2 säilyy: tyhjä AI-data (pending > 0, assessed 0, reused 0) antaa sen riippumatta failed-arvosta. Testit kattavat koodit 1, 2 ja 3 sekä tapauksen, jossa kutsuraja on 0.