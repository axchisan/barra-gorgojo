// `test` de Playwright con una base propia por archivo de prueba (deuda 5 de docs/16): cada
// petición lleva `x-base-e2e` con el nombre del archivo, y el servidor e2e
// (scripts/servidor-e2e.mjs, `BASES_E2E`) usa un Durable Object distinto para cada uno.
// Así lo que deja abierto una prueba no cambia lo que ve la siguiente. Dentro de un mismo
// archivo las pruebas siguen compartiendo base, como antes.
//
// Los contextos que una prueba abre con `browser.newContext()` heredan la cabecera; el
// WebSocket y el Service Worker usan la cookie que deja el servidor.

import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";
export type { APIRequestContext, Browser, BrowserContextOptions, Page, WebSocket } from "@playwright/test";

/** El nombre del archivo de prueba, como nombre de base («comida.spec.ts» → «comida»). */
export const baseDeArchivo = (archivo: string) =>
  (archivo.split(/[\\/]/).pop() ?? "").replace(/\.spec\.ts$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);

export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use, info) => {
    await use({ ...extraHTTPHeaders, "x-base-e2e": baseDeArchivo(info.file) });
  },
});
