// Abonos (pagos parciales): pagar una pedida, unos productos o un valor, dividir entre
// varios y deshacer un solo abono. Ver docs/04 «Abonos».
import { describe, expect, it } from "vitest";
import { PRECIO_CANCHA_DESDE, aplicar, estadoVacio, pagado, porPagarPorLinea, saldo, situacion, type Estado, type Operacion } from "../src/dominio/estado";

let n = 0;
const op = (o: Record<string, unknown>, persona = "Ana"): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona, en: PRECIO_CANCHA_DESDE + 1_000 + n, ...o }) as Operacion;
const correr = (ops: Operacion[], e: Estado = estadoVacio()) => ops.reduce((x, o) => aplicar(x, o), e);
// Rubia $ 4.000 y Light $ 4.500 en el catálogo de ejemplo.
const cuenta = () => [
  op({ t: "abrir", cuenta: "g", nombre: "Grupo", tipo: "grupo" }),
  op({ t: "anotar", cuenta: "g", ronda: "r1", lineas: [{ id: "a", producto: "rubia", cantidad: 3 }, { id: "b", producto: "light", cantidad: 1 }] }),
  op({ t: "anotar", cuenta: "g", ronda: "r2", lineas: [{ id: "c", producto: "rubia", cantidad: 2 }] }),
]; // total 3·4.000 + 4.500 + 2·4.000 = 24.500
const cobrar = (o: Record<string, unknown>, persona = "Ana") => op({ t: "cobrar", cuenta: "g", pago: `p-${++n}`, medio: "efectivo", ...o }, persona);

