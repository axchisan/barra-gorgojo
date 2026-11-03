// Con cuánto pagan en efectivo (F1 y F2 de docs/12).
import { describe, expect, it } from "vitest";
import { BILLETES, billetesMayores } from "../src/dominio/pago";

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
