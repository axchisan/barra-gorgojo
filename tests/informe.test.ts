// Informes por semana y mes (docs/02 «Informes»): periodos, sumas, caja, comparación y CSV.
import { describe, expect, it } from "vitest";
import type { CierreJornada } from "../src/dominio/estado";
import { claveDe, comparacion, csvInforme, fechasParaInforme, informe, nombrePeriodo, otroPeriodo, rango, relativo, type DiaInforme } from "../src/dominio/informe";

const p = (barra: number, comida = 0) => ({ barra, comida });
const cierre = (contado: number, esperado: number, area?: "barra" | "comida"): CierreJornada => ({ id: `${contado}-${esperado}-${area}`, por: "Ana", en: 0, contado, esperado, ...(area ? { area } : {}) });

function dia(fecha: string, vendido: number, extra: Partial<DiaInforme> = {}): DiaInforme {
  return {
    fecha, vendido, vendidoComida: 0, cuentas: 2, cambios: 0,
    porMedio: { efectivo: p(vendido), nequi: p(0), breve: p(0), deuda: p(0), comida: p(0) },
    porCobrar: p(0), porProducto: [{ producto: "rubia", nombre: "Rubia", cantidad: vendido / 1000, valor: vendido }],
    cierres: [], pagosDeudas: { total: 0, efectivo: 0, nequi: 0, breve: 0 }, ...extra,
  };
}

