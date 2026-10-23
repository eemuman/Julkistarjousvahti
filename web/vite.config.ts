import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pagesin alipolku, esim. /<repo>/ (workflow asettaa)
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
});
