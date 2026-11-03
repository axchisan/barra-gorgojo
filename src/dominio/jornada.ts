// El día (jornada, de 5 a. m. a 5 a. m. en Colombia): resumen y CSV. Función pura,
// compartida por la pantalla «El día», el historial del servidor y la exportación.
// RF-50 a RF-53 de docs/01.

import { efectivoDeJornada, jornada, situacion, type Cuenta, type Medio } from "./estado";
import { horaDe } from "./formato";

export interface RenglonDia { producto: string; nombre: string; cantidad: number; valor: number }

export interface ResumenJornada {
  fecha: string;
  vendido: number;
  /** Lo vendido que era comida («Otro» marcado como comida). */
  vendidoComida: number;
  porMedio: Record<Medio, number>;
  efectivo: number;
  porProducto: RenglonDia[];
  cuentas: number;
}

/** Lo que pertenece a una jornada: las pedidas anotadas y los cobros hechos ese día. */
export function resumenJornada(cuentas: Iterable<Cuenta>, fecha: string): ResumenJornada {
  const lista = [...cuentas];
  const porMedio: Record<Medio, number> = { efectivo: 0, nequi: 0, breve: 0, comida: 0 };
  const porProducto = new Map<string, RenglonDia>();
  let vendido = 0;
  let vendidoComida = 0;
  const conVenta = new Set<string>();
  for (const c of lista) {
    if (c.anulada) continue;
    for (const p of c.pagos) {
      if (p.deshecho || jornada(p.en) !== fecha) continue;
      porMedio[p.medio] += p.monto;
    }
    const rondas = new Set(c.rondas.filter((r) => jornada(r.en) === fecha).map((r) => r.id));
    for (const l of c.lineas) {
      if (l.anulada || !rondas.has(l.ronda)) continue;
      conVenta.add(c.id);
      vendido += l.precio * l.cantidad;
      if (l.comida) vendidoComida += l.precio * l.cantidad;
      const clave = `${l.producto}:${l.nombre}`;
      const x = porProducto.get(clave) ?? { producto: l.producto, nombre: l.nombre, cantidad: 0, valor: 0 };
      x.cantidad += l.cantidad;
      x.valor += l.precio * l.cantidad;
      porProducto.set(clave, x);
    }
  }
  return {
    fecha, vendido, vendidoComida, porMedio, efectivo: efectivoDeJornada(lista, fecha),
    porProducto: [...porProducto.values()].sort((a, b) => b.cantidad - a.cantidad),
    cuentas: conVenta.size,
  };
}

/** Las jornadas en que hubo pedidas o cobros, de la más reciente a la más vieja. */
export function jornadasConMovimiento(cuentas: Iterable<Cuenta>): string[] {
  const fechas = new Set<string>();
  for (const c of cuentas) {
    if (c.anulada) continue;
    for (const r of c.rondas) fechas.add(jornada(r.en));
    for (const p of c.pagos) if (!p.deshecho) fechas.add(jornada(p.en));
  }
  return [...fechas].sort().reverse();
}

const celda = (x: string | number) => {
  const t = String(x);
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/**
 * Una fila por producto vendido en la jornada, para la hoja de cálculo (RF-53). Separado
 * por «;» y pesos enteros sin puntos, como lo abre Excel en español de Colombia.
 */
export function csvJornada(cuentas: Iterable<Cuenta>, fecha: string): string {
  const filas: (string | number)[][] = [["fecha", "hora", "cuenta", "tipo", "pedida", "anotó", "producto", "cantidad", "precio", "valor", "comida", "cuenta quedó", "cobro"]];
  for (const c of cuentas) {
    if (c.anulada) continue;
    const s = situacion(c);
    const cobro = [...new Set(c.pagos.filter((p) => !p.deshecho).map((p) => p.medio))].join(" + ");
    for (const r of c.rondas) {
      if (jornada(r.en) !== fecha) continue;
      for (const l of c.lineas) {
        if (l.ronda !== r.id || l.anulada) continue;
        filas.push([fecha, horaDe(r.en), c.nombre, c.tipo, r.numero, r.persona, l.nombre, l.cantidad, l.precio, l.cantidad * l.precio, l.comida ? "sí" : "no", s, cobro]);
      }
    }
  }
  return filas.map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
}
