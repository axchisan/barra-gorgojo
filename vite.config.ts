import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  test: {
    // Las pruebas corren siempre con el catálogo de ejemplo, nunca con el del negocio.
    alias: { "#negocio": fileURLToPath(new URL("./negocio.ejemplo/catalogo.ts", import.meta.url)) },
  },
});