describe("abonos", () => {
  it("un abono por valor deja la cuenta abierta con lo que falta; el último cobro la cierra", () => {
    let e = correr([...cuenta(), cobrar({ monto: 10_000, recibido: 10_000 }, "Beto")]);
    const c = () => e.cuentas.g;
    expect(saldo(c())).toBe(14_500);
    expect(situacion(c())).toBe("abierta");
    expect(c().pagos[0]).toMatchObject({ monto: 10_000, parcial: true, persona: "Beto", recibido: 10_000 });
    e = correr([cobrar({ medio: "nequi" })], e);
    expect(c().pagos.map((p) => [p.medio, p.monto, !!p.parcial])).toEqual([["efectivo", 10_000, true], ["nequi", 14_500, false]]);
    expect(situacion(c())).toBe("cobrada");
  });

  it("un abono por productos cobra lo que valen y deja esos productos como pagados", () => {
    let e = correr([...cuenta(), cobrar({ lineas: [{ linea: "a", cantidad: 2 }] })]);
    expect(e.cuentas.g.pagos[0]).toMatchObject({ monto: 8_000, parcial: true, lineas: [{ linea: "a", cantidad: 2 }] });
    expect(Object.fromEntries(porPagarPorLinea(e.cuentas.g))).toEqual({ a: 1, b: 1, c: 2 });
    // Pedir más de lo que falta de una línea solo cobra lo que falta.
    e = correr([cobrar({ lineas: [{ linea: "a", cantidad: 3 }, { linea: "b", cantidad: 1 }] })], e);
    expect(e.cuentas.g.pagos[1]).toMatchObject({ monto: 4_000 + 4_500, lineas: [{ linea: "a", cantidad: 1 }, { linea: "b", cantidad: 1 }] });
    expect(saldo(e.cuentas.g)).toBe(8_000);
    // Productos ya pagados del todo: no hay abono.
    const antes = e.cuentas.g.pagos.length;
    e = correr([cobrar({ lineas: [{ linea: "a", cantidad: 1 }] })], e);
    expect(e.cuentas.g.pagos.length).toBe(antes);
  });

  it("pagar una pedida entera es pagar todas sus líneas", () => {
    const e = correr([...cuenta(), cobrar({ lineas: [{ linea: "c", cantidad: 2 }] }, "Beto")]);
    expect(pagado(e.cuentas.g)).toBe(8_000);
    expect(porPagarPorLinea(e.cuentas.g).has("c")).toBe(false);
  });

  it("nunca cobra de más: un abono mayor que el saldo cobra solo el saldo y cierra la cuenta", () => {
    const e = correr([...cuenta(), cobrar({ monto: 1_000_000 })]);
    expect(e.cuentas.g.pagos[0].monto).toBe(24_500);
    expect(e.cuentas.g.pagos[0].parcial).toBeUndefined();
    expect(situacion(e.cuentas.g)).toBe("cobrada");
  });

  it("dividir entre tres: tres abonos con medios distintos", () => {
    const e = correr([...cuenta(), cobrar({ monto: 8_200 }, "Ana"), cobrar({ monto: 8_200, medio: "nequi" }, "Beto"), cobrar({ medio: "breve" }, "Apoyo")]);
    expect(e.cuentas.g.pagos.map((p) => [p.persona, p.medio, p.monto])).toEqual([["Ana", "efectivo", 8_200], ["Beto", "nequi", 8_200], ["Apoyo", "breve", 8_100]]);
    expect(situacion(e.cuentas.g)).toBe("cobrada");
  });

  it("deshacer un abono deshace solo ese; reabrir deshace todos", () => {
    const p1 = cobrar({ monto: 5_000 }), p2 = cobrar({ lineas: [{ linea: "c", cantidad: 2 }] });
    let e = correr([...cuenta(), p1, p2]);
    e = correr([op({ t: "deshacer_pago", cuenta: "g", pago: (p2 as { pago: string }).pago })], e);
    expect(pagado(e.cuentas.g)).toBe(5_000);
    expect(porPagarPorLinea(e.cuentas.g).get("c")).toBe(2); // los productos vuelven a estar por pagar
    e = correr([op({ t: "reabrir", cuenta: "g" })], e);
    expect(pagado(e.cuentas.g)).toBe(0);
  });

  it("pasar a comida es siempre por todo lo que falta, aunque traiga un valor", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "m", nombre: "Mesa 1", tipo: "mesa", mesa: 1 }),
      op({ t: "anotar", cuenta: "m", ronda: "r1", lineas: [{ id: "x", producto: "rubia", cantidad: 2 }] }),
      op({ t: "cobrar", cuenta: "m", pago: "pa", medio: "efectivo", monto: 3_000 }),
      op({ t: "cobrar", cuenta: "m", pago: "pc", medio: "comida", monto: 1_000 }),
    ]);
    expect(e.cuentas.m.pagos.map((p) => [p.medio, p.monto])).toEqual([["efectivo", 3_000], ["comida", 5_000]]);
    expect(situacion(e.cuentas.m)).toBe("comida");
  });

  it("los reintentos no duplican abonos, y un abono sin valor válido no hace nada", () => {
    const p = cobrar({ monto: 5_000 });
    const e = correr([...cuenta(), p, p, cobrar({ monto: 0 }), cobrar({ monto: -10 }), cobrar({ lineas: [{ linea: "no-existe", cantidad: 1 }] })]);
    expect(e.cuentas.g.pagos.map((x) => x.monto)).toEqual([5_000]);
  });

  it("anotar más después de un abono sube lo que falta y la cuenta sigue abierta", () => {
    const e = correr([...cuenta(), cobrar({ monto: 20_000 }), op({ t: "anotar", cuenta: "g", ronda: "r3", lineas: [{ id: "d", producto: "light", cantidad: 1 }] })]);
    expect(saldo(e.cuentas.g)).toBe(24_500 + 4_500 - 20_000);
    expect(situacion(e.cuentas.g)).toBe("abierta");
    expect(e.cuentas.g.reabierta).toBe(false); // no estaba cobrada: solo abonada
  });

  it("guarda quién pagó, si lo dicen (opcional, recortado)", () => {
    const e = correr([...cuenta(), cobrar({ monto: 5_000, pagador: "  Juan el del sombrero  " }), cobrar({ monto: 5_000 })]);
    expect(e.cuentas.g.pagos.map((p) => p.pagador)).toEqual(["Juan el del sombrero", undefined]);
  });
});

describe("dividir entre varios", () => {
  it("cada abono guarda entre cuántos se dividió (válido de 2 a 100)", () => {
    const e = correr([...cuenta(), cobrar({ monto: 3_500, entre: 7 }), cobrar({ monto: 3_500, entre: 1 }), cobrar({ monto: 3_500, entre: 2.5 })]);
    expect(e.cuentas.g.pagos.map((p) => p.entre)).toEqual([7, undefined, undefined]);
  });
});

describe("quién pagó, después", () => {
  it("se pone, se cambia o se quita sin tocar el valor", () => {
    let e = correr([...cuenta(), cobrar({ pago: "pq", monto: 5_000 })]);
    const pago = e.cuentas.g.pagos[0].id;
    e = correr([op({ t: "pagador", cuenta: "g", pago, pagador: "  Pedro  " })], e);
    expect(e.cuentas.g.pagos[0]).toMatchObject({ pagador: "Pedro", monto: 5_000 });
    e = correr([op({ t: "pagador", cuenta: "g", pago, pagador: "" })], e);
    expect(e.cuentas.g.pagos[0].pagador).toBeUndefined();
  });
});
