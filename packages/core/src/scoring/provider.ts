import { type Assessor } from "./ai.js";
import { DEFAULT_GEMINI_MODEL, GeminiAssessor } from "./gemini.js";

/** Palauttaa asetuksen arvon tai undefined, jos se on tyhjä. */
function value(env: Record<string, string | undefined>, name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

/** Luo Gemini-arvioijan ympäristömuuttujista. Heittää, jos GEMINI_API_KEY puuttuu. Virheviestiin tulee vain muuttujan nimi, ei arvoa. */
export function geminiFromEnv(env: Record<string, string | undefined>): { assessor: Assessor; model: string } {
  const apiKey = value(env, "GEMINI_API_KEY");
  if (!apiKey) throw new Error("Puuttuvat asetukset: GEMINI_API_KEY");
  const model = value(env, "GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL;
  return { assessor: new GeminiAssessor({ apiKey, model }), model };
}
