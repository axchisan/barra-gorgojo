import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const ejemplo = fileURLToPath(new URL("./negocio.ejemplo/catalogo.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  // NEGOCIO=ejemplo compila con el catálogo de ejemplo (pruebas de extremo a extremo).
  resolve: { alias: process.env.NEGOCIO === "ejemplo" ? { "#negocio": ejemplo } : {} },
  build: { outDir: "dist", emptyOutDir: true },
  test: {
    // Las pruebas corren siempre con el catálogo de ejemplo, nunca con el del negocio.
    alias: { "#negocio": ejemplo },
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    // Las pruebas del servidor levantan workerd: arrancar tarda unos segundos.
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
