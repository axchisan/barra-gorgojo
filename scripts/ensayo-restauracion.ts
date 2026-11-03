// Ensayo de restauración (E5 de docs/12; docs/06 «Respaldos»): un respaldo que nunca se
// restauró no es un respaldo. Se hace cada trimestre, en local, sin tocar pruebas ni
// producción:
//
//   pnpm ensayo-restauracion            → el último respaldo diario de R2 (producción)
//   pnpm ensayo-restauracion archivo.json[.gz]   → un respaldo que ya se tenga
//
// 1. Baja de R2 el respaldo más reciente y deja una copia en migracion/respaldos/ (fuera
//    de Cloudflare: si la cuenta se pierde, queda esa copia).
// 2. Levanta el Worker real en local, con una base vacía, e importa el registro por la
//    ruta de migración (la misma que se usaría para restaurar de verdad).
// 3. Comprueba: las mismas operaciones, en el mismo orden; recalcular lo restaurado da el
//    mismo estado que el original; y la foto del servidor restaurado (que sale de la
//    proyección, ADR-13) es la del estado recalculado. Si algo no cuadra, sale con error.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { unstable_startWorker } from "wrangler";
import { aplicar, estadoVacio, recortar, type Estado, type Operacion } from "../src/dominio/estado";

const BUCKET = "barra-gorgojo-respaldos";
const CLAVE = "llave-del-ensayo";
const MIGRACION = "migracion-del-ensayo";
const PIN = "1357";

type Respaldo = { generado?: number; base?: string; seq: number; operaciones: (Operacion & { recibida_en?: number })[] };

const leer = (archivo: string): Respaldo => {
  const crudo = readFileSync(archivo);
  // Wrangler lo entrega ya descomprimido (se guarda con content-encoding gzip): se mira la firma.
  const gz = crudo[0] === 0x1f && crudo[1] === 0x8b;
  return JSON.parse((gz ? gunzipSync(crudo) : crudo).toString("utf8"));
};

/** El respaldo más reciente de R2 (hoy o hasta 10 días atrás), copiado a migracion/respaldos/. */
function bajarUltimo(): string {
  mkdirSync("migracion/respaldos", { recursive: true });
  for (let d = 0; d <= 10; d++) {
    const fecha = new Date(Date.now() - 5 * 3600_000 - d * 86400_000).toISOString().slice(0, 10);
    const destino = `migracion/respaldos/${fecha}.json`; // wrangler lo entrega descomprimido
    if (existsSync(destino)) return destino;
    try {
      execFileSync("npx", ["wrangler", "r2", "object", "get", `${BUCKET}/respaldos/${fecha}.json.gz`, "--remote", "--file", destino], { stdio: "pipe" });
      if (existsSync(destino)) return destino;
    } catch { /* ese día no hay: el anterior */ }
  }
  throw new Error("No encontré respaldos en R2 de los últimos 10 días.");
}

const sinMarcasDelServidor = (o: Record<string, unknown>) => {
  const { seq: _s, recibida_en: _r, ...resto } = o;
  return JSON.stringify(resto);
};
const recalcular = (ops: Operacion[]): Estado => {
  const e = estadoVacio();
  for (const o of ops) aplicar(e, o);
  return e;
};

const archivo = process.argv[2] ?? bajarUltimo();
const original = leer(archivo);
console.log(`Respaldo: ${archivo} · base ${original.base} · ${original.operaciones.length} operaciones · seq ${original.seq}`);

