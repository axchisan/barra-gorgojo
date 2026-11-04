// Carga un registro depurado (pnpm migrar) en una base nueva y vacía, y lo comprueba.
// Ver negocio/docs/10 y la fase G de docs/12.
//
//   pnpm importar-base <archivo-de-claves> <registro.json>
//
// El archivo de claves (ignorado por git) tiene URL, CLAVE (llave de instalación) y
// MIGRACION (el secreto que enciende importar mientras dura la migración).
//
// Una base nueva no tiene celulares ni PIN. El script vincula un celular «Terminal
// (importación)» con la llave de instalación, entra como administrador creando un PIN al
// azar que nadie conoce, importa, comprueba y le quita ese PIN: el administrador crea el
// suyo la primera vez que entre. El celular de la terminal queda sin uso; se puede quitar
// en «Personas y celulares».

import { randomInt } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { aplicar, estadoVacio, catalogo, type Operacion } from "../src/dominio/estado";

const [archivoClaves, archivoRegistro] = process.argv.slice(2);
if (!archivoClaves || !archivoRegistro) {
  console.error("Uso: pnpm importar-base <archivo-de-claves> <registro.json>");
  process.exit(1);
}
const v = Object.fromEntries(
  readFileSync(archivoClaves, "utf8").split("\n").map((l) => /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l)).filter(Boolean).map((m) => [m![1], m![2]]),
);
for (const k of ["URL", "CLAVE", "MIGRACION"]) if (!v[k]) { console.error(`Falta ${k} en ${archivoClaves}`); process.exit(1); }
const registro = JSON.parse(readFileSync(archivoRegistro, "utf8")) as { operaciones: Operacion[] };

const pedir = (ruta: string, init: RequestInit = {}) => fetch(new URL(ruta, v.URL), init);
const json = { "content-type": "application/json" };
const falla = (m: string) => { console.error(`✗ ${m}`); process.exit(1); };

// 1. Un celular vinculado y el administrador adentro, con un PIN que nadie conoce.
const { codigo } = (await (await pedir("/api/instalacion/codigo", { method: "POST", headers: { "x-llave": v.CLAVE } })).json()) as { codigo?: string };
if (!codigo) falla("La llave de instalación no sirvió.");
const vin = await pedir("/api/vincular", { method: "POST", headers: json, body: JSON.stringify({ codigo, nombre: "Terminal (importación)" }) });
const vinculo = (await vin.json()) as { base?: string };
const cookie = vin.headers.get("set-cookie")?.split(";")[0] ?? "";
if (!cookie) falla("No se pudo vincular el celular de la terminal.");
console.log(`Base: ${vinculo.base}`);
const pinAlAzar = String(randomInt(0, 10_000)).padStart(4, "0");
const ent = (await (await pedir("/api/entrar", { method: "POST", headers: { ...json, cookie }, body: JSON.stringify({ persona: "administrador", pin: "", pinNuevo: pinAlAzar }) })).json()) as { token?: string; error?: string };
if (!ent.token) falla(`No se pudo entrar como administrador (${ent.error}). ¿La base ya tiene PIN de administrador? Entonces no es una base nueva.`);
const sesion = { cookie, authorization: `Bearer ${ent.token}` };

try {
  // 2. Importar (la base tiene que estar vacía: si no, el servidor responde 409).
  const imp = await pedir("/api/admin/importar", { method: "POST", headers: { ...sesion, ...json, "x-migracion": v.MIGRACION }, body: JSON.stringify({ operaciones: registro.operaciones }) });
  const r = (await imp.json()) as { seq?: number; cuentas?: number; total?: number; error?: string };
  if (!imp.ok) falla(`Importar respondió ${imp.status}: ${r.error}`);
  console.log(`Importado: seq ${r.seq}, ${r.cuentas} cuentas, $ ${r.total?.toLocaleString("es-CO")}`);

  // 3. Comprobar: mismas operaciones y mismo estado y catálogo que el registro.
  const resp = (await (await pedir("/api/admin/respaldo", { headers: sesion })).json()) as { operaciones: (Operacion & { recibida_en?: number })[] };
  const limpiar = (o: object) => { const { seq: _s, recibida_en: _r, ...x } = o as Record<string, unknown>; return JSON.stringify(x); };
  if (resp.operaciones.length !== registro.operaciones.length) falla(`El servidor tiene ${resp.operaciones.length} operaciones y el registro ${registro.operaciones.length}.`);
  const distinta = registro.operaciones.findIndex((o, i) => limpiar(o) !== limpiar(resp.operaciones[i]));
  if (distinta >= 0) falla(`La operación ${distinta + 1} (${registro.operaciones[distinta].id}) no quedó igual.`);
  const correr = (ops: Operacion[]) => ops.reduce((e, o) => aplicar(e, o), estadoVacio());
  const esperado = correr(registro.operaciones), quedo = correr(resp.operaciones);
  if (JSON.stringify(esperado) !== JSON.stringify(quedo)) falla("El estado recalculado no es igual.");
  if (JSON.stringify(catalogo(esperado)) !== JSON.stringify(catalogo(quedo))) falla("El catálogo no es igual.");
  writeFileSync("migracion/importacion.json", JSON.stringify({ en: new Date().toISOString(), base: vinculo.base, ...r }, null, 1));
  console.log("✓ Mismas operaciones, mismo estado y mismo catálogo.");
} finally {
  // 4. El PIN al azar no se queda: el administrador crea el suyo al entrar.
  const q = await pedir("/api/admin/personas", { method: "POST", headers: { ...sesion, ...json }, body: JSON.stringify({ accion: "pin", id: "administrador", pin: null }) });
  console.log(q.ok ? "PIN temporal del administrador quitado: lo crea al entrar." : `✗ No se pudo quitar el PIN temporal (${q.status}): quitarlo a mano.`);
}
