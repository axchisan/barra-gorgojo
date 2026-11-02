// Depuración del registro para la base limpia (scripts/migracion.ts). Registro inventado
// con cada caso de negocio/docs/10, sobre el catálogo de ejemplo.

import { describe, expect, it } from "vitest";
import { depurar, verificar, type Regla } from "../scripts/migracion";
import { aplicar, catalogo, estadoVacio, total, totalComida, type Operacion } from "../src/dominio/estado";

const DIA = Date.parse("2026-03-10T18:00:00Z"); // jornada 2026-03-10, 1 p. m. en Colombia
let seq = 0;
const op = (o: Record<string, unknown>, en = DIA + seq * 60_000) =>
  ({ id: `op-${String(++seq).padStart(4, "0")}-xx`, persona: "Ana", en, seq, recibida_en: en, ...o }) as Operacion & { recibida_en: number };
const abrir = (cuenta: string, tipo = "grupo", en?: number) => op({ t: "abrir", cuenta, nombre: cuenta, tipo, mesa: tipo === "mesa" ? 3 : undefined }, en);
const anotar = (cuenta: string, ronda: string, lineas: Record<string, unknown>[]) => op({ t: "anotar", cuenta, ronda, lineas });

const registro = [
  // Catálogo: un producto creado y uno editado después de usarlo, y un orden.
  op({ t: "producto", producto: { id: "nueva-ab12", nombre: "Nueva", corto: "NUEVA", categoria: "cerveza", precio: 5500, activo: true, fondo: "#1F4E8C", texto: "#FFFFFF" }, persona: "Administrador" }),
  // La buena: cobrada en la jornada, con todo lo que puede pasarle a una cuenta.
  abrir("buena"),
  anotar("buena", "r1", [
    { id: "b1", producto: "rubia", cantidad: 4 },
    { id: "b2", producto: "negra", cantidad: 1 },
    { id: "b3", producto: "otro", cantidad: 1, precio: 120000, nombre: "Almuerzo", comida: true },
    { id: "b4", producto: "light", cantidad: 15, paquete: { id: "pq1", tipo: "medio", mixto: false } },
  ]),
  op({ t: "anular", cuenta: "buena", linea: "b2" }),
  op({ t: "cantidad", cuenta: "buena", linea: "b1", cantidad: 3 }),
  op({ t: "producto", producto: { id: "rubia", nombre: "Rubia", corto: "RUBIA", categoria: "cerveza", precio: 4800, activo: true, fondo: "#F2C230", texto: "#241206" }, persona: "Administrador" }),
  anotar("buena", "r2", [{ id: "b5", producto: "rubia", cantidad: 1 }, { id: "b6", producto: "nueva-ab12", cantidad: 2 }]),
  op({ t: "renombrar", cuenta: "buena", nombre: "La buena" }),
  op({ t: "cobrar", cuenta: "buena", pago: "p1", medio: "nequi" }),
  op({ t: "reabrir", cuenta: "buena" }),
  op({ t: "cobrar", cuenta: "buena", pago: "p2", medio: "efectivo", recibido: 300000 }),
  // Descartes.
  abrir("anulada"), anotar("anulada", "r3", [{ id: "a1", producto: "rubia", cantidad: 2 }]), op({ t: "anular_cuenta", cuenta: "anulada" }),
  abrir("abierta"), anotar("abierta", "r4", [{ id: "x1", producto: "agua", cantidad: 1 }]),
  abrir("mesa", "mesa"), anotar("mesa", "r5", [{ id: "m1", producto: "gaseosa", cantidad: 2 }]), op({ t: "cobrar", cuenta: "mesa", pago: "p3", medio: "comida" }),
  abrir("ayer", "grupo", DIA - 2 * 86_400_000),
  op({ t: "anotar", cuenta: "ayer", ronda: "r6", lineas: [{ id: "y1", producto: "rubia", cantidad: 1 }] }, DIA - 2 * 86_400_000 + 1000),
  op({ t: "cobrar", cuenta: "ayer", pago: "p4", medio: "efectivo" }, DIA - 2 * 86_400_000 + 2000),
  op({ t: "orden", ids: ["nueva-ab12", "light", "rubia"], persona: "Administrador" }),
];
const REGLA: Regla = { jornadas: ["2026-03-10"], situaciones: ["cobrada"] };
const original = registro.reduce((e, o) => aplicar(e, structuredClone(o)), estadoVacio());

