// Servidor de las pruebas de extremo a extremo (playwright.config.ts): la app con el
// catálogo de ejemplo, clave «prueba» y una base nueva en cada corrida.
//
// Se levanta con `unstable_startWorker` y no con `wrangler dev --alias`, porque en
// `wrangler dev` el alias no reemplaza `#negocio` (un import de package.json) y el Worker
// terminaba usando el catálogo de negocio/.

import { rmSync } from "node:fs";
import { unstable_startWorker } from "wrangler";

const PUERTO = Number(process.env.PUERTO ?? 8788);
const PERSISTIR = ".wrangler/e2e";
rmSync(PERSISTIR, { recursive: true, force: true });

const w = await unstable_startWorker({
  config: "wrangler.jsonc",
  build: { alias: { "#negocio": "./negocio.ejemplo/catalogo.ts" } },
  assets: "dist-e2e",
  bindings: {
    CLAVE: { type: "plain_text", value: "prueba" },
    FIRMA: { type: "plain_text", value: "firma-solo-para-e2e" },
  },
  dev: { persist: PERSISTIR, server: { port: PUERTO }, inspector: false, watch: false, logLevel: "warn" },
});
console.log(`Servidor e2e en ${await w.url}`);
const apagar = async () => { await w.dispose(); process.exit(0); };
process.on("SIGINT", apagar);
process.on("SIGTERM", apagar);
