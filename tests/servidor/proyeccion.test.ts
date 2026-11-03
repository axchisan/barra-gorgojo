// E3 (docs/13, punto 3): el servidor guarda una proyección por cuenta y al despertar carga
// solo lo vigente. Regla 4: lo que muestra con la proyección (foto, días anteriores, CSV)
// tiene que ser idéntico a recalcular el registro completo, también después de reiniciar y
// de operar sobre cuentas viejas que ya no estaban en memoria.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { aplicar, estadoVacio, jornada, recortar, type Cuenta, type Estado, type Operacion } from "../../src/dominio/estado";
import { csvJornada, jornadasConMovimiento, resumenJornada } from "../../src/dominio/jornada";
import { arrancar, op, type Servidor } from "./arrancar";

const LLAVE = "llave-de-migracion-de-proyeccion";
const DIA = 24 * 3600_000;
const ahora = Date.now();
/** Mediodía en Colombia de hace `d` días: cada uno cae en su propia jornada. */
const hace = (d: number, minutos = 0) => {
  const hoy = Date.parse(`${jornada(ahora)}T17:00:00Z`);
  return hoy - d * DIA + minutos * 60_000;
};

let n = 0;
const id = (p: string) => `${p}-${++n}-proyeccion`;

/** Diez días de barra: cobradas, mesas a comida (una sin cobrar en cocina), una abierta vieja, cierres. */
function registro(): Operacion[] {
  const ops: Record<string, unknown>[] = [];
  const o = (en: number, x: Record<string, unknown>) => ops.push({ id: id("op"), persona: "Administrador", en, ...x });
  o(hace(11), { t: "producto", producto: { id: "colada", nombre: "Colada", corto: "COLADA", categoria: "otro", precio: 2000, activo: true, fondo: "#123456", texto: "#FFFFFF" } });
  o(hace(11, 1), { t: "orden", ids: ["colada", "rubia", "negra"] });
  for (let d = 10; d >= 1; d--) {
    const a = `a-${d}`, m = `m-${d}`, x = `x-${d}`;
    o(hace(d, 0), { t: "abrir", cuenta: a, nombre: `Grupo ${d}`, tipo: "grupo" });
    o(hace(d, 1), { t: "anotar", cuenta: a, ronda: `ra-${d}`, lineas: [{ id: `la-${d}`, producto: "rubia", cantidad: 3 }, { id: `lc-${d}`, producto: "colada", cantidad: 1 }] });
    o(hace(d, 2), { t: "abrir", cuenta: m, nombre: `Mesa ${d}`, tipo: "mesa", mesa: d });
    o(hace(d, 3), { t: "anotar", cuenta: m, ronda: `rm-${d}`, lineas: [{ id: `lm-${d}`, producto: "negra", cantidad: 2 }, { id: `lo-${d}`, producto: "otro", cantidad: 1, precio: 12000, nombre: "Almuerzo", comida: true }] });
    o(hace(d, 4), { t: "abrir", cuenta: x, nombre: `Persona ${d}`, tipo: "persona" });
    o(hace(d, 5), { t: "anotar", cuenta: x, ronda: `rx-${d}`, lineas: [{ id: `lx-${d}`, producto: "rubia", cantidad: 1 }] });
    o(hace(d, 60), { t: "cobrar", cuenta: a, pago: `pa-${d}`, medio: "efectivo", recibido: 50000 });
    o(hace(d, 61), { t: "cobrar", cuenta: m, pago: `pm-${d}`, medio: "comida" });
    if (d !== 5) o(hace(d, 62), { t: "comida_cobrada", cuenta: m, valor: true }); // la mesa 5 sigue en cocina: viva
    if (d !== 8) o(hace(d, 63), { t: "cobrar", cuenta: x, pago: `px-${d}`, medio: "nequi" }); // la persona 8 sigue abierta: viva
    if (d === 6) o(hace(d, 64), { t: "anular_cuenta", cuenta: x, motivo: "prueba" });
    o(hace(d, 120), { t: "cerrar_jornada", fecha: jornada(hace(d)), contado: 30000 + d });
  }
  return ops as unknown as Operacion[];
}

/** Lo que se espera: el registro completo recalculado, como lo hacía el servidor antes de E3. */
function recalcular(ops: Operacion[]): Estado {
  const e = estadoVacio();
  for (const x of [...ops].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) aplicar(e, x);
  return e;
}
const comoJson = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const enOrden = (cs: Cuenta[]) => [...cs].sort((a, b) => a.abiertaEn - b.abiertaEn || (a.id < b.id ? -1 : 1));

