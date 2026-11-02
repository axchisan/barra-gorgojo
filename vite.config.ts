import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

/** Pone en dist/sw.js un nombre de caché con el hash del paquete de esta compilación. */
function versionarSw(): Plugin {
  let salida = "dist";
  return {
    name: "versionar-sw",
    apply: "build",
    configResolved(c) { salida = c.build.outDir; },
    closeBundle() {
      const html = readFileSync(join(salida, "index.html"), "utf8");
      const hash = /assets\/index-([\w-]+)\.js/.exec(html)?.[1];
      if (!hash) throw new Error("versionar-sw: no encontré el paquete en index.html");
      const sw = join(salida, "sw.js");
      const antes = readFileSync(sw, "utf8");
      const despues = antes.replace(/const CACHE = "barra-[^"]*";/, `const CACHE = "barra-${hash}";`);
      if (despues === antes) throw new Error("versionar-sw: no encontré CACHE en sw.js");
      writeFileSync(sw, despues);
    },
  };
}

const ejemplo = fileURLToPath(new URL("./negocio.ejemplo/catalogo.ts", import.meta.url));

export default defineConfig({
  plugins: [react(), versionarSw()],
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
