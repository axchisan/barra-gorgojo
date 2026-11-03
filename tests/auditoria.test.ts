// Auditoría (RF-74): cada operación en una frase, con lo delicado marcado.
import { describe, expect, it } from "vitest";
import { describir } from "../src/dominio/auditoria";
import { aplicar, estadoVacio, type Operacion } from "../src/dominio/estado";

const DIA = Date.parse("2026-03-10T18:00:00Z");
let n = 0;
const op = (o: Record<string, unknown>) => ({ id: `op-${++n}-xxxxxxxx`, persona: "Ana", en: DIA + n * 60_000, ...o }) as Operacion;

describe("auditoría", () => {
  const ops = [
    op({ t: "abrir", cuenta: "m", nombre: "Mesa 4", tipo: "mesa", mesa: 4 }),
    op({ t: "anotar", cuenta: "m", ronda: "r1", lineas: [{ id: "a", producto: "rubia", cantidad: 3 }, { id: "b", producto: "otro", cantidad: 1, precio: 12000, nombre: "Almuerzo", comida: true }] }),
    op({ t: "cantidad", cuenta: "m", linea: "a", cantidad: 2 }),
    op({ t: "anular", cuenta: "m", linea: "b" }),
    op({ t: "cobrar", cuenta: "m", pago: "p1", medio: "efectivo", recibido: 10000 }),
    op({ t: "reabrir", cuenta: "m" }),
    op({ t: "anular_cuenta", cuenta: "m", motivo: "  se fueron sin pagar " }),
    op({ t: "cerrar_jornada", fecha: "2026-03-10", contado: 5000 }),
  ];
  const e = estadoVacio();
  for (const o of ops) aplicar(e, o);
  const c = e.cuentas.m;
  const frases = ops.map((o) => describir(o, "cuenta" in o ? c : undefined, e));

  it("pone nombres y valores que la operación sola no trae", () => {
    expect(frases.map((f) => f.texto)).toEqual([
      "Abrió la cuenta (mesa 4)",
      "Anotó 3 Rubia, 1 Almuerzo · $ 24.000",
      "Cambió la cantidad de Rubia a 2",
      "Anuló 1 Almuerzo · $ 12.000",
      "Cobró $ 8.000 en efectivo (pagó con $ 10.000) · después se deshizo",
      "Reabrió la cuenta (deshizo el cobro o la anulación)",
      "Anuló la cuenta con $ 8.000 · motivo: se fueron sin pagar",
      "Cerró el día: contado $ 5.000, esperado $ 0 · sobraban $ 5.000",
    ].map((t) => t.replace(/\$ /g, "$ ")));
  });

  it("marca lo que conviene revisar", () => {
    expect(frases.map((f) => f.atencion)).toEqual([false, false, true, true, false, true, true, true]);
  });

  it("sin la cuenta (o con una operación que no quedó) no falla y lo dice", () => {
    expect(describir(ops[1], undefined).texto).toMatch(/no quedó en la cuenta/);
    expect(describir(ops[3], undefined).texto).toBe("Anuló un producto");
    expect(describir(op({ t: "anular_cuenta", cuenta: "vacia" }), undefined).texto).toBe("Anuló la cuenta (vacía)");
  });
});
