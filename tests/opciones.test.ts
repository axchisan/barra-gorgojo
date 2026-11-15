// Opciones de un producto (docs/02 «Opciones de un producto», 2026-11-15): sabores y marcas.
import { describe, expect, it } from "vitest";
import { aplicar, enCuadricula, estadoVacio, opcionesDe, total, type Operacion } from "../src/dominio/estado";
import type { Producto } from "../src/dominio/catalogo";

let n = 0;
const op = (o: Record<string, unknown>): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona: "Admin", en: Date.now(), ...o }) as Operacion;
const prod = (id: string, extra: Partial<Producto> = {}) =>
  op({ t: "producto", producto: { id, nombre: id, corto: id.toUpperCase(), categoria: "gaseosa", precio: 3000, activo: true, fondo: "#E4002B", texto: "#FFFFFF", ...extra } });
const correr = (ops: Operacion[]) => ops.reduce((e, o) => aplicar(e, o), estadoVacio());

describe("opciones de un producto", () => {
  it("una opción guarda su producto general; no sale en la cuadrícula y sí en sus opciones", () => {
    const e = correr([prod("colombiana", { padre: "gaseosa" }), prod("manzana", { padre: "gaseosa", activo: false })]);
    expect(e.productos?.colombiana.padre).toBe("gaseosa");
    expect(enCuadricula(e, e.productos!.colombiana)).toBe(false);
    expect(opcionesDe(e, "gaseosa").map((p) => p.id)).toEqual(["colombiana"]);
    expect(opcionesDe(e, "gaseosa", true).map((p) => p.id)).toEqual(["colombiana", "manzana"]);
  });

  it("siguen el orden del catálogo", () => {
    const e = correr([prod("colombiana", { padre: "gaseosa" }), prod("manzana", { padre: "gaseosa" }), op({ t: "orden", ids: ["manzana", "colombiana"] })]);
    expect(opcionesDe(e, "gaseosa").map((p) => p.id)).toEqual(["manzana", "colombiana"]);
  });

  it("un padre inválido o de sí misma se ignora; si el general no existe, va en la cuadrícula", () => {
    const e = correr([prod("uva", { padre: "uva" }), prod("pina", { padre: "NO VALE" }), prod("huerfana", { padre: "no-existe" })]);
    expect(e.productos?.uva.padre).toBeUndefined();
    expect(e.productos?.pina.padre).toBeUndefined();
    expect(enCuadricula(e, e.productos!.huerfana)).toBe(true);
  });

  it("una opción se anota como cualquier producto, con su precio y su nombre", () => {
    const e = correr([
      prod("colombiana-pequena", { nombre: "Colombiana (pequeña)", padre: "gaseosa", precio: 2500 }),
      op({ t: "abrir", cuenta: "c", nombre: "Mesa", tipo: "grupo" }),
      op({ t: "anotar", cuenta: "c", ronda: "r", lineas: [{ id: "l1", producto: "colombiana-pequena", cantidad: 2 }, { id: "l2", producto: "gaseosa", cantidad: 1 }] }),
    ]);
    expect(e.cuentas.c.lineas.map((l) => [l.nombre, l.precio])).toEqual([["Colombiana (pequeña)", 2500], ["Gaseosa personal", 3000]]);
    expect(total(e.cuentas.c)).toBe(8000);
  });

  it("un producto sin padre queda igual que antes (el registro viejo da lo mismo)", () => {
    const e = correr([prod("agua-grande")]);
    expect(e.productos?.["agua-grande"]).not.toHaveProperty("padre");
  });
});
