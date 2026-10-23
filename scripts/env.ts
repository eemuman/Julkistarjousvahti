import { fileURLToPath } from "node:url";

/** Lataa .env-tiedoston repon juuresta, jos sellainen on. */
export function loadEnv(): void {
  try {
    // fileURLToPath eikä URL.pathname: pathname rikkoo Windows-polut ja välilyönnit (%20).
    process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
  } catch (err) {
    // .env puuttuu: käytetään ympäristömuuttujia sellaisenaan. Muut virheet näkyviin.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * Lukee pakollisen muuttujan. Arvo trimmataan: secretin perässä oleva rivinvaihto rikkoisi HTTP-headerin.
 * Pelkkä välilyönti tai tyhjä arvo tulkitaan puuttuvaksi.
 */
export function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Ympäristömuuttuja ${name} puuttuu. Lisää se .env-tiedostoon (ks. .env.example).`);
    process.exit(1);
  }
  return v;
}
