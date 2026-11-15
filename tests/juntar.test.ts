// Juntar dos cuentas para cobrarlas juntas, y separarlas (docs/04 «Juntar cuentas»).
import { describe, expect, it } from "vitest";
import { PRECIO_CANCHA_DESDE, aplicar, estadoVacio, pagado, porPagarPorLinea, saldo, situacion, type Estado, type Operacion } from "../src/dominio/estado";

let n = 0;
const op = (o: Record<string, unknown>, persona = "Ana"): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona, en: PRECIO_CANCHA_DESDE + 1_000 + n, ...o }) as Operacion;
const correr = (ops: Operacion[], e: Estado = estadoVacio()) => ops.reduce((x, o) => aplicar(x, o), e);
// Rubia $ 4.000 y Light $ 4.500 en el catálogo de ejemplo.
const dos = () => [
  op({ t: "abrir", cuenta: "a", nombre: "Mesa 3", tipo: "mesa", mesa: 3 }),
  op({ t: "anotar", cuenta: "a", ronda: "ra1", lineas: [{ id: "a1", producto: "rubia", cantidad: 2 }] }),
  op({ t: "abrir", cuenta: "b", nombre: "Los de rojo", tipo: "grupo" }),
  op({ t: "anotar", cuenta: "b", ronda: "rb1", lineas: [{ id: "b1", producto: "light", cantidad: 1 }] }),
  op({ t: "anotar", cuenta: "b", ronda: "rb2", lineas: [{ id: "b2", producto: "rubia", cantidad: 1 }] }),
]; // a: 8.000 · b: 8.500

describe("juntar cuentas", () => {
  it("lo de la cuenta de origen pasa a la de destino, con sus pedidas numeradas a continuación", () => {
    const e = correr([...dos(), op({ t: "juntar", cuenta: "a", desde: "b" }, "Beto")]);
    const a = e.cuentas.a, b = e.cuentas.b;
    expect(saldo(a)).toBe(16_500);
    expect(a.rondas.map((r) => [r.numero, r.de?.nombre, r.de?.numero])).toEqual([[1, undefined, undefined], [2, "Los de rojo", 1], [3, "Los de rojo", 2]]);
    expect(a.lineas.map((l) => [l.id, l.de])).toEqual([["a1", undefined], ["b1", "b"], ["b2", "b"]]);
    expect(situacion(b)).toBe("juntada");
    expect(saldo(b)).toBe(0);
    expect(b.juntadaA).toMatchObject({ cuenta: "a", nombre: "Mesa 3", por: "Beto" });
  });

  it("los abonos de la de origen pasan también: nada se cobra dos veces", () => {
    let e = correr([...dos(), op({ t: "cobrar", cuenta: "b", pago: "pb", medio: "nequi", lineas: [{ linea: "b1", cantidad: 1 }] }), op({ t: "juntar", cuenta: "a", desde: "b" })]);
    expect(pagado(e.cuentas.a)).toBe(4_500);
    expect(saldo(e.cuentas.a)).toBe(12_000);
    expect(porPagarPorLinea(e.cuentas.a).has("b1")).toBe(false);
    e = correr([op({ t: "cobrar", cuenta: "a", pago: "pa", medio: "efectivo" })], e);
    expect(situacion(e.cuentas.a)).toBe("cobrada");
    // Cobrar la de origen después (otro celular sin señal) no cobra nada.
    e = correr([op({ t: "cobrar", cuenta: "b", pago: "pb2", medio: "efectivo" })], e);
    expect(e.cuentas.b.pagos).toEqual([]);
  });

  it("no junta una cuenta consigo misma, ni hacia una cobrada, ni vacías o que no existen; repetir no cambia nada", () => {
    const base = correr([...dos(), op({ t: "abrir", cuenta: "v", nombre: "Vacía", tipo: "grupo" }), op({ t: "abrir", cuenta: "c", nombre: "Cobrada", tipo: "grupo" }),
      op({ t: "anotar", cuenta: "c", ronda: "rc", lineas: [{ id: "c1", producto: "rubia", cantidad: 1 }] }), op({ t: "cobrar", cuenta: "c", pago: "pc", medio: "efectivo" })]);
    const antes = JSON.stringify(base);
    // (Una cobrada sí puede ser la de origen desde el 2026-11-15: ver abajo. La de destino tiene que estar abierta.)
    const e = correr([op({ t: "juntar", cuenta: "a", desde: "a" }), op({ t: "juntar", cuenta: "c", desde: "a" }),
      op({ t: "juntar", cuenta: "a", desde: "v" }), op({ t: "juntar", cuenta: "a", desde: "nada" })], base);
    expect(JSON.stringify(e)).toBe(antes);
    const una = correr([op({ t: "juntar", cuenta: "a", desde: "b" })], base);
    const dosVeces = JSON.stringify(una);
    expect(JSON.stringify(correr([op({ t: "juntar", cuenta: "a", desde: "b" })], una))).toBe(dosVeces);
  });

  it("separar devuelve todo como estaba, si después no se cobró nada", () => {
    const antes = correr(dos());
    const e = correr([op({ t: "juntar", cuenta: "a", desde: "b" }), op({ t: "separar", cuenta: "a", desde: "b" })], structuredClone(antes));
    const limpiar = (x: Estado) => Object.fromEntries(Object.entries(x.cuentas).map(([k, c]) => [k, { r: c.rondas.map(({ en: _, ...r }) => r), l: c.lineas, p: c.pagos, s: situacion(c) }]));
    expect(limpiar(e)).toEqual(limpiar(antes));
    // Con un abono después de juntar, ya no se separa.
    const f = correr([op({ t: "juntar", cuenta: "a", desde: "b" }), op({ t: "cobrar", cuenta: "a", pago: "px", medio: "efectivo", monto: 1_000 }), op({ t: "separar", cuenta: "a", desde: "b" })], structuredClone(antes));
    expect(situacion(f.cuentas.b)).toBe("juntada");
  });

  it("si otro celular anota en la de origen después de juntarla, revive con la alerta", () => {
    const e = correr([...dos(), op({ t: "juntar", cuenta: "a", desde: "b" }), op({ t: "anotar", cuenta: "b", ronda: "rb3", lineas: [{ id: "b3", producto: "rubia", cantidad: 1 }] })]);
    expect(situacion(e.cuentas.b)).toBe("abierta");
    expect(e.cuentas.b.reabierta).toBe(true);
    expect(saldo(e.cuentas.b)).toBe(4_000);
    expect(saldo(e.cuentas.a)).toBe(16_500);
  });
});

