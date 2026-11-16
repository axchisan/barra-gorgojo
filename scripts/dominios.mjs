// Dominios propios del Worker para `wrangler deploy --domain …`. Viven en
// negocio/despliegue.json (privado: el repositorio público no lleva direcciones de
// producción, regla 16). Sin ese archivo no se pasa ninguno y el Worker queda solo en
// workers.dev, como en un clon nuevo.
//
//   negocio/despliegue.json → { "produccion": ["barra.ejemplo.com"], "pruebas": ["barra-pruebas.ejemplo.com"] }
//   node scripts/dominios.mjs produccion   → imprime «--domain barra.ejemplo.com»
import { existsSync, readFileSync } from "node:fs";

const entorno = process.argv[2] ?? "produccion";
const archivo = new URL("../negocio/despliegue.json", import.meta.url);
if (!existsSync(archivo)) process.exit(0);
const dominios = JSON.parse(readFileSync(archivo, "utf8"))[entorno] ?? [];
for (const d of dominios) {
  if (!/^[a-z0-9.-]+$/.test(d)) throw new Error(`Dominio inválido en negocio/despliegue.json: ${d}`);
}
// El primero es la dirección propia: abrir la página por otra (workers.dev) lleva a ella.
const direccion = dominios.length ? [`--var DIRECCION:https://${dominios[0]}`] : [];
// (El correo semanal del respaldo se quitó el 2026-11-16: la clave «respaldo» de
// negocio/despliegue.json ya no se usa.)
process.stdout.write([...dominios.map((d) => `--domain ${d}`), ...direccion].join(" "));