describe("migración a base limpia", () => {
  const r = depurar(registro, REGLA);

  it("conserva solo las cuentas de la jornada y la situación de la regla", () => {
    expect(r.errores).toEqual([]);
    expect(r.conservadas.map((c) => c.id)).toEqual(["buena"]);
    expect(r.descartadas.map((c) => c.id).sort()).toEqual(["abierta", "anulada", "ayer", "mesa"]);
    expect(Object.keys(r.nuevo.cuentas)).toEqual(["buena"]);
  });

  it("la cuenta conservada queda idéntica: total, comida, pagos, cantidades, anuladas y paquetes", () => {
    const antes = original.cuentas.buena;
    const despues = r.nuevo.cuentas.buena;
    expect(despues).toEqual(antes);
    expect(total(despues)).toBe(3 * 4000 + 120000 + 15 * 4500 + 4800 + 2 * 5500);
    expect(totalComida(despues)).toBe(120000);
    expect(despues.nombre).toBe("La buena");
  });

  it("el catálogo va primero, completo y con su orden, y queda igual", () => {
    const productos = catalogo(original);
    expect(r.registro.slice(0, productos.length).every((o) => o.t === "producto")).toBe(true);
    expect(r.registro[productos.length]).toMatchObject({ t: "orden", ids: productos.map((p) => p.id) });
    expect(catalogo(r.nuevo).map((p) => [p.id, p.precio, p.activo])).toEqual(productos.map((p) => [p.id, p.precio, p.activo]));
  });

  it("copia las operaciones de la cuenta en su orden, con su id, persona y hora, sin seq", () => {
    const deLaCuenta = r.registro.filter((o) => "cuenta" in o);
    const originales = registro.filter((o) => "cuenta" in o && o.cuenta === "buena");
    expect(deLaCuenta.map((o) => [o.id, o.persona, o.en])).toEqual(originales.map((o) => [o.id, o.persona, o.en]));
    expect(deLaCuenta.some((o) => "seq" in o || "recibida_en" in o)).toBe(false);
  });

  it("toda línea anotada lleva el precio fijado con que quedó, también las anuladas", () => {
    const lineas = r.registro.flatMap((o) => (o.t === "anotar" ? o.lineas : []));
    const finales = new Map(original.cuentas.buena.lineas.map((l) => [l.id, l.precio]));
    expect(lineas.map((l) => [l.id, l.precioFijado])).toEqual(lineas.map((l) => [l.id, finales.get(l.id)]));
    expect(lineas.find((l) => l.id === "b1")?.precioFijado).toBe(4000); // anotada antes de subir la rubia
    expect(lineas.find((l) => l.id === "b5")?.precioFijado).toBe(4800);
  });

  it("no cambia el registro que recibe", () => {
    expect(registro.find((o) => o.t === "anotar" && o.cuenta === "buena")).not.toHaveProperty("lineas.0.precioFijado");
  });

  it("falla si las cifras de control del negocio no coinciden", () => {
    const mal = depurar(registro, { ...REGLA, esperado: { cuentas: 2, total: 1, porMedio: { efectivo: 1, nequi: 0 } } });
    expect(mal.errores).toHaveLength(3);
    const bien = depurar(registro, { ...REGLA, esperado: { cuentas: 1, total: total(original.cuentas.buena), porMedio: { efectivo: total(original.cuentas.buena) } } });
    expect(bien.errores).toEqual([]);
  });

  it("la verificación detecta un registro nuevo que no da lo mismo", () => {
    const alterado = structuredClone(r.registro);
    const anotar = alterado.find((o) => o.t === "anotar");
    if (anotar?.t === "anotar") anotar.lineas[0].precioFijado = 1;
    const nuevo = alterado.reduce((e, o) => aplicar(e, o), estadoVacio());
    expect(verificar(original, nuevo, r.conservadas, REGLA).join()).toMatch(/no queda idéntica/);
    const sinCatalogo = r.registro.filter((o) => o.t !== "producto" && o.t !== "orden").reduce((e, o) => aplicar(e, structuredClone(o)), estadoVacio());
    expect(verificar(original, sinCatalogo, r.conservadas, REGLA).join()).toMatch(/catálogo no queda igual/);
  });
});
