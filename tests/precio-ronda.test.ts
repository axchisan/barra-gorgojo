// Precio de los adicionales en las canchas (docs/04 «Precio de los adicionales», 2026-11-15):
// el chico va a precio de cancha y el adicional a precio normal, salvo que se escoja otro.
import { describe, expect, it } from "vitest";
import { PRECIO_CANCHA_DESDE, aplicar, estadoVacio, modoPrecio, preciosParaModo, saldo, total, type Operacion } from "../src/dominio/estado";
import { describir } from "../src/dominio/auditoria";

let n = 0;
const op = (o: Record<string, unknown>): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona: "Ana", en: PRECIO_CANCHA_DESDE + 1_000 + n, ...o }) as Operacion;
const cancha = (cuenta = "c") => op({ t: "abrir", cuenta, nombre: "Cancha 2", tipo: "cancha", cancha: "2" });
const anotar = (ronda: string, lineas: [string, number, number?][], extra: Record<string, unknown> = {}) =>
  op({ t: "anotar", cuenta: "c", ronda, lineas: lineas.map(([producto, cantidad, precio], i) => ({ id: `${ronda}-${i}`, producto, cantidad, precio })), ...extra });
const correr = (ops: Operacion[]) => ops.reduce((e, o) => aplicar(e, o), estadoVacio());
// Rubia: normal 4.000, cancha 4.500. Light: sin precio de cancha (4.500).

