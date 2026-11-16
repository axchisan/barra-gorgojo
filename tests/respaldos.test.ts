// Respaldos por niveles (docs/06 «Respaldos», docs/18 fase 3 b): qué se guarda cada día y
// dónde, con un bucket en memoria.
import { describe, expect, it } from "vitest";
import { claves, guardarRespaldo, lunesDe, ultimos, type Cubo } from "../src/servidor/respaldos";

function cubo(): Cubo & { claves: () => string[] } {
  const datos = new Map<string, Date>();
  let reloj = Date.UTC(2026, 10, 1);
  return {
    claves: () => [...datos.keys()].sort(),
    async put(clave) { datos.set(clave, new Date((reloj += 1000))); },
    async head(clave) { return datos.has(clave) ? {} : null; },
    async list({ prefix }) {
      return { objects: [...datos.entries()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, uploaded]) => ({ key, uploaded })), truncated: false };
    },
  };
}
const nada = new ArrayBuffer(4);

describe("respaldos por niveles", () => {
  it("el semanal lleva la fecha del lunes de su semana, y el mensual el mes", () => {
    expect(lunesDe("2026-11-16")).toBe("2026-11-16"); // lunes
    expect(lunesDe("2026-11-22")).toBe("2026-11-16"); // domingo
    expect(lunesDe("2026-11-01")).toBe("2026-10-26"); // domingo, semana que empezó en octubre
    expect(claves("2026-11-18")).toEqual({
      diarios: "respaldos/diarios/2026-11-18.json.gz",
      semanales: "respaldos/semanales/2026-11-16.json.gz",
      mensuales: "respaldos/mensuales/2026-11.json.gz",
    });
  });

  it("cada día guarda el diario; el semanal y el mensual solo el primero de su semana o su mes", async () => {
    const c = cubo();
    expect(await guardarRespaldo(c, "2026-11-17", nada, {})).toEqual(["diarios", "semanales", "mensuales"]);
    expect(await guardarRespaldo(c, "2026-11-18", nada, {})).toEqual(["diarios"]);
    // Otra semana: semanal nuevo. Otro mes: mensual nuevo (aunque el Cron no corrió el día 1).
    expect(await guardarRespaldo(c, "2026-11-23", nada, {})).toEqual(["diarios", "semanales"]);
    expect(await guardarRespaldo(c, "2026-12-03", nada, {})).toEqual(["diarios", "semanales", "mensuales"]);
    // Si el Cron se reintenta el mismo día, el diario se escribe otra vez (el mismo archivo).
    expect(await guardarRespaldo(c, "2026-12-03", nada, {})).toEqual(["diarios"]);
    expect(c.claves()).toEqual([
      "respaldos/diarios/2026-11-17.json.gz", "respaldos/diarios/2026-11-18.json.gz", "respaldos/diarios/2026-11-23.json.gz", "respaldos/diarios/2026-12-03.json.gz",
      "respaldos/mensuales/2026-11.json.gz", "respaldos/mensuales/2026-12.json.gz",
      "respaldos/semanales/2026-11-16.json.gz", "respaldos/semanales/2026-11-23.json.gz", "respaldos/semanales/2026-11-30.json.gz",
    ]);
  });

  it("dice cuál es el último de cada nivel y cuántos hay", async () => {
    const c = cubo();
    expect((await ultimos(c)).diarios).toEqual({ clave: null, subido: null, cuantos: 0 });
    await guardarRespaldo(c, "2026-11-17", nada, {});
    await guardarRespaldo(c, "2026-11-18", nada, {});
    const u = await ultimos(c);
    expect(u.diarios).toMatchObject({ clave: "respaldos/diarios/2026-11-18.json.gz", cuantos: 2 });
    expect(u.semanales).toMatchObject({ clave: "respaldos/semanales/2026-11-16.json.gz", cuantos: 1 });
    expect(u.mensuales).toMatchObject({ clave: "respaldos/mensuales/2026-11.json.gz", cuantos: 1 });
    expect(typeof u.diarios.subido).toBe("number");
  });
});
