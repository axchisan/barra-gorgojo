// Las cuentas del día para hacer cuentas (2026-11-15): cada pago repartido entre barra y
// comida, qué cobró cada caja y cuánto de eso era de la otra área.
import { describe, expect, it } from "vitest";
import { aplicar, efectivoDeJornada, estadoVacio, saldo, type Operacion } from "../src/dominio/estado";
import { cuentasDelDia, repartirPagos, resumenJornada } from "../src/dominio/jornada";

const DIA = Date.parse("2026-03-10T18:00:00Z"); // jornada 2026-03-10
let n = 0;
const op = (o: Record<string, unknown>, en = DIA + n * 1000) => ({ id: `op-${++n}-xxxxxxxx`, persona: "Ana", en, ...o }) as Operacion;
const correr = (ops: Operacion[]) => ops.reduce((e, o) => aplicar(e, o), estadoVacio());
const almuerzo = (id: string, precio: number) => ({ id, producto: "otro", cantidad: 1, precio, nombre: "Almuerzo", comida: true });

describe("cuentas del día", () => {
  it("una cuenta mixta cobrada entera: el pago se parte en lo de barra y lo de comida", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "a", nombre: "Chelo", tipo: "grupo" }),
      op({ t: "anotar", cuenta: "a", ronda: "r1", area: "comida", lineas: [almuerzo("a1", 30000)] }),
      op({ t: "anotar", cuenta: "a", ronda: "r2", lineas: [{ id: "a2", producto: "rubia", cantidad: 2 }] }),
      op({ t: "cobrar", cuenta: "a", pago: "p1", medio: "nequi", area: "comida" }),
    ]);
    const d = cuentasDelDia(Object.values(e.cuentas), "2026-03-10");
    expect(d.cuentas[0].pagos[0]).toMatchObject({ medio: "nequi", caja: "comida", monto: 38000, barra: 8000, comida: 30000 });
    expect(d.porMedio.nequi).toEqual({ barra: 8000, comida: 30000 });
    // La caja de cocina recibió 8.000 de la barra.
    expect(d.cajas.comida.porMedio.nequi).toBe(38000);
    expect(d.cajas.comida.deLaOtra.nequi).toBe(8000);
  });

  it("el abono por productos es exacto y el resto va a lo que faltaba (Gloria)", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "g", nombre: "Gloria", tipo: "mesa" }),
      op({ t: "anotar", cuenta: "g", ronda: "r1", area: "comida", lineas: [almuerzo("g1", 50000)] }),
      op({ t: "anotar", cuenta: "g", ronda: "r2", lineas: [{ id: "g2", producto: "rubia", cantidad: 3 }] }),
      op({ t: "cobrar", cuenta: "g", pago: "p1", medio: "efectivo", area: "comida", lineas: [{ linea: "g2", cantidad: 3 }] }),
      op({ t: "cobrar", cuenta: "g", pago: "p2", medio: "efectivo", area: "comida" }),
    ]);
    const [p1, p2] = repartirPagos(e.cuentas.g);
    expect(p1).toMatchObject({ monto: 12000, barra: 12000, comida: 0 });
    expect(p2).toMatchObject({ monto: 50000, barra: 0, comida: 50000 });
  });

  it("lo que falta por cobrar se parte en barra y comida; las anuladas van aparte", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "a", nombre: "Abierta", tipo: "grupo" }),
      op({ t: "anotar", cuenta: "a", ronda: "r1", area: "comida", lineas: [almuerzo("a1", 20000)] }),
      op({ t: "anotar", cuenta: "a", ronda: "r2", lineas: [{ id: "a2", producto: "rubia", cantidad: 1 }] }),
      op({ t: "cobrar", cuenta: "a", pago: "p1", medio: "efectivo", lineas: [{ linea: "a2", cantidad: 1 }] }),
      op({ t: "abrir", cuenta: "x", nombre: "Anulada", tipo: "grupo" }),
      op({ t: "anotar", cuenta: "x", ronda: "r3", lineas: [{ id: "x1", producto: "rubia", cantidad: 1 }] }),
      op({ t: "anular_cuenta", cuenta: "x", motivo: "prueba" }),
    ]);
    const d = cuentasDelDia(Object.values(e.cuentas), "2026-03-10");
    expect(d.porCobrar).toEqual({ barra: 0, comida: 20000 });
    expect(d.cuentas[0].falta).toBe(20000);
    expect(d.anuladas.map((c) => c.nombre)).toEqual(["Anulada"]);
    expect(d.cajas.barra.porMedio.efectivo).toBe(4000);
  });

  it("lo fiado cuenta como medio aparte, con el nombre de quien debe", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "f", nombre: "Forero", tipo: "grupo" }),
      op({ t: "anotar", cuenta: "f", ronda: "r1", lineas: [{ id: "f1", producto: "rubia", cantidad: 2 }] }),
      op({ t: "cobrar", cuenta: "f", pago: "p1", medio: "deuda", deudor: "Forero" }),
    ]);
    const d = cuentasDelDia(Object.values(e.cuentas), "2026-03-10");
    expect(d.porMedio.deuda).toEqual({ barra: 8000, comida: 0 });
    expect(d.cuentas[0].pagos[0].deudor).toBe("forero"); // el id del deudor (el nombre está en estado.deudas)
  });
});

