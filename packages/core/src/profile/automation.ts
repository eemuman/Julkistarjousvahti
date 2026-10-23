/**
 * Kohdeyrityksen profiili. Tämä on se osa, jonka myynti säätäisi itse.
 *
 * CPV-koodit on valittu käsin; tarkenna myynnin kanssa. Esisuodatus käyttää myös
 * avainsanoja, joten yksittäinen puuttuva koodi ei kaada osumaa.
 */
export interface Profile {
  /** Koodit, joissa kohdeyritys voi tarjota suoraan. Prefix-vertailu: "45331" osuu "45331000-6":een. */
  directCpvPrefixes: string[];
  /** Isot rakennushankkeet, joissa kohdeyritys on tyypillisesti aliurakoitsija. */
  constructionCpvPrefixes: string[];
  /**
   * Vahvat avainsanat: riittävät yksin läpäisyyn.
   * Avainsana voi päättyä "*": se on sananvartalo, joka osuu taivutusmuotoihin
   * (astevaihtelu: urakka → urakan, talotekniikka → talotekniikan). Ilman "*":ää
   * osuma on sama merkkijono. Lyhyet tunnukset (≤5 merkkiä) vaativat sanarajat.
   */
  directKeywords: string[];
  /**
   * Laajat vahvat avainsanat: osa directKeywords-listaa, joka on tehty tarkoituksella laajaksi. Esisuodatus päästää
   * ne läpi kuten muutkin vahvat, mutta varmuusarvio ei pidä niitä yksin vahvana signaalina (ks. scoring/confidence.ts).
   * Jokaisen merkinnän tulee löytyä myös directKeywords-listalta.
   */
  broadKeywords: string[];
  /**
   * Heikot rakennushankesanat (esim. "sairaala", "kokonaisurak*"). Läpäisevät
   * vain, jos ilmoituksella on talonrakennuksen CPV tai ei lainkaan CPV:tä.
   */
  constructionKeywords: string[];
  /** Avainsanat, jotka viittaavat selvästi muuhun alaan (vähentävät vääriä osumia). */
  negativeKeywords: string[];
  /** NUTS3 → lähin toimipiste. */
  officeByNuts3: Record<string, string>;
}

export const automationProfile: Profile = {
  directCpvPrefixes: [
    "42961", // Komento- ja ohjausjärjestelmä
    "48921", // Automaatiojärjestelmät
    "45331", // LVI-laitteiden asennustyöt
    "45343", // Palonehkäisylaitteiden asennustyöt (savunpoisto)
    "50710", // Sähkö- ja mekaanisten rakennuslaitteistojen korjaus ja huolto
    "50720", // Keskuslämmityksen korjaus ja huolto
    "71321", // Rakennusten mekaanisten ja sähköteknisten laitteistojen suunnittelu
  ],
  constructionCpvPrefixes: [
    "45215140", // Sairaalatilojen rakennustyöt
    "45214", // Koulutus- ja tutkimusrakennusten rakennustyöt
    "45210", // Talonrakennustyöt
    "45453", // Peruskorjaus ja kunnostus
  ],
  directKeywords: [
    // "automaatio*" kattaa myös rakennusautomaation, kiinteistöautomaation, automaatiourakan ja automaatiokeskuksen.
    "automaatio*", // laaja tarkoituksella: väärä negatiivinen maksaa enemmän kuin väärä positiivinen
    "lvisa",
    "savunpoisto",
    "leikkaussal*",
    "puhdastil*",
    "ohjauskesku*",
    "valvomo",
    "ddc",
    "fidelix",
    "desigo",
    "ecostruxure",
    "talotekniik*",
  ],
  broadKeywords: [
    "automaatio*", // ks. directKeywords: laaja tarkoituksella, mutta yksin ei riitä varmuudeksi
  ],
  constructionKeywords: [
    "sairaala",
    "pääurak*",
    "kokonaisurak*",
    "kvr",
    "allianssi",
    "uudisrakennu*",
    "peruskorjau*",
    "perusparannu*",
  ],
  negativeKeywords: ["siivous", "ruokapalvelu", "tilitoimisto", "henkilöstövuokraus", "ohjelmistolisenssi"],
  // Maakunta → lähin toimipiste karkeasti maanteitse. Esimerkkitoimipisteet: Tampere, Helsinki, Turku, Oulu. Myynti korvaa omilla.
  officeByNuts3: {
    // NUTS 2021 (vanhat ilmoitukset ja esimerkkidata)
    FI1B1: "Helsinki", // Helsinki-Uusimaa
    FI1C1: "Turku", // Varsinais-Suomi
    FI1C2: "Tampere", // Kanta-Häme
    FI1C3: "Helsinki", // Päijät-Häme
    FI1C4: "Helsinki", // Kymenlaakso
    FI1C5: "Helsinki", // Etelä-Karjala
    FI193: "Tampere", // Keski-Suomi
    FI194: "Tampere", // Etelä-Pohjanmaa
    FI195: "Tampere", // Pohjanmaa
    FI196: "Tampere", // Satakunta
    FI197: "Tampere", // Pirkanmaa
    FI1D1: "Helsinki", // Etelä-Savo
    FI1D2: "Tampere", // Pohjois-Savo
    FI1D3: "Oulu", // Pohjois-Karjala
    FI1D5: "Oulu", // Keski-Pohjanmaa
    FI1D7: "Oulu", // Lappi
    FI1D8: "Oulu", // Kainuu
    FI1D9: "Oulu", // Pohjois-Pohjanmaa
    // NUTS 2024 (Hilman nykyiset ilmoitukset), lähde: Eionet NUTS 2024
    // Ennallaan NUTS 2024:ssä (ei erillisiä rivejä): FI1B1, FI1C1, FI1C2, FI1C5, FI196, FI1D5, FI1D7–FI1D9.
    FI1C6: "Helsinki", // Päijät-Häme (2021: FI1C3)
    FI1C7: "Helsinki", // Kymenlaakso (2021: FI1C4)
    FI198: "Tampere", // Keski-Suomi (2021: FI193)
    FI199: "Tampere", // Etelä-Pohjanmaa (2021: FI194)
    FI19A: "Tampere", // Pohjanmaa (2021: FI195)
    FI19B: "Tampere", // Pirkanmaa (2021: FI197)
    FI1DA: "Helsinki", // Etelä-Savo (2021: FI1D1)
    FI1DB: "Tampere", // Pohjois-Savo (2021: FI1D2)
    FI1DC: "Oulu", // Pohjois-Karjala (2021: FI1D3)
    // Ahvenanmaa: ei maateitse yhteyttä, lähin toimipiste on lautan päässä Turussa.
    FI200: "Turku", // Ahvenanmaa
  },
};
