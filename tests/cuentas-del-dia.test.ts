// Las cuentas del día para hacer cuentas (2026-11-15): cada pago repartido entre barra y
// comida, qué cobró cada caja y cuánto de eso era de la otra área.
import { describe, expect, it } from "vitest";
import { aplicar, estadoVacio, type Operacion } from "../src/dominio/estado";
import { cuentasDelDia, repartirPagos } from "../src/dominio/jornada";

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