describe("chico o adicional (canchas)", () => {
  it("por defecto es chico; un adicional se anota así o se cambia después, sin tocar el valor", async () => {
    const { nombreRonda, cuantasRondas } = await import("../src/dominio/formato");
    let e = correr([
      op({ t: "abrir", cuenta: "k", nombre: "Cancha 1", tipo: "cancha", cancha: "1" }),
      op({ t: "anotar", cuenta: "k", ronda: "r1", lineas: [{ id: "k1", producto: "rubia", cantidad: 10 }] }),
      op({ t: "anotar", cuenta: "k", ronda: "r2", adicional: true, lineas: [{ id: "k2", producto: "rubia", cantidad: 1 }] }),
      op({ t: "anotar", cuenta: "k", ronda: "r3", lineas: [{ id: "k3", producto: "rubia", cantidad: 10 }] }),
    ]);
    const c = () => e.cuentas.k;
    expect(c().rondas.map((r) => nombreRonda(c(), r))).toEqual(["Chico 1", "Adicional 1", "Chico 2"]);
    expect(cuantasRondas(c())).toBe("2 chicos · 1 adicional");
    const antes = saldo(c());
    e = correr([op({ t: "marcar_ronda", cuenta: "k", ronda: "r3", adicional: true }), op({ t: "marcar_ronda", cuenta: "k", ronda: "r2", adicional: false })], e);
    expect(c().rondas.map((r) => nombreRonda(c(), r))).toEqual(["Chico 1", "Chico 2", "Adicional 1"]);
    expect(saldo(c())).toBe(antes);
  });
});

