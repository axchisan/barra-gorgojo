// Rechazar un pedido a la barra (docs/04 «Rechazar un pedido», 2026-11-15).
import { describe, expect, it } from "vitest";
import { aplicar, estadoVacio, porDespachar, total, type Operacion } from "../src/dominio/estado";
import { describir } from "../src/dominio/auditoria";

let n = 0;
const op = (o: Record<string, unknown>): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona: "Barra", en: 1_800_000_000_000 + n, ...o }) as Operacion;
const correr = (ops: Operacion[]) => ops.reduce((e, o) => aplicar(e, o), estadoVacio());
const pedido = () => [
  op({ t: "abrir", cuenta: "m", nombre: "Mesa 4", tipo: "mesa", mesa: 4 }),
  op({ t: "anotar", cuenta: "m", ronda: "r", area: "comida", lineas: [{ id: "g", producto: "gaseosa", cantidad: 2 }, { id: "b", producto: "rubia", cantidad: 1 }] }),
];

describe("rechazar un pedido a la barra", () => {
  it("lo rechazado queda anulado, con el motivo, y sale de por despachar", () => {
    const e = correr([...pedido(), op({ t: "rechazar_despacho", cuenta: "m", lineas: ["g"], motivo: " Se acabó " })]);
    const g = e.cuentas.m.lineas.find((l) => l.id === "g")!;
    expect(g.anulada).toBeTruthy();
    expect(g.rechazada).toMatchObject({ por: "Barra", motivo: "Se acabó" });
    expect(g.porDespachar).toBeUndefined();
    expect(porDespachar(Object.values(e.cuentas))[0].lineas.map((l) => l.id)).toEqual(["b"]);
    expect(total(e.cuentas.m)).toBe(4000);
  });

  it("sin decir cuáles, rechaza todo lo que está por despachar de la cuenta", () => {
    const e = correr([...pedido(), op({ t: "rechazar_despacho", cuenta: "m", motivo: "No hay fría" })]);
    expect(e.cuentas.m.lineas.every((l) => l.rechazada)).toBe(true);
    expect(total(e.cuentas.m)).toBe(0);
  });

  it("sin motivo no hace nada; lo ya despachado no se rechaza", () => {
    const e = correr([...pedido(), op({ t: "rechazar_despacho", cuenta: "m", motivo: "  " }), op({ t: "despachar", cuenta: "m", lineas: ["b"] }), op({ t: "rechazar_despacho", cuenta: "m", lineas: ["b"], motivo: "tarde" })]);
    expect(e.cuentas.m.lineas.some((l) => l.rechazada)).toBe(false);
    expect(e.cuentas.m.lineas.find((l) => l.id === "b")!.despachada).toBeTruthy();
  });

  it("la auditoría dice qué no se pudo y por qué", () => {
    const r = op({ t: "rechazar_despacho", cuenta: "m", lineas: ["g"], motivo: "Se acabó" });
    const e = correr([...pedido(), r]);
    expect(describir(r, e.cuentas.m).texto).toBe("No pudo despachar 2 Gaseosa personal · «Se acabó»");
  });
});
