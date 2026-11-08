// Comida y barra en una cuenta (docs/14): platos con notas, bebidas pedidas desde comida
// que la barra despacha, y las dos cajas.
import { describe, expect, it } from "vitest";
import { PRECIO_CANCHA_DESDE, aplicar, efectivoDeJornada, estadoVacio, jornada, porDespachar, saldo, totalComida, type Estado, type Operacion } from "../src/dominio/estado";

let n = 0;
const op = (o: Record<string, unknown>, persona = "Ana"): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona, en: PRECIO_CANCHA_DESDE + 1_000 + n, ...o }) as Operacion;
const correr = (ops: Operacion[], e: Estado = estadoVacio()) => ops.reduce((x, o) => aplicar(x, o), e);
const plato = (id: string, nombre: string, precio: number, notas?: string[]) =>
  op({ t: "producto", producto: { id, nombre, corto: nombre.toUpperCase(), categoria: "comida", precio, activo: true, fondo: "#8A4F2E", texto: "#FFFFFF", ...(notas ? { notas } : {}) } }, "Administrador");
const base = () => [
  plato("sopa-mediana", "Sopa mediana", 5_000),
  plato("picada-30", "Picada 30", 30_000, ["solo carne", "más yuca"]),
  op({ t: "abrir", cuenta: "m4", nombre: "Mesa 4", tipo: "mesa", mesa: 4 }, "Cocina"),
];

describe("comida y barra en una cuenta", () => {
  it("los platos son comida, guardan su nota y el producto conserva sus notas rápidas", () => {
    const e = correr([...base(), op({ t: "anotar", cuenta: "m4", ronda: "r1", area: "comida", lineas: [
      { id: "a", producto: "sopa-mediana", cantidad: 2 },
      { id: "b", producto: "picada-30", cantidad: 1, nota: "  solo carne  " },
    ] }, "Cocina")]);
    const c = e.cuentas.m4;
    expect(c.lineas.map((l) => [l.nombre, !!l.comida, l.nota, !!l.porDespachar])).toEqual([["Sopa mediana", true, undefined, false], ["Picada 30", true, "solo carne", false]]);
    expect(totalComida(c)).toBe(40_000);
    expect(e.productos?.["picada-30"].notas).toEqual(["solo carne", "más yuca"]);
  });

  it("una bebida pedida desde comida queda por despachar hasta que la barra la despacha", () => {
    let e = correr([...base(), op({ t: "anotar", cuenta: "m4", ronda: "r1", area: "comida", lineas: [
      { id: "a", producto: "sopa-mediana", cantidad: 1 },
      { id: "b", producto: "rubia", cantidad: 2 },
    ] }, "Cocina")]);
    expect(porDespachar(Object.values(e.cuentas)).map((x) => [x.cuenta.id, x.lineas.map((l) => l.id)])).toEqual([["m4", ["b"]]]);
    // Lo mismo anotado desde la barra no queda pendiente.
    e = correr([op({ t: "anotar", cuenta: "m4", ronda: "r2", area: "barra", lineas: [{ id: "c", producto: "rubia", cantidad: 1 }] }, "Barra")], e);
    expect(porDespachar(Object.values(e.cuentas))[0].lineas.map((l) => l.id)).toEqual(["b"]);
    e = correr([op({ t: "despachar", cuenta: "m4" }, "Barra")], e);
    expect(porDespachar(Object.values(e.cuentas))).toEqual([]);
    expect(e.cuentas.m4.lineas.find((l) => l.id === "b")?.despachada?.por).toBe("Barra");
    // Despachar otra vez no cambia nada (reintento).
    const antes = JSON.stringify(e);
    e = correr([op({ t: "despachar", cuenta: "m4" }, "Otro")], e);
    expect(JSON.stringify(e)).toBe(antes);
  });

  it("una sola cuenta, un solo saldo: barra y comida cobran sin duplicar; cada cobro guarda su caja", () => {
    let e = correr([...base(), op({ t: "anotar", cuenta: "m4", ronda: "r1", area: "comida", lineas: [{ id: "a", producto: "sopa-mediana", cantidad: 2 }, { id: "b", producto: "rubia", cantidad: 1 }] }, "Cocina")]);
    e = correr([op({ t: "cobrar", cuenta: "m4", pago: "p1", medio: "efectivo", area: "comida", monto: 10_000 }, "Cocina")], e);
    e = correr([op({ t: "cobrar", cuenta: "m4", pago: "p2", medio: "efectivo", area: "barra" }, "Barra")], e);
    e = correr([op({ t: "cobrar", cuenta: "m4", pago: "p3", medio: "efectivo", area: "comida" }, "Cocina")], e); // ya no hay saldo
    const c = e.cuentas.m4;
    expect(c.pagos.map((p) => [p.area, p.monto])).toEqual([["comida", 10_000], ["barra", 4_000]]);
    expect(saldo(c)).toBe(0);
    const fecha = jornada(c.pagos[0].en);
    expect(efectivoDeJornada([c], fecha, "comida")).toBe(10_000);
    expect(efectivoDeJornada([c], fecha, "barra")).toBe(4_000);
    expect(efectivoDeJornada([c], fecha)).toBe(14_000);
  });

  it("cerrar una caja compara su efectivo; sin caja, todo el negocio (como antes)", () => {
    let e = correr([...base(), op({ t: "anotar", cuenta: "m4", ronda: "r1", lineas: [{ id: "a", producto: "sopa-mediana", cantidad: 1 }] }),
      op({ t: "cobrar", cuenta: "m4", pago: "p1", medio: "efectivo", area: "comida" })]);
    const fecha = jornada(e.cuentas.m4.pagos[0].en);
    e = correr([op({ t: "cerrar_jornada", fecha, contado: 5_000, area: "comida" }), op({ t: "cerrar_jornada", fecha, contado: 0, area: "barra" }), op({ t: "cerrar_jornada", fecha, contado: 5_000 })], e);
    expect(e.jornadas?.[fecha].map((x) => [x.area, x.esperado])).toEqual([["comida", 5_000], ["barra", 0], [undefined, 5_000]]);
  });

  it("los cobros de antes (sin caja) cuentan como de la barra", () => {
    const e = correr([...base(), op({ t: "anotar", cuenta: "m4", ronda: "r1", lineas: [{ id: "a", producto: "rubia", cantidad: 1 }] }), op({ t: "cobrar", cuenta: "m4", pago: "p1", medio: "efectivo" })]);
    const fecha = jornada(e.cuentas.m4.pagos[0].en);
    expect(efectivoDeJornada(Object.values(e.cuentas), fecha, "barra")).toBe(4_000);
    expect(efectivoDeJornada(Object.values(e.cuentas), fecha, "comida")).toBe(0);
  });
});

describe("pedido rápido a la barra", () => {
  it("guarda los detalles en la pedida (recortados) y las bebidas quedan por despachar", () => {
    const e = correr([...base(), op({ t: "anotar", cuenta: "m4", ronda: "rp", area: "comida", detalle: "  para el limón  ", lineas: [{ id: "x", producto: "rubia", cantidad: 2 }] }, "Apoyo")]);
    expect(e.cuentas.m4.rondas.find((r) => r.id === "rp")?.detalle).toBe("para el limón");
    expect(porDespachar(Object.values(e.cuentas))[0].lineas.map((l) => l.id)).toEqual(["x"]);
  });
});