describe("precio de los adicionales en las canchas", () => {
  it("lo anotado antes, sin modo, sigue a precio de cancha (el registro viejo da lo mismo)", () => {
    const e = correr([cancha(), anotar("r1", [["rubia", 2]], { adicional: true })]);
    expect(total(e.cuentas.c)).toBe(9000);
    expect(modoPrecio(e.cuentas.c, e.cuentas.c.rondas[0])).toBe("cancha");
  });

  it("un adicional a precio normal cobra el precio normal; un chico, el de cancha", () => {
    const e = correr([cancha(), anotar("r1", [["rubia", 2]], { precio: "cancha" }), anotar("r2", [["rubia", 3]], { adicional: true, precio: "normal" })]);
    expect(e.cuentas.c.lineas.map((l) => l.precio)).toEqual([4500, 4000]);
    expect(total(e.cuentas.c)).toBe(9000 + 12000);
    expect(e.cuentas.c.rondas[1].precio).toBe("normal");
  });

  it("un adicional se puede anotar a precio de cancha si se escoge", () => {
    const e = correr([cancha(), anotar("r1", [["rubia", 1]], { adicional: true, precio: "cancha" })]);
    expect(total(e.cuentas.c)).toBe(4500);
  });

  it("fuera de las canchas el modo no hace nada", () => {
    const e = correr([op({ t: "abrir", cuenta: "c", nombre: "Mesa", tipo: "grupo" }), anotar("r1", [["rubia", 1]], { precio: "cancha" })]);
    expect(total(e.cuentas.c)).toBe(4000);
    expect(e.cuentas.c.rondas[0].precio).toBeUndefined();
  });

  it("agregar y cambiar producto usan el precio de la pedida", () => {
    const e = correr([
      cancha(), anotar("r1", [["rubia", 1]], { adicional: true, precio: "normal" }),
      op({ t: "agregar", cuenta: "c", ronda: "r1", lineas: [{ id: "a1", producto: "negra", cantidad: 2 }] }),
      op({ t: "cambiar_producto", cuenta: "c", linea: "r1-0", nueva: { id: "n1", producto: "lager", cantidad: 1 } }),
    ]);
    expect(e.cuentas.c.lineas.filter((l) => !l.anulada).map((l) => [l.producto, l.precio])).toEqual([["lager", 4000], ["negra", 4000]]);
  });

  it("el caso de la cancha: cambiar a precio normal una pedida ya anotada", () => {
    // Adicional anotado a precio de cancha (como antes); se pasa a precio normal.
    const e = correr([cancha(), anotar("r1", [["rubia", 4], ["light", 1], ["mecato", 1, 1500]], { adicional: true }), op({ t: "precio_ronda", cuenta: "c", ronda: "r1", precio: "normal" })]);
    expect(e.cuentas.c.lineas.map((l) => l.precio)).toEqual([4000, 4500, 1500]); // mecato y light no cambian
    expect(e.cuentas.c.rondas[0].precio).toBe("normal");
    // Y de vuelta a precio de cancha.
    aplicar(e, op({ t: "precio_ronda", cuenta: "c", ronda: "r1", precio: "cancha" }));
    expect(e.cuentas.c.lineas[0].precio).toBe(4500);
  });

  it("los precios que fijó el servidor mandan sobre el catálogo al recalcular", () => {
    const e = correr([cancha(), anotar("r1", [["rubia", 2]], { precio: "cancha" }), op({ t: "precio_ronda", cuenta: "c", ronda: "r1", precio: "normal", precios: { "r1-0": 3900 } })]);
    expect(e.cuentas.c.lineas[0].precio).toBe(3900);
  });

  it("pasar a adicional con modo cambia el precio; sin modo (operación vieja) solo el nombre", () => {
    const viejo = correr([cancha(), anotar("r1", [["rubia", 2]]), op({ t: "marcar_ronda", cuenta: "c", ronda: "r1", adicional: true })]);
    expect(total(viejo.cuentas.c)).toBe(9000);
    const nuevo = correr([cancha(), anotar("r1", [["rubia", 2]], { precio: "cancha" }), op({ t: "marcar_ronda", cuenta: "c", ronda: "r1", adicional: true, precio: "normal" })]);
    expect(total(nuevo.cuentas.c)).toBe(8000);
    aplicar(nuevo, op({ t: "marcar_ronda", cuenta: "c", ronda: "r1", adicional: false, precio: "cancha" }));
    expect(total(nuevo.cuentas.c)).toBe(9000);
  });

  it("una cuenta cobrada no cambia de valor: solo queda el modo", () => {
    const e = correr([cancha(), anotar("r1", [["rubia", 2]], { adicional: true, precio: "cancha" }), op({ t: "cobrar", cuenta: "c", pago: "p1", medio: "efectivo" }), op({ t: "precio_ronda", cuenta: "c", ronda: "r1", precio: "normal" })]);
    expect(total(e.cuentas.c)).toBe(9000);
    expect(saldo(e.cuentas.c)).toBe(0);
  });

  it("no cambia lo ya pagado con un abono por productos ni lo anulado", () => {
    const e = correr([
      cancha(), anotar("r1", [["rubia", 1], ["negra", 1], ["lager", 1]], { adicional: true, precio: "cancha" }),
      op({ t: "cobrar", cuenta: "c", pago: "p1", medio: "efectivo", lineas: [{ linea: "r1-0", cantidad: 1 }] }),
      op({ t: "anular", cuenta: "c", linea: "r1-2" }),
    ]);
    expect(preciosParaModo(e, e.cuentas.c, "r1", "normal")).toEqual({ "r1-1": 4000 });
    aplicar(e, op({ t: "precio_ronda", cuenta: "c", ronda: "r1", precio: "normal" }));
    expect(e.cuentas.c.lineas.map((l) => l.precio)).toEqual([4500, 4000, 4500]);
  });

  it("la auditoría dice qué cambió de precio", () => {
    const e = correr([cancha(), anotar("r1", [["rubia", 4]], { adicional: true, precio: "cancha" })]);
    const o = op({ t: "precio_ronda", cuenta: "c", ronda: "r1", precio: "normal", precios: { "r1-0": 4000 } });
    expect(describir(o, e.cuentas.c).texto.replace(/\s/g, " ")).toBe("Puso la adicional 1 a precio normal (4 Rubia a $ 4.000)");
  });
});
