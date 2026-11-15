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

/**
 * Entorno de pruebas (ENTORNO=pruebas, lo pone `pnpm desplegar:pruebas`): la app instalada
 * se llama «Barra PRUEBA», con el ícono de la franja roja y la barra del sistema roja, para
 * no confundirla con la de verdad en la pantalla de inicio (docs/18).
 */
const PRUEBAS = process.env.ENTORNO === "pruebas";
function entornoPruebas(): Plugin {
  let salida = "dist";
  return {
    name: "entorno-pruebas",
    apply: "build",
    configResolved(c) { salida = c.build.outDir; },
    closeBundle() {
      if (!PRUEBAS) return;
      const ruta = join(salida, "manifest.webmanifest");
      const m = JSON.parse(readFileSync(ruta, "utf8"));
      m.name = "Barra del Gorgojo · PRUEBA";
      m.short_name = "Barra PRUEBA";
      m.description = "Entorno de pruebas y enseñanza: no es la caja real";
      m.theme_color = "#C62828";
      m.icons = m.icons.map((i: { src: string }) => ({ ...i, src: i.src.replace("/icono-", "/icono-pruebas-") }));
      writeFileSync(ruta, JSON.stringify(m, null, 2));
      const html = join(salida, "index.html");
      writeFileSync(html, readFileSync(html, "utf8")
        .replace("<title>Barra del Gorgojo</title>", "<title>Barra PRUEBA</title>")
        .replace('content="#241206"', 'content="#C62828"')
        .replace('href="/icono-192.png"', 'href="/icono-pruebas-192.png"'));
    },
  };
}

const ejemplo = fileURLToPath(new URL("./negocio.ejemplo/catalogo.ts", import.meta.url));

export default defineConfig({
  plugins: [react(), versionarSw(), entornoPruebas()],
  // Versión de la app: cuándo se compiló, en hora de Colombia. La ve el administrador en
  // «Personas y celulares» para saber si un celular quedó con una versión vieja (E4).
  define: { __ENTORNO__: JSON.stringify(PRUEBAS ? "pruebas" : "produccion"), __VERSION__: JSON.stringify(new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 16).replace("T", " ")) },
  // NEGOCIO=ejemplo compila con el catálogo de ejemplo (pruebas de extremo a extremo).
  resolve: { alias: process.env.NEGOCIO === "ejemplo" ? { "#negocio": ejemplo } : {} },
  build: { outDir: "dist", emptyOutDir: true },
  test: {
    // Las pruebas corren siempre con el catálogo de ejemplo, nunca con el del negocio.
    alias: { "#negocio": ejemplo },
    exclude: ["**/node_modules/**", "tests/e2e/**"],
    // Las pruebas del servidor levantan workerd: arrancar tarda unos segundos.
    hookTimeout: 60_000,
    // Un archivo a la vez: cada uno levanta varios Workers reales (workerd), y muchos a la
    // vez hacían que miniflare cortara la conexión con el Durable Object («Network connection
    // lost», un 500 de vez en cuando que no era de la app).
    fileParallelism: false,
    // Un reintento: aun así, miniflare corta a veces la conexión con el Durable Object justo
    // después de que otro archivo apaga sus Workers (visto el 2026-11-08: pasa 10 de 10 solo
    // y falla 1 de cada 5 en la suite completa). No es de la app; si una prueba falla dos
    // veces seguidas, sí es un error.
    retry: 1,
    testTimeout: 20_000,
  },
});