describe("proyección guardada (E3)", () => {
  const carpeta = mkdtempSync(join(tmpdir(), "barra-proyeccion-"));
  afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

  const leer = async (s: Servidor, admin: string, fechas: string[]) => {
    const foto = await s.foto(admin);
    const dias = (await (await s.pedir(admin, "/api/admin/jornadas")).json()) as { dias: unknown[] };
    const csv: Record<string, string> = {};
    for (const f of fechas) csv[f] = await (await s.pedir(admin, `/api/admin/jornadas/csv?fecha=${f}`)).text();
    const respaldo = (await (await s.pedir(admin, "/api/admin/respaldo")).json()) as { operaciones: Operacion[]; seq: number };
    return { foto, dias: dias.dias, csv, respaldo };
  };

  it("da lo mismo que recalcular todo, antes y después de reiniciar, también con cuentas viejas", async () => {
    let s = await arrancar({ persistir: carpeta, base: "proyeccion", migracion: LLAVE });
    let antes: Awaited<ReturnType<typeof leer>>;
    const fechas = [jornada(hace(9)), jornada(hace(6)), jornada(hace(3)), jornada(ahora)];
    try {
      const admin = await s.token("Administrador");
      const imp = await s.pedir(admin, "/api/admin/importar", { method: "POST", headers: { "x-migracion": LLAVE }, body: JSON.stringify({ operaciones: registro() }) });
      expect(imp.status).toBe(200);
    } finally {
      await s.apagar();
    }

    // Reiniciado, en memoria solo queda lo vigente: lo viejo se trae de la proyección.
    s = await arrancar({ persistir: carpeta, base: "proyeccion", migracion: LLAVE });
    try {
      const admin = await s.token("Administrador");
      // Operaciones sobre cuentas que ya no están en memoria (fuera de la ventana de 36 h).
      const r = (await s.ops(admin, [
        op({ t: "anotar", cuenta: "a-9", ronda: "tarde-9", lineas: [{ id: "tarde-9-l", producto: "rubia", cantidad: 2 }] }),
        op({ t: "reabrir", cuenta: "a-7" }),
        op({ t: "cantidad", cuenta: "a-6", linea: "la-6", cantidad: 5 }),
        op({ t: "cerrar_jornada", fecha: jornada(hace(3)), contado: 99999 }),
        op({ t: "abrir", cuenta: "a-4", nombre: "No debe cambiar", tipo: "grupo" }), // ya existe: no hace nada
        op({ t: "abrir", cuenta: "hoy", nombre: "De hoy", tipo: "grupo" }),
        op({ t: "anotar", cuenta: "hoy", ronda: "hoy-r", lineas: [{ id: "hoy-l", producto: "negra", cantidad: 1 }] }),
        op({ t: "cobrar", cuenta: "hoy", pago: "hoy-p", medio: "efectivo" }),
      ], "proyeccion")) as { ok: string[]; rechazadas?: unknown[] };
      expect(r.rechazadas ?? []).toEqual([]);
      expect(r.ok).toHaveLength(8);
      antes = await leer(s, admin, fechas);
    } finally {
      await s.apagar();
    }

    // Reiniciar: el objeto despierta con la proyección, sin recalcular el registro.
    s = await arrancar({ persistir: carpeta, base: "proyeccion", migracion: LLAVE });
    try {
      const admin = await s.token("Administrador");
      const despues = await leer(s, admin, fechas);
      expect(despues.foto.seq).toBe(antes.foto.seq);
      expect(despues.foto.estado).toEqual(antes.foto.estado);
      expect(despues.dias).toEqual(antes.dias);
      expect(despues.csv).toEqual(antes.csv);

      // Contra el registro completo recalculado.
      const completo = recalcular(despues.respaldo.operaciones);
      expect(despues.foto.estado).toEqual(comoJson(recortar(completo, Date.now())));
      const cuentas = Object.values(completo.cuentas);
      const dias = jornadasConMovimiento(cuentas).slice(0, 120).map((fecha) => {
        const { porProducto: _, ...x } = resumenJornada(cuentas, fecha);
        return { ...x, cierres: completo.jornadas?.[fecha] ?? [] };
      });
      expect(despues.dias).toEqual(comoJson(dias));
      for (const f of fechas) expect(despues.csv[f]).toBe(csvJornada(enOrden(cuentas), f)); // text() quita el BOM

      // Lo que debía pasar con las cuentas viejas.
      expect(completo.cuentas["a-9"].reabierta).toBe(true);
      expect(completo.cuentas["a-4"].nombre).toBe("Grupo 4");
      const cierre = completo.jornadas?.[jornada(hace(3))]?.at(-1);
      expect(cierre?.contado).toBe(99999);
      expect(cierre?.esperado).toBeGreaterThan(0); // sumó las cuentas de ese día, que no estaban en memoria

      // La foto solo trae lo vigente: lo vivo (mesa 5 en cocina, persona 8 abierta, la reabierta) y lo de hoy.
      const enFoto = Object.keys(despues.foto.estado.cuentas).sort();
      expect(enFoto).toEqual(expect.arrayContaining(["m-5", "x-8", "a-9", "hoy"]));
      expect(enFoto).not.toContain("a-2");
    } finally {
      await s.apagar();
    }
  });
});
