// Editar una pedida ya anotada (2026-11-15): agregar productos y cambiar uno por otro.
// Nada se borra: lo cambiado queda anulado como «cambiado por …» (regla 4).
import { describe, expect, it } from "vitest";
import { PRECIO_CANCHA_DESDE, aplicar, estadoVacio, saldo, situacion, total, type Estado, type Operacion } from "../src/dominio/estado";

let n = 0;
const op = (o: Record<string, unknown>, persona = "Ana"): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona, en: PRECIO_CANCHA_DESDE + 1_000 + n, ...o }) as Operacion;
const correr = (ops: Operacion[], e: Estado = estadoVacio()) => ops.reduce((x, o) => aplicar(x, o), e);
// Rubia $ 4.000, Light $ 4.500, Roja $ 3.500 en el catálogo de ejemplo.
const base = () => [
  op({ t: "abrir", cuenta: "g", nombre: "Grupo", tipo: "grupo" }),
  op({ t: "anotar", cuenta: "g", ronda: "r1", lineas: [{ id: "a", producto: "rubia", cantidad: 2 }] }),
  op({ t: "anotar", cuenta: "g", ronda: "r2", lineas: [{ id: "b", producto: "light", cantidad: 1 }] }),
];

describe("agregar a una pedida", () => {
  it("suma productos a esa pedida, marcados como agregados; reintentar no duplica", () => {
    const agregar = op({ t: "agregar", cuenta: "g", ronda: "r1", lineas: [{ id: "c", producto: "roja", cantidad: 3 }] }, "Beto");
    const e = correr([...base(), agregar, agregar]);
    const c = e.cuentas.g;
    expect(c.rondas.length).toBe(2);
    expect(c.lineas.filter((l) => l.ronda === "r1").map((l) => [l.id, l.cantidad, !!l.agregada])).toEqual([["a", 2, false], ["c", 3, true]]);
    expect(c.lineas.find((l) => l.id === "c")?.agregada?.por).toBe("Beto");
    expect(total(c)).toBe(2 * 4_000 + 4_500 + 3 * 3_500);
  });

  it("a una pedida que no existe no hace nada; a una cuenta cobrada la reabre", () => {
    let e = correr([...base(), op({ t: "agregar", cuenta: "g", ronda: "no-existe", lineas: [{ id: "c", producto: "roja", cantidad: 1 }] })]);
    expect(e.cuentas.g.lineas.length).toBe(2);
    e = correr([op({ t: "cobrar", cuenta: "g", pago: "p", medio: "efectivo" }), op({ t: "agregar", cuenta: "g", ronda: "r2", lineas: [{ id: "d", producto: "roja", cantidad: 1 }] })], e);
    expect(situacion(e.cuentas.g)).toBe("abierta");
    expect(e.cuentas.g.reabierta).toBe(true);
    expect(saldo(e.cuentas.g)).toBe(3_500);
  });

  it("desde comida, una bebida agregada queda por despachar; el precio fijado manda", () => {
    const e = correr([...base(), op({ t: "agregar", cuenta: "g", ronda: "r1", area: "comida", lineas: [{ id: "c", producto: "roja", cantidad: 1, precioFijado: 9_999 }] })]);
    const l = e.cuentas.g.lineas.find((x) => x.id === "c")!;
    expect(l.porDespachar).toBe(true);
    expect(l.precio).toBe(9_999);
  });
});

describe("cambiar un producto por otro", () => {
  it("el anterior queda anulado como cambiado; el nuevo entra en la misma pedida con la misma cantidad", () => {
    const e = correr([...base(), op({ t: "cambiar_producto", cuenta: "g", linea: "a", nueva: { id: "a2", producto: "light", cantidad: 99 } }, "Beto")]);
    const c = e.cuentas.g;
    const vieja = c.lineas.find((l) => l.id === "a")!;
    const nueva = c.lineas.find((l) => l.id === "a2")!;
    expect(vieja.anulada?.por).toBe("Beto");
    expect(vieja.cambiada).toMatchObject({ por: "Beto", a: "a2" });
    expect(nueva).toMatchObject({ ronda: "r1", producto: "light", cantidad: 2, reemplaza: "a" });
    expect(c.lineas.map((l) => l.id)).toEqual(["a", "a2", "b"]);
    expect(total(c)).toBe(2 * 4_500 + 4_500);
  });

  it("no hace nada si es el mismo producto, si ya está anulado, si es de valor libre o si ya se pagó con un abono", () => {
    const antes = correr(base());
    const mismo = correr([op({ t: "cambiar_producto", cuenta: "g", linea: "a", nueva: { id: "x1", producto: "rubia", cantidad: 1 } })], structuredClone(antes));
    expect(JSON.stringify(mismo)).toBe(JSON.stringify(antes));
    const libre = correr([op({ t: "cambiar_producto", cuenta: "g", linea: "a", nueva: { id: "x2", producto: "mecato", cantidad: 1 } })], structuredClone(antes));
    expect(libre.cuentas.g.lineas.length).toBe(2);
    const pagada = correr([op({ t: "cobrar", cuenta: "g", pago: "p", medio: "efectivo", lineas: [{ linea: "a", cantidad: 1 }] }),
      op({ t: "cambiar_producto", cuenta: "g", linea: "a", nueva: { id: "x3", producto: "light", cantidad: 1 } })], structuredClone(antes));
    expect(pagada.cuentas.g.lineas.find((l) => l.id === "a")?.anulada).toBeUndefined();
    const anulada = correr([op({ t: "anular", cuenta: "g", linea: "a" }), op({ t: "cambiar_producto", cuenta: "g", linea: "a", nueva: { id: "x4", producto: "light", cantidad: 1 } })], structuredClone(antes));
    expect(anulada.cuentas.g.lineas.some((l) => l.id === "x4")).toBe(false);
  });

  it("una bebida por despachar sigue por despachar al cambiarla", () => {
    const e = correr([...base(), op({ t: "agregar", cuenta: "g", ronda: "r1", area: "comida", lineas: [{ id: "c", producto: "roja", cantidad: 1 }] }),
      op({ t: "cambiar_producto", cuenta: "g", linea: "c", nueva: { id: "c2", producto: "light", cantidad: 1 } })]);
    expect(e.cuentas.g.lineas.find((l) => l.id === "c2")?.porDespachar).toBe(true);
  });
});
