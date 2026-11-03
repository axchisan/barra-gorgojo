// El día: resumen, cierre (RF-51) y CSV (RF-53).
import { describe, expect, it } from "vitest";
import { aplicar, estadoVacio, recortar, type Operacion } from "../src/dominio/estado";
import { csvJornada, jornadasConMovimiento, resumenJornada } from "../src/dominio/jornada";

const DIA = Date.parse("2026-03-10T18:00:00Z"); // jornada 2026-03-10, 1 p. m. en Colombia
const AYER = DIA - 24 * 3600_000;
let n = 0;
const op = (o: Record<string, unknown>, en = DIA) => ({ id: `op-${++n}-xxxxxxxx`, persona: "Ana", en, ...o }) as Operacion;
const correr = (ops: Operacion[]) => ops.reduce((e, o) => aplicar(e, o), estadoVacio());

const base = () => [
  op({ t: "abrir", cuenta: "a", nombre: "Grupo; de \"Juan\"", tipo: "grupo" }),
  op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [{ id: "a1", producto: "rubia", cantidad: 3 }, { id: "a2", producto: "otro", cantidad: 1, precio: 20000, nombre: "Almuerzo", comida: true }] }),
  op({ t: "cobrar", cuenta: "a", pago: "p1", medio: "efectivo" }),
  op({ t: "abrir", cuenta: "b", nombre: "Nequi", tipo: "persona" }),
  op({ t: "anotar", cuenta: "b", ronda: "r2", lineas: [{ id: "b1", producto: "agua", cantidad: 2 }] }),
  op({ t: "cobrar", cuenta: "b", pago: "p2", medio: "nequi" }),
  op({ t: "abrir", cuenta: "x", nombre: "Anulada", tipo: "grupo" }),
  op({ t: "anotar", cuenta: "x", ronda: "r3", lineas: [{ id: "x1", producto: "rubia", cantidad: 9 }] }),
  op({ t: "anular_cuenta", cuenta: "x", motivo: "prueba" }),
  op({ t: "abrir", cuenta: "ayer", nombre: "Ayer", tipo: "grupo" }, AYER),
  op({ t: "anotar", cuenta: "ayer", ronda: "r4", lineas: [{ id: "y1", producto: "negra", cantidad: 1 }] }, AYER),
  op({ t: "cobrar", cuenta: "ayer", pago: "p4", medio: "efectivo" }, AYER),
];

describe("el día", () => {
  it("suma lo vendido y cobrado en la jornada, sin anuladas ni otros días", () => {
    const e = correr(base());
    const r = resumenJornada(Object.values(e.cuentas), "2026-03-10");
    expect(r.vendido).toBe(3 * 4000 + 20000 + 2 * 2500);
    expect(r.vendidoComida).toBe(20000);
    expect(r.porMedio).toEqual({ efectivo: 32000, nequi: 5000, breve: 0, comida: 0 });
    expect(r.efectivo).toBe(32000);
    expect(r.cuentas).toBe(2);
    expect(r.porProducto.map((p) => [p.nombre, p.cantidad])).toEqual([["Rubia", 3], ["Agua", 2], ["Almuerzo", 1]]);
    expect(jornadasConMovimiento(Object.values(e.cuentas))).toEqual(["2026-03-10", "2026-03-09"]);
  });

  it("cerrar el día guarda el contado, el esperado de ese momento y quién; repetir la operación no duplica", () => {
    const cierre = op({ t: "cerrar_jornada", fecha: "2026-03-10", contado: 30000 });
    const e = correr([...base(), cierre, cierre]);
    expect(e.jornadas?.["2026-03-10"]).toEqual([{ id: cierre.id, por: "Ana", en: DIA, contado: 30000, esperado: 32000 }]);
  });

  it("se puede volver a cerrar si después entra un cobro; queda cada cierre", () => {
    const e = correr([
      ...base(),
      op({ t: "cerrar_jornada", fecha: "2026-03-10", contado: 32000 }),
      op({ t: "abrir", cuenta: "tarde", nombre: "Tarde", tipo: "grupo" }),
      op({ t: "anotar", cuenta: "tarde", ronda: "r5", lineas: [{ id: "t1", producto: "rubia", cantidad: 1 }] }),
      op({ t: "cobrar", cuenta: "tarde", pago: "p5", medio: "efectivo" }),
      op({ t: "cerrar_jornada", fecha: "2026-03-10", contado: 36000 }),
    ]);
    expect(e.jornadas?.["2026-03-10"].map((c) => [c.contado, c.esperado])).toEqual([[32000, 32000], [36000, 36000]]);
  });

  it("descarta cierres con fecha o contado inválidos, y la foto conserva los cierres", () => {
    const e = correr([...base(), op({ t: "cerrar_jornada", fecha: "ayer", contado: 10 }), op({ t: "cerrar_jornada", fecha: "2026-03-10", contado: -5 }), op({ t: "cerrar_jornada", fecha: "2026-03-10", contado: 1000 })]);
    expect(e.jornadas?.["2026-03-10"]).toHaveLength(1);
    expect(e.jornadas?.ayer).toBeUndefined();
    expect(recortar(e, DIA + 90 * 24 * 3600_000).jornadas?.["2026-03-10"]).toHaveLength(1);
  });

  it("el CSV trae una fila por producto vendido, separado por «;» y con comillas donde hace falta", () => {
    const e = correr(base());
    const filas = csvJornada(Object.values(e.cuentas), "2026-03-10").trim().split("\r\n");
    expect(filas[0]).toBe("fecha;hora;cuenta;tipo;pedida;anotó;producto;cantidad;precio;valor;comida;cuenta quedó;cobro");
    expect(filas).toHaveLength(1 + 3);
    expect(filas[1]).toContain('"Grupo; de ""Juan"""');
    expect(filas[1].split(";").slice(-7)).toEqual(["Rubia", "3", "4000", "12000", "no", "cobrada", "efectivo"]);
    expect(filas.join()).not.toContain("Anulada");
    expect(filas.join()).not.toContain("Ayer");
  });
});
