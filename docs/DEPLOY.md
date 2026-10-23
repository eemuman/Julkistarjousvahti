# Julkaisu GitHub Pagesiin

Tarjousvahti julkaistaan staattisena sivuna GitHub Pagesiin. GitHub Actions ajaa arkiaamuisin eräajon: se hakee Hilmasta 7 päivän aikana julkaistut ja vielä määräaikaansa odottavat ilmoitukset, esisuodattaa ne, arvioi ne Geminillä ja julkaisee tuloksen (`data.json`) sivun mukana. Palvelinta, tietokantaa tai Azure-tiliä ei tarvita. Kustannus on 0 €.

Arkkitehtuuri ja perustelut: [ARCHITECTURE.md](ARCHITECTURE.md#päivittäinen-eräajo).

## Mitä tarvitset

- GitHub-tilin (ilmainen). Pages toimii ilmaistilillä vain julkisessa repossa.
- Hilma AVP-Read -avaimen (`HILMA_API_KEY`) ja Gemini API -avaimen (`GEMINI_API_KEY`). Voit pitää ne paikallisesti `.env`-tiedostossa (malli: `.env.example`). Avaimet syötetään GitHubiin vain secreteinä, ei koskaan repoon.

## 1. Tarkista ennen pushia

Repo tulee julkiseksi, joten kaikki pushattu näkyy kaikille.

**Historia.** Julkinen `main` alkaa yhdestä alkucommitista. **Pushaa vain `main`** (kohta 5). Älä käytä `git push --all`- tai `--mirror`-komentoa.

```bash
git ls-files | grep -E '(^|/)\.env$'
```

Komennon pitää tulostaa **ei mitään**. `.env` on `.gitignore`ssa.

Avaimet on tarkistettu 2026-10-23 koko kehityshistoriasta: Google-avaimia (`AIza…`), 32 merkin heksa-avaimia tai avainmuuttujia arvoineen ei löytynyt. Ainoa osuma oli testiarvo `TEST-KEY-…` tiedostossa `packages/core/test/gemini.test.ts`. Jos lisäät committeja ennen pushia, aja tarkistus uudelleen:

```bash
git log main -p | grep -cE 'AIza[0-9A-Za-z_-]{30,}|\b[0-9a-f]{32}\b'
```

Tuloksen pitää olla `0`.

## 2. GitHub-tili ja repo

1. Luo tili osoitteessa [github.com/signup](https://github.com/signup), jos sinulla ei vielä ole tiliä, ja ota kaksivaiheinen tunnistautuminen käyttöön.
2. **New repository** ([github.com/new](https://github.com/new)):
   - Repository name: oma repon nimi, esim. `Julkistarjousvahti`. Sivun osoitteeksi tulee `https://<käyttäjä>.github.io/<repo>/`. Workflow lukee alipolun repon nimestä automaattisesti.
   - Visibility: **Public**
   - Älä lisää README:tä, .gitignorea tai lisenssiä, koska repo pitää luoda tyhjänä.
3. **Create repository**.

## 3. Secretit

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Name | Arvo |
|---|---|
| `HILMA_API_KEY` | Hilma AVP-Read -avain |
| `GEMINI_API_KEY` | Gemini API -avain |

Kopioi arvot itse `.env`-tiedostosta. Secretit eivät näy lokeissa eivätkä forkeissa.

Valinnaiset muuttujat löytyvät samasta näkymästä välilehdeltä **Variables**. Ne eivät ole salaisia:

| Name | Oletus | Mitä tekee |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Gemini-malli |
| `AI_MAX_ASSESSMENTS` | ks. `.env.example` | Enimmäismäärä AI-arvioita yhdessä ajossa |

Aikabudjetin `AI_TIME_BUDGET_MIN` workflow ei aseta. Oletus on koodissa (ks. `.env.example`), ja sen voi lisätä `pages.yml`:n `env`-kohtaan.

## 4. Pages-lähde

Repo → **Settings** → **Pages** → **Build and deployment** → Source: **GitHub Actions**.

## 5. Push

Repon juuressa:

```bash
git remote add origin https://github.com/<käyttäjä>/<repo>.git
```

```bash
git push -u origin main
```

Git Credential Manager avaa selaimen GitHub-kirjautumista varten.

Push `main`-haaraan käynnistää sekä CI:n (`ci.yml`: testit ja buildit) että julkaisu-workflow'n (`pages.yml`). Julkaisu-workflow ajaa koko eräajon (Hilma ja Gemini) ja julkaisee sivun heti, joten ensimmäinen push tekee myös ensimmäiset AI-kutsut. Muiden haarojen pushit eivät julkaise mitään.

## 6. Ensimmäinen ajo käsin

Ensimmäinen push `main`-haaraan käynnistää ajon jo kohdan 5 jälkeen. Jos haluat ajaa sen erikseen:

1. Repo → **Actions** → **Päivittäinen data ja Pages** → **Run workflow** → **Run workflow**.
2. Ajon kesto ja aikarajat: ks. [ARCHITECTURE.md](ARCHITECTURE.md#päivittäinen-eräajo).
3. Build-jobin lokin `Eräajo`-vaiheessa näkyy yhteenveto: haettu, esisuodatuksen läpi, välimuistista, arvioitu, epäonnistui ja ohitettu.
4. Kun deploy-job on valmis, osoite näkyy sen kohdalla (`https://<käyttäjä>.github.io/<repo>/`).

Jos Hilma-haku epäonnistuu, ajo ei julkaise mitään (vikasietoisuus: ks. [ARCHITECTURE.md](ARCHITECTURE.md#päivittäinen-eräajo)).

## 7. Tarkistus

- [ ] Avaa osoite puhelimella. Lista latautuu, ja yläreunassa lukee "Päivitetty pp.kk. klo hh.mm".
- [ ] Korteilla on AI-arvioita (rooli ja yhteenveto). Jos arvio epäonnistui, kortissa lukee "AI-arvio ei saatavilla" ja esisuodatuksen tiedot.
- [ ] Ilmoituksen "Avaa Hilmassa" -linkki toimii.
- [ ] Sivun alalaidassa on Hilman lähdemaininta (CC BY 4.0).
- [ ] Kotinäytölle lisääminen toimii (manifest ja ikoni).

## Ylläpito

- **Ajastus**: arkisin klo 6.17 Suomen aikaa (`timezone: Europe/Helsinki`). GitHub voi viivästää ajastettuja ajoja kuormitettuna, ja ruuhkassa ajo voi jäädä kokonaan väliin. Ennen demoa aja workflow käsin (kohta 6).
- **Push mainiin**: jokainen push `main`-haaraan ajaa eräajon ja julkaisee sivun. Pushaa siis vain, kun haluat päivittää sivun tai muuttaa koodia, joka sen tuottaa.
- **60 päivän sääntö**: julkisen repon ajastetut workflow't pysähtyvät, jos repossa ei ole tapahtunut mitään 60 päivään. GitHub lähettää siitä sähköpostin. Ajastuksen saa takaisin päälle Actions-välilehdeltä.
- **Avaimen vaihto**: päivitä secret (kohta 3). Seuraava ajo käyttää uutta avainta.
- **Ajastuksen pysäytys**: Actions → workflow → **⋯** → **Disable workflow**.

## Lähteet

- [GitHub Pages: custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): `configure-pages@v5`, `upload-pages-artifact@v4`, `deploy-pages@v4`, oikeudet `pages: write` ja `id-token: write`
- [Workflow-tapahtumat: schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): aikavyöhyke, viiveet ja 60 päivän sääntö
- [Secretit Actionsissa](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
