// Deudas (docs/15): pasar una cuenta o parte de ella a deuda, deudas anotadas a mano,
// pagos aparte de la caja, y deshacer.
import { describe, expect, it } from "vitest";
import { comidaDeudor, pagosDeudasDe, saldoDeudor } from "../src/dominio/deudas";
import { PRECIO_CANCHA_DESDE, aplicar, efectivoDeJornada, estadoVacio, jornada, saldo, situacion, type Estado, type Operacion } from "../src/dominio/estado";

let n = 0;
const op = (o: Record<string, unknown>, persona = "Ana"): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona, en: PRECIO_CANCHA_DESDE + 1_000 + n, ...o }) as Operacion;
const correr = (ops: Operacion[], e: Estado = estadoVacio()) => ops.reduce((x, o) => aplicar(x, o), e);
// Rubia $ 4.000; un plato de $ 10.000.
const base = () => [
  op({ t: "producto", producto: { id: "sopa", nombre: "Sopa", corto: "SOPA", categoria: "comida", precio: 10_000, activo: true, fondo: "#8A4F2E", texto: "#FFFFFF" } }, "Administrador"),
  op({ t: "abrir", cuenta: "m", nombre: "Mesa 2", tipo: "mesa", mesa: 2 }),
  op({ t: "anotar", cuenta: "m", ronda: "r1", lineas: [{ id: "b", producto: "rubia", cantidad: 5 }] }),
  op({ t: "anotar", cuenta: "m", ronda: "r2", lineas: [{ id: "s", producto: "sopa", cantidad: 1 }] }),
]; // total 30.000: 20.000 de barra y 10.000 de comida

describe("deudas", () => {
  it("pasar la cuenta entera a deuda la cierra sin plata en caja y la deja a nombre de alguien", () => {
    const e = correr([...base(), op({ t: "cobrar", cuenta: "m", pago: "pd", medio: "deuda", deudor: "  Nilson " })]);
    const c = e.cuentas.m;
    expect(situacion(c)).toBe("cobrada");
    expect(saldo(c)).toBe(0);
    expect(efectivoDeJornada([c], jornada(c.pagos[0].en))).toBe(0);
    const d = e.deudas!.nilson;
    expect(d.nombre).toBe("Nilson");
    expect(saldoDeudor(d)).toBe(30_000);
    expect(comidaDeudor(d)).toBe(10_000);
    expect(d.movimientos[0]).toMatchObject({ tipo: "cargo", valor: 30_000, cuenta: { id: "m", nombre: "Mesa 2" } });
  });

  it("se pueden pasar a deuda solo unas pedidas o productos; lo demás se cobra normal", () => {
    let e = correr([...base(), op({ t: "cobrar", cuenta: "m", pago: "pd", medio: "deuda", deudor: "Nilson", lineas: [{ linea: "s", cantidad: 1 }] })]);
    expect(saldo(e.cuentas.m)).toBe(20_000);
    expect(comidaDeudor(e.deudas!.nilson)).toBe(10_000);
    e = correr([op({ t: "cobrar", cuenta: "m", pago: "pe", medio: "efectivo" })], e);
    expect(efectivoDeJornada([e.cuentas.m], jornada(e.cuentas.m.pagos[1].en))).toBe(20_000);
  });

  it("el mismo nombre escrito distinto es la misma persona; sin nombre no pasa nada", () => {
    const e = correr([...base(),
      op({ t: "cobrar", cuenta: "m", pago: "p0", medio: "deuda", deudor: "   " }),
      op({ t: "cobrar", cuenta: "m", pago: "p1", medio: "deuda", deudor: "NILSON", monto: 5_000 }),
      op({ t: "cobrar", cuenta: "m", pago: "p2", medio: "deuda", deudor: "nilson", monto: 5_000 })]);
    expect(Object.keys(e.deudas!)).toEqual(["nilson"]);
    expect(saldoDeudor(e.deudas!.nilson)).toBe(10_000);
    expect(e.cuentas.m.pagos.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("deshacer el cobro o reabrir la cuenta anula su deuda", () => {
    let e = correr([...base(), op({ t: "cobrar", cuenta: "m", pago: "pd", medio: "deuda", deudor: "Nilson" })]);
    e = correr([op({ t: "deshacer_pago", cuenta: "m", pago: "pd" })], e);
    expect(saldoDeudor(e.deudas!.nilson)).toBe(0);
    expect(saldo(e.cuentas.m)).toBe(30_000);
    e = correr([op({ t: "cobrar", cuenta: "m", pago: "pd2", medio: "deuda", deudor: "Nilson" }), op({ t: "reabrir", cuenta: "m" })], e);
    expect(saldoDeudor(e.deudas!.nilson)).toBe(0);
  });

  it("los pagos de deudas bajan lo que debe, nunca de más, y van aparte de la caja", () => {
    let e = correr([...base(), op({ t: "cobrar", cuenta: "m", pago: "pd", medio: "deuda", deudor: "Nilson" })]);
    const pago = op({ t: "deuda_pago", deudor: "nilson", valor: 12_000, medio: "efectivo" });
    e = correr([pago, pago, op({ t: "deuda_pago", deudor: "nilson", valor: 999_000, medio: "nequi" })], e);
    const d = e.deudas!.nilson;
    expect(d.movimientos.filter((m) => m.tipo === "pago").map((m) => [m.valor, m.medio])).toEqual([[12_000, "efectivo"], [18_000, "nequi"]]);
    expect(saldoDeudor(d)).toBe(0);
    const fecha = jornada(d.movimientos[1].en);
    expect(pagosDeudasDe([d], fecha, jornada)).toEqual({ total: 30_000, efectivo: 12_000, nequi: 18_000, breve: 0 });
    expect(efectivoDeJornada(Object.values(e.cuentas), fecha)).toBe(0);
    // Ya no debe: otro pago no hace nada.
    e = correr([op({ t: "deuda_pago", deudor: "nilson", valor: 1_000, medio: "efectivo" })], e);
    expect(e.deudas!.nilson.movimientos.length).toBe(3);
  });

  it("una deuda anotada a mano (de comida) se puede anular; la de una cuenta no se anula aquí", () => {
    let e = correr([...base(), op({ t: "cobrar", cuenta: "m", pago: "pd", medio: "deuda", deudor: "Nilson" }),
      op({ t: "deuda_cargo", deudor: "Nilson", valor: 25_000, concepto: " almuerzos ", comida: true }, "Administrador")]);
    const d = () => e.deudas!.nilson;
    expect(saldoDeudor(d())).toBe(55_000);
    expect(comidaDeudor(d())).toBe(35_000);
    const manual = d().movimientos[1];
    expect(manual).toMatchObject({ concepto: "almuerzos", comida: 25_000 });
    e = correr([op({ t: "deuda_anular", deudor: "nilson", movimiento: manual.id }), op({ t: "deuda_anular", deudor: "nilson", movimiento: "pd" })], e);
    expect(saldoDeudor(d())).toBe(30_000);
    expect(d().movimientos[0].anulado).toBeUndefined();
  });
});