describe("periodos", () => {
  it("la semana va de lunes a domingo y el mes del 1 al último día", () => {
    expect(claveDe("semana", "2026-11-22")).toBe("2026-11-16");
    expect(claveDe("mes", "2026-11-22")).toBe("2026-11");
    expect(rango("semana", "2026-11-16")).toEqual({ desde: "2026-11-16", hasta: "2026-11-22" });
    expect(rango("mes", "2026-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(otroPeriodo("mes", "2026-01")).toBe("2025-12");
    expect(otroPeriodo("semana", "2026-11-02")).toBe("2026-10-26");
    expect(fechasParaInforme("semana", "2026-11-16")).toEqual({ desde: "2026-11-09", hasta: "2026-11-22" });
  });

  it("se nombran en palabras", () => {
    expect(nombrePeriodo("semana", "2026-11-16")).toBe("Semana del 16 al 22 de noviembre");
    expect(nombrePeriodo("semana", "2026-10-26")).toBe("Semana del 26 de octubre al 1 de noviembre");
    expect(nombrePeriodo("mes", "2026-11")).toBe("Noviembre de 2026");
    expect(relativo("semana", "2026-11-09", "2026-11-18")).toBe("la semana pasada");
    expect(relativo("mes", "2026-11", "2026-11-18")).toBe("este mes");
    expect(relativo("mes", "2026-09", "2026-11-18")).toBeNull();
  });
});

describe("informe", () => {
  it("suma los días del periodo: vendido, medios, productos, promedio y el día más fuerte", () => {
    const dias = [
      dia("2026-11-08", 99_000), // domingo de la semana anterior: no entra
      dia("2026-11-14", 40_000, { vendidoComida: 10_000, porMedio: { efectivo: p(20_000), nequi: p(10_000, 10_000), breve: p(0), deuda: p(0), comida: p(0) } }),
      dia("2026-11-15", 60_000),
    ];
    const inf = informe("semana", "2026-11-09", dias, "2026-11-18");
    expect(inf.dias.map((d) => d.fecha)).toEqual(["2026-11-14", "2026-11-15"]);
    expect(inf.vendido).toBe(100_000);
    expect(inf.vendidoComida).toBe(10_000);
    expect(inf.porMedio.nequi).toEqual({ barra: 10_000, comida: 10_000 });
    expect(inf.porMedio.efectivo.barra).toBe(80_000);
    expect(inf.productos).toEqual([{ producto: "rubia", nombre: "Rubia", cantidad: 100, valor: 100_000 }]);
    expect(inf.promedioDia).toBe(50_000);
    expect(inf.cuentas).toBe(4);
    expect(inf.masFuerte).toEqual({ fecha: "2026-11-15", vendido: 60_000 });
    expect(inf.enCurso).toBe(false);
  });

  it("la caja: cuadró, sobró o faltó con el último cierre de cada caja; los días sin cerrar, menos hoy", () => {
    const dias = [
      dia("2026-11-16", 10_000, { cierres: [cierre(5_000, 6_000, "barra"), cierre(6_000, 6_000, "barra")] }), // se corrigió: cuadró
      dia("2026-11-17", 10_000, { cierres: [cierre(7_000, 6_000, "barra"), cierre(3_000, 3_000, "comida")] }), // sobraron 1.000
      dia("2026-11-18", 10_000, { cierres: [cierre(4_000, 6_500)] }), // faltaron 2.500
      dia("2026-11-19", 10_000), // sin cerrar
      dia("2026-11-20", 10_000), // hoy: aún puede cerrarse
    ];
    const { caja } = informe("semana", "2026-11-16", dias, "2026-11-20");
    expect(caja).toEqual({ cuadraron: 1, sobro: { dias: 1, valor: 1_000 }, falto: { dias: 1, valor: 2_500 }, sinCerrar: ["2026-11-19"] });
  });

  it("el fiado y los pagos de deudas del periodo", () => {
    const inf = informe("mes", "2026-11", [
      dia("2026-11-03", 20_000, { porMedio: { efectivo: p(5_000), nequi: p(0), breve: p(0), deuda: p(10_000, 5_000), comida: p(0) }, pagosDeudas: { total: 8_000, efectivo: 8_000, nequi: 0, breve: 0 } }),
    ], "2026-11-20");
    expect(inf.fiado).toBe(15_000);
    expect(inf.pagosDeudas.total).toBe(8_000);
  });
});

describe("comparación con el periodo anterior", () => {
  const dias = [
    dia("2026-11-09", 10_000), dia("2026-11-10", 20_000), dia("2026-11-14", 70_000), // semana pasada: 100.000
    dia("2026-11-16", 15_000), dia("2026-11-17", 30_000), // esta semana, en curso (hoy martes)
  ];
  it("una semana en curso se compara con los mismos días de la anterior", () => {
    const inf = informe("semana", "2026-11-16", dias, "2026-11-17");
    expect(comparacion(inf, dias, "2026-11-17")).toEqual({ anterior: 30_000, parcial: true, cambio: 50 });
  });
  it("una semana terminada, con la anterior entera", () => {
    const inf = informe("semana", "2026-11-16", dias, "2026-11-25");
    expect(comparacion(inf, dias, "2026-11-25")).toEqual({ anterior: 100_000, parcial: false, cambio: -55 });
  });
  it("sin nada antes, no hay porcentaje", () => {
    const inf = informe("mes", "2026-11", dias, "2026-12-02");
    expect(comparacion(inf, dias, "2026-12-02")).toEqual({ anterior: 0, parcial: false, cambio: null });
  });
});

describe("CSV del periodo", () => {
  it("va por secciones, con una fila por día y el total", () => {
    const dias = [dia("2026-11-16", 10_000, { cierres: [cierre(10_000, 10_000)] }), dia("2026-11-17", 20_000)];
    const inf = informe("semana", "2026-11-16", dias, "2026-11-25");
    const csv = csvInforme(inf, comparacion(inf, dias, "2026-11-25"));
    const lineas = csv.split("\r\n");
    expect(lineas[0]).toBe("Barra del Gorgojo · Semana del 16 al 22 de noviembre (del 2026-11-16 al 2026-11-22)");
    for (const s of ["RESUMEN", "POR DÍA", "CÓMO PAGARON", "POR PRODUCTO", "CAJA", "FIADO"]) expect(lineas).toContain(s);
    expect(lineas).toContain("2026-11-16;lunes;2;10000;0;10000;10000;0;0;0;cuadró");
    expect(lineas).toContain("2026-11-17;martes;2;20000;0;20000;20000;0;0;0;sin cerrar");
    expect(lineas).toContain("TOTAL;;4;30000;0;30000;30000;0;0;0;");
    expect(lineas).toContain("Rubia;barra;30;30000");
  });
});