describe("cambio de plata (2026-11-15)", () => {
  // Pidió que le cambiaran 100.000: los pasó por Nequi junto con lo que consumió, y se le
  // dio un billete de la barra. Se anotó como «Otro» y se cobró todo por Nequi.
  const cuenta = (marcar: boolean) => correr([
    op({ t: "abrir", cuenta: "p", nombre: "Cliente", tipo: "grupo" }),
    op({ t: "anotar", cuenta: "p", ronda: "r1", area: "comida", lineas: [almuerzo("p1", 50000)] }),
    op({ t: "anotar", cuenta: "p", ronda: "r2", lineas: [{ id: "p2", producto: "rubia", cantidad: 4 }] }),
    op({ t: "anotar", cuenta: "p", ronda: "r3", lineas: [{ id: "p3", producto: "otro", cantidad: 1, precio: 100000, nombre: "Cambio nequi por efectivo" }] }),
    op({ t: "anotar", cuenta: "p", ronda: "r4", lineas: [{ id: "p4", producto: "rubia", cantidad: 1 }] }),
    op({ t: "cobrar", cuenta: "p", pago: "pg", medio: "nequi", area: "barra" }),
    ...(marcar ? [op({ t: "cambio_linea", cuenta: "p", linea: "p3", valor: true, caja: "barra" })] : []),
  ]);

  it("sin marcar, los 100.000 cuentan como venta (lo que pasó)", () => {
    const e = cuenta(false);
    expect(resumenJornada(Object.values(e.cuentas), "2026-03-10").vendido).toBe(170000);
  });

  it("marcado: no es venta, Nequi sigue completo y el efectivo de la barra baja", () => {
    const e = cuenta(true);
    const lista = Object.values(e.cuentas);
    expect(e.cuentas.p.lineas.find((l) => l.id === "p3")?.cambio).toMatchObject({ caja: "barra", por: "Ana" });
    expect(saldo(e.cuentas.p)).toBe(0); // la cuenta sigue cobrada
    const r = resumenJornada(lista, "2026-03-10");
    expect(r.vendido).toBe(70000);
    expect(r.cambios).toBe(100000);
    expect(r.porProducto.some((p) => p.nombre.startsWith("Cambio"))).toBe(false);
    const d = cuentasDelDia(lista, "2026-03-10");
    expect(d.cuentas[0]).toMatchObject({ barra: 20000, comida: 50000, cambio: 100000 });
    expect(d.cuentas[0].pagos[0]).toMatchObject({ monto: 170000, barra: 20000, comida: 50000, cambio: 100000 });
    expect(d.porMedio.nequi).toEqual({ barra: 20000, comida: 50000 });
    expect(d.cambios.nequi).toBe(100000);
    expect(d.cajas.barra.porMedio.nequi).toBe(170000); // lo que de verdad entró a Nequi
    expect(efectivoDeJornada(lista, "2026-03-10", "barra")).toBe(-100000); // el billete que salió
    expect(efectivoDeJornada(lista, "2026-03-10", "comida")).toBe(0);
  });

  it("se puede desmarcar, y solo vale para «Otro»", () => {
    const marcada = cuenta(true);
    const desmarcada = aplicar(structuredClone(marcada), op({ t: "cambio_linea", cuenta: "p", linea: "p3", valor: false }));
    expect(desmarcada.cuentas.p.lineas.find((l) => l.id === "p3")?.cambio).toBeUndefined();
    const enCerveza = aplicar(structuredClone(marcada), op({ t: "cambio_linea", cuenta: "p", linea: "p2", valor: true }));
    expect(enCerveza.cuentas.p.lineas.find((l) => l.id === "p2")?.cambio).toBeUndefined();
  });
});
