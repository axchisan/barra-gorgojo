// Con cuánto pagan en efectivo (F1 y F2 de docs/12).
import { describe, expect, it } from "vitest";
import { BILLETES, billetesMayores, MAX_SUGERENCIAS, sugerirPago } from "../src/dominio/pago";

describe("billetes", () => {
  it("son los seis de la familia en circulación, en enteros y de menor a mayor", () => {
    expect([...BILLETES]).toEqual([2000, 5000, 10000, 20000, 50000, 100000]);
    expect(BILLETES.every(Number.isInteger)).toBe(true);
  });

  it("los mayores que la cuenta excluyen el billete exacto", () => {
    expect(billetesMayores(1500)).toEqual([2000, 5000, 10000, 20000, 50000, 100000]);
    expect(billetesMayores(20000)).toEqual([50000, 100000]);
    expect(billetesMayores(100000)).toEqual([]);
  });
});

describe("sugerir con cuánto pagan", () => {
  it("da los ejemplos del negocio", () => {
    expect(sugerirPago(37000)).toEqual([40000, 50000, 100000]);
    expect(sugerirPago(47000)).toEqual([50000, 100000]);
    expect(sugerirPago(12500)).toEqual([13000, 15000, 20000, 50000]);
  });

  it("cuentas pequeñas: monedas y billetes chicos", () => {
    expect(sugerirPago(2500)).toEqual([3000, 5000, 10000, 20000]);
    expect(sugerirPago(500)).toEqual([1000, 2000, 5000, 10000]);
  });

  it("cuentas de más de 100.000: redondeos, que se pagan con varios billetes", () => {
    expect(sugerirPago(100000)).toEqual([150000, 200000]);
    expect(sugerirPago(40000)).toEqual([50000, 100000]);
    expect(sugerirPago(137500)).toEqual([138000, 140000, 150000, 200000]);
  });

  it("nunca repite, nunca sugiere el exacto ni menos, va en orden y cabe a la vista", () => {
    for (let v = 100; v <= 300000; v += 100) {
      const s = sugerirPago(v);
      expect(new Set(s).size).toBe(s.length);
      expect(s.every((x) => x > v && Number.isInteger(x))).toBe(true);
      expect([...s].sort((a, b) => a - b)).toEqual(s);
      expect(s.length).toBeGreaterThan(0);
      expect(s.length).toBeLessThanOrEqual(MAX_SUGERENCIAS);
    }
  });

  it("sin valor no sugiere nada", () => {
    expect(sugerirPago(0)).toEqual([]);
    expect(sugerirPago(-5)).toEqual([]);
    expect(sugerirPago(1.5)).toEqual([]);
  });
});
