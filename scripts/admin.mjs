// Rutas de administración de una barra desplegada. Ver negocio/docs/10.
//
//   node scripts/admin.mjs <archivo-de-claves> respaldo <salida.json>
//   node scripts/admin.mjs <archivo-de-claves> foto <salida.json>
//
// El archivo de claves (ignorado por git, como .dev.vars.pruebas) tiene URL, CLAVE y,
// para importar, MIGRACION. Así las claves no quedan en el historial de la terminal.

import { readFileSync, writeFileSync } from "node:fs";

const [archivoClaves, accion, archivo] = process.argv.slice(2);
if (!archivoClaves || !["respaldo", "foto", "importar"].includes(accion) || !archivo) {
  console.error("Uso: node scripts/admin.mjs <archivo-de-claves> respaldo|foto|importar <archivo>");
  process.exit(1);
}
const vars = Object.fromEntries(
  readFileSync(archivoClaves, "utf8").split("\n")
    .map((l) => /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l))
    .filter(Boolean).map((m) => [m[1], m[2]]),
);
for (const k of ["URL", "CLAVE"]) if (!vars[k]) { console.error(`Falta ${k} en ${archivoClaves}`); process.exit(1); }

if (accion === "respaldo" || accion === "foto") {
  // Desde la fase D se lee con la llave de instalación (CLAVE): solo lectura.
  const r = await fetch(new URL(`/api/instalacion/${accion}`, vars.URL), { headers: { "x-llave": vars.CLAVE } });
  if (!r.ok) { console.error(`${accion}: HTTP ${r.status}`); process.exit(1); }
  const texto = await r.text();
  writeFileSync(archivo, texto);
  const d = JSON.parse(texto);
  console.log(`${accion} en ${archivo}: seq ${d.seq}${d.operaciones ? `, ${d.operaciones.length} operaciones` : ""}`);
} else {
  // Importar necesita una sesión de administrador (celular vinculado + PIN): ya no se
  // hace desde la terminal. Ver negocio/docs/10 si hay que volver a migrar.
  console.error("Importar ahora se hace con una sesión de administrador; ver negocio/docs/10.");
  process.exit(1);
}
