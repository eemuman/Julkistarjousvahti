import { z } from "zod";
import { type Assessment, CATEGORIES, ROLES } from "../types.js";

const SUMMARY_MAX = 300;
const REASON_MAX = 200;
const SCOPE_MAX = 300;
const NEXT_STEP_MAX = 160;

/**
 * Katkaisee tekstin enintään max merkkiin. Katkaisee mieluiten sanan rajalta ja lisää lopuksi "…".
 * Tulos on aina enintään max merkkiä pitkä.
 */
function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace >= max / 2 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

/**
 * Sähköpostiosoite. Tunnistaa @-merkin lisäksi kirjoitustavat "(at)" ja "[at]".
 */
const EMAIL_RE = /[\p{L}\d._%+-]+(?:@|\(at\)|\[at\])[\p{L}\d.-]+\.\p{L}{2,}/gu;
/**
 * Suomalainen puhelinnumero: +358-muoto tai 0-alkuinen, vähintään 9 numeroa. Suuntanumero voi olla sulkeissa,
 * esim. "(09) 310 12345" tai "+358 (0)40 123 4567". Tämän vuoksi 8-numeroiset CPV-koodit (09310000) ja
 * 7-numeroinen Y-tunnus eivät osu. 0-alku ei kelpaa, jos sitä edeltää numero ja välilyönti, joten rahasumman
 * ryhmä ("1 050 000 000") ei osu. Jos 0-alkua edeltää kirjain tai numero ja väliviiva tai kauttaviiva, kyse on
 * tunnisteesta (esim. "2026-0123456789", "MAT-0400123456"), joten sekään ei osu. Päivämäärät (31.12.2026) ja
 * vuosiluvut eivät osu, koska niiden numeroryhmät eivät ole välilyönnein tai väliviivoin erotettuja pitkiä jonoja.
 */
const PHONE_RE =
  /(?:\+358[\s-]?(?:\(0\)[\s-]?)?|(?<![\d\p{L}])(?<!\d\s)(?<![\p{L}\d][-/])\(?0)[1-9]\d{0,2}\)?(?:[\s-]?\d){7,8}(?!\d)/gu;
const CONTACT_MARK = "[yhteystieto Hilmassa]";

/**
 * Poistaa sähköpostit ja puhelinnumerot AI:n vapaatekstistä. Prompt kieltää yhteystiedot, mutta malli
 * kirjoitti silti yhteyshenkilön sähköpostin nextStep-kenttään, joten raja varmistetaan tässä koodissa.
 * Ajetaan ennen pituuskatkaisua, jotta merkintä ei jää katkaisun jälkeen puolinaiseksi.
 */
export function redactContacts(text: string): string {
  return text.replace(EMAIL_RE, CONTACT_MARK).replace(PHONE_RE, CONTACT_MARK);
}

/** Yhteystietojen poisto, sitten pituuskatkaisu. */
const clean = (max: number) => (text: string) => truncateText(redactContacts(text), max);

/**
 * Zod-skeema mallin vastauksen validointiin. Pituusrajat eivät hylkää vastausta: liian pitkä teksti
 * katkaistaan (sanan rajalta). Tyhjät summary- ja nextStep-kentät sekä puuttuvat kentät hylätään edelleen.
 * Kaikki vapaatekstikentät siivotaan yhteystiedoista. Välimuistin vanhat arviot kulkevat tämän läpi
 * (cache.ts reusableAssessment), joten niistäkin poistuu yhteystiedot ilman uutta arviointikutsua.
 */
export const assessmentSchema = z.object({
  relevance: z.number().int().min(0).max(100),
  category: z.enum(CATEGORIES),
  role: z.enum(ROLES),
  summary: z.string().min(1).transform(clean(SUMMARY_MAX)),
  reasons: z.array(z.string().transform(clean(REASON_MAX))).max(3),
  automationScope: z.string().transform(clean(SCOPE_MAX)).nullable(),
  nextStep: z.string().min(1).transform(clean(NEXT_STEP_MAX)),
}) satisfies z.ZodType<Assessment>;

/**
 * Gemini responseJsonSchema (JSON Schema -osajoukko). Gemini pakottaa numeroiden rajat ja taulukon
 * pituuden, joten ne lisätään tässä. Merkkijonojen pituusrajat ovat vain kuvauksissa: maxLength ei ole
 * mukana, koska Gemini ei pakota maxLength-rajaa. Pituudet katkaistaan zodilla (ks. assessmentSchema).
 * Skeemat ylläpidetään käsin rinnakkain. Automaattista vertailutestia, joka varmistaisi niiden yhtenevyyden,
 * ei ole (jatkokehitys).
 */
export const assessmentGeminiSchema = {
  type: "object",
  additionalProperties: false,
  required: ["relevance", "category", "role", "summary", "reasons", "automationScope", "nextStep"],
  properties: {
    relevance: { type: "integer", minimum: 0, maximum: 100, description: "0–100, kuinka relevantti kohdeyritykselle" },
    category: { type: "string", enum: [...CATEGORIES] },
    role: { type: "string", enum: [...ROLES] },
    summary: {
      type: "string",
      description: `Yhden virkkeen tiivistelmä suomeksi: mitä hankitaan ja kenelle. Enintään ${SUMMARY_MAX} merkkiä.`,
    },
    reasons: {
      type: "array",
      items: { type: "string", description: `Yksi lyhyt peruste, enintään ${REASON_MAX} merkkiä` },
      maxItems: 3,
      description: "Enintään 3 lyhyttä perustetta arviolle",
    },
    automationScope: {
      type: ["string", "null"],
      description: `Mitä automaatioon liittyvää hankintaan todennäköisesti sisältyy, enintään ${SCOPE_MAX} merkkiä, tai null`,
    },
    nextStep: {
      type: "string",
      description: `Yksi konkreettinen suomenkielinen lause, enintään ${NEXT_STEP_MAX} merkkiä: mitä kohdeyrityksen kannattaa tehdä seuraavaksi. Perustu vain ilmoitukseen.`,
    },
  },
} as const;