const carpeta = mkdtempSync(join(tmpdir(), "barra-ensayo-"));
const w = await unstable_startWorker({
  config: "wrangler.jsonc",
  bindings: {
    CLAVE: { type: "plain_text", value: CLAVE },
    PINES: { type: "plain_text", value: "pines-del-ensayo" },
    FIRMA: { type: "plain_text", value: "firma-del-ensayo-larga" },
    MIGRACION: { type: "plain_text", value: MIGRACION },
    BASE: { type: "plain_text", value: "ensayo-restauracion" },
  },
  dev: { persist: carpeta, server: { port: 0 }, inspector: false, watch: false, logLevel: "error" },
});
const fallas: string[] = [];
try {
  const dir = await w.url;
  const pedir = (ruta: string, init: RequestInit = {}) => fetch(new URL(ruta, dir), init);
  // Un celular vinculado y el administrador adentro, como en una base recién creada.
  const { codigo } = (await (await pedir("/api/instalacion/codigo", { method: "POST", headers: { "x-llave": CLAVE } })).json()) as { codigo: string };
  const v = await pedir("/api/vincular", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo, nombre: "Ensayo" }) });
  const cookie = v.headers.get("set-cookie")?.split(";")[0] ?? "";
  const e = (await (await pedir("/api/entrar", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ persona: "administrador", pin: "", pinNuevo: PIN }) })).json()) as { token?: string; error?: string };
  if (!e.token) throw new Error(`No se pudo entrar como administrador: ${e.error}`);
  const sesion = { cookie, authorization: `Bearer ${e.token}` };

  const t0 = Date.now();
  const imp = await pedir("/api/admin/importar", { method: "POST", headers: { ...sesion, "content-type": "application/json", "x-migracion": MIGRACION }, body: JSON.stringify({ operaciones: original.operaciones }) });
  if (!imp.ok) throw new Error(`Importar falló: ${imp.status} ${await imp.text()}`);
  console.log(`Importado en ${Date.now() - t0} ms`);

  const restaurado = (await (await pedir("/api/admin/respaldo", { headers: sesion })).json()) as Respaldo;
  const foto = (await (await pedir("/api/foto", { headers: sesion })).json()) as { seq: number; estado: Estado };

  // 1. Las mismas operaciones, en el mismo orden.
  if (restaurado.operaciones.length !== original.operaciones.length) fallas.push(`operaciones: ${original.operaciones.length} → ${restaurado.operaciones.length}`);
  const distintas = original.operaciones.filter((o, i) => sinMarcasDelServidor(o) !== sinMarcasDelServidor(restaurado.operaciones[i] ?? {}));
  if (distintas.length) fallas.push(`${distintas.length} operaciones distintas (la primera: ${distintas[0].id})`);
  // 2. Recalcular lo restaurado da el mismo estado que el original.
  const completoOriginal = recalcular(original.operaciones);
  const completoRestaurado = recalcular(restaurado.operaciones);
  if (JSON.stringify(completoOriginal) !== JSON.stringify(completoRestaurado)) fallas.push("el estado recalculado no es igual");
  // 3. La foto del servidor restaurado (de la proyección) es la del estado recalculado.
  const esperada = JSON.parse(JSON.stringify(recortar(completoOriginal, Date.now())));
  if (JSON.stringify(foto.estado) !== JSON.stringify(esperada)) fallas.push("la foto del servidor restaurado no coincide con recalcular el registro");

  const cuentas = Object.values(completoOriginal.cuentas);
  const total = cuentas.reduce((t, c) => t + c.lineas.reduce((s, l) => s + (l.anulada ? 0 : l.precio * l.cantidad), 0), 0);
  const informe = {
    fecha: new Date().toISOString(), respaldo: archivo, base: original.base, operaciones: original.operaciones.length, seq: original.seq,
    cuentas: cuentas.length, total, enFoto: Object.keys(foto.estado.cuentas).length, fallas,
  };
  writeFileSync("migracion/respaldos/ultimo-ensayo.json", JSON.stringify(informe, null, 1));
  console.log(`${cuentas.length} cuentas · total $ ${total.toLocaleString("es-CO")} · ${informe.enFoto} en la foto`);
} catch (err) {
  fallas.push(String(err));
} finally {
  await w.dispose();
  rmSync(carpeta, { recursive: true, force: true });
}
if (fallas.length) {
  console.error(`✗ El ensayo NO cuadró:\n- ${fallas.join("\n- ")}`);
  process.exit(1);
}
console.log("✓ Restauración comprobada: mismas operaciones, mismo estado y la foto coincide.");
process.exit(0);
