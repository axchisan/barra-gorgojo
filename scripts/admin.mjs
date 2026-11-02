// Rutas de administración de una barra desplegada. Ver negocio/docs/10.
//
//   node scripts/admin.mjs <archivo-de-claves> respaldo <salida.json>
//   node scripts/admin.mjs <archivo-de-claves> foto <salida.json>
//   node scripts/admin.mjs <archivo-de-claves> importar migracion/registro-limpio.json
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

const entrar = await fetch(new URL("/api/entrar", vars.URL), {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ persona: "Administrador", clave: vars.CLAVE }),
});
const sesion = await entrar.json();
if (!entrar.ok) { console.error(`No se pudo entrar: ${sesion.error ?? entrar.status}`); process.exit(1); }
const conSesion = { authorization: `Bearer ${sesion.token}` };
console.log(`Base: ${sesion.base}`);

if (accion === "respaldo" || accion === "foto") {
  const r = await fetch(new URL(accion === "respaldo" ? "/api/admin/respaldo" : "/api/foto", vars.URL), { headers: conSesion });
  if (!r.ok) { console.error(`${accion}: HTTP ${r.status}`); process.exit(1); }
  const texto = await r.text();
  writeFileSync(archivo, texto);
  const d = JSON.parse(texto);
  console.log(`${accion} en ${archivo}: seq ${d.seq}${d.operaciones ? `, ${d.operaciones.length} operaciones` : ""}`);
} else {
  if (!vars.MIGRACION) { console.error(`Falta MIGRACION en ${archivoClaves}`); process.exit(1); }
  const { operaciones } = JSON.parse(readFileSync(archivo, "utf8"));
  const r = await fetch(new URL("/api/admin/importar", vars.URL), {
    method: "POST", headers: { ...conSesion, "content-type": "application/json", "x-migracion": vars.MIGRACION },
    body: JSON.stringify({ operaciones }),
  });
  console.log(`importar: HTTP ${r.status} ${await r.text()}`);
  if (!r.ok) process.exit(1);
}