describe("juntar con una cancha y pedidas anuladas", () => {
  const abrirAmbas = (en: number) => [
    { id: `x1-${en}`, persona: "Ana", en, t: "abrir", cuenta: "k", nombre: "Cancha 2", tipo: "cancha", cancha: "2" },
    { id: `x2-${en}`, persona: "Ana", en, t: "anotar", cuenta: "k", ronda: "kr1", lineas: [{ id: "kl1", producto: "rubia", cantidad: 10 }] },
    { id: `x3-${en}`, persona: "Ana", en, t: "abrir", cuenta: "p", nombre: "Señor de gafas", tipo: "persona" },
    { id: `x4-${en}`, persona: "Ana", en, t: "anotar", cuenta: "p", ronda: "pr1", lineas: [{ id: "pl1", producto: "rubia", cantidad: 1 }] },
    { id: `x5-${en}`, persona: "Ana", en, t: "juntar", cuenta: "k", desde: "p" },
  ] as Operacion[];

  it("lo que llega a una cancha desde una cuenta normal es adicional (desde que rige); antes, como quedó", async () => {
    const { JUNTAR_ADICIONAL_DESDE } = await import("../src/dominio/estado");
    const ahora = correr(abrirAmbas(JUNTAR_ADICIONAL_DESDE + 1000));
    expect(ahora.cuentas.k.rondas.map((r) => !!r.adicional)).toEqual([false, true]);
    const antes = correr(abrirAmbas(JUNTAR_ADICIONAL_DESDE - 1000));
    expect(antes.cuentas.k.rondas.map((r) => !!r.adicional)).toEqual([false, false]);
  });

  it("una pedida anulada del todo no cuenta ni se numera", async () => {
    const { nombreRonda, cuantasRondas } = await import("../src/dominio/formato");
    const e = correr([
      op({ t: "abrir", cuenta: "q", nombre: "Cancha 1", tipo: "cancha", cancha: "1" }),
      op({ t: "anotar", cuenta: "q", ronda: "q1", lineas: [{ id: "a", producto: "rubia", cantidad: 10 }] }),
      op({ t: "anotar", cuenta: "q", ronda: "q2", adicional: true, lineas: [{ id: "b", producto: "rubia", cantidad: 1 }] }),
      op({ t: "anular", cuenta: "q", linea: "b" }),
      op({ t: "anotar", cuenta: "q", ronda: "q3", adicional: true, lineas: [{ id: "c", producto: "rubia", cantidad: 1 }] }),
    ]);
    const c = e.cuentas.q;
    expect(cuantasRondas(c)).toBe("1 chico · 1 adicional");
    expect(nombreRonda(c, c.rondas[2])).toBe("Adicional 1");
  });
});

describe("juntar una cuenta ya cobrada con una abierta (2026-11-15, para el seguimiento)", () => {
  it("la cobrada pasa con lo que pagó: lo que falta en la abierta no cambia, y se puede separar", () => {
    const e = correr([...dos(), op({ t: "cobrar", cuenta: "b", pago: "pb", medio: "efectivo" }), op({ t: "juntar", cuenta: "a", desde: "b" })]);
    expect(situacion(e.cuentas.b)).toBe("juntada");
    expect(saldo(e.cuentas.a)).toBe(8_000); // lo de «Los de rojo» ya estaba pagado
    expect(pagado(e.cuentas.a)).toBe(8_500);
    expect(e.cuentas.a.lineas.map((l) => l.id)).toEqual(["a1", "b1", "b2"]);
    aplicar(e, op({ t: "separar", cuenta: "a", desde: "b" }));
    expect(situacion(e.cuentas.b)).toBe("cobrada");
    expect(saldo(e.cuentas.a)).toBe(8_000);
  });

  it("una pasada a comida o anulada no se junta", () => {
    const e = correr([...dos(), op({ t: "anular_cuenta", cuenta: "b", motivo: "repetida" }), op({ t: "juntar", cuenta: "a", desde: "b" })]);
    expect(e.cuentas.b.juntadaA).toBeUndefined();
    expect(saldo(e.cuentas.a)).toBe(8_000);
  });
});
