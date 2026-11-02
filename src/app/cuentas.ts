// Ayudas de presentación de una cuenta, compartidas por varias pantallas.
import { producto as productoDe, type Cuenta } from "../dominio/estado";
import { nombreCancha } from "../dominio/formato";
import { sinc } from "./sincronizacion";

export const iconoTipo = (c: Cuenta) =>
  c.tipo === "mesa" ? `🍽 Mesa ${c.mesa}` : c.tipo === "cancha" ? `🎯 Cancha ${nombreCancha(c.cancha!)}` : null;

export interface Renglon { producto: string; nombre: string; cantidad: number; precio?: number; valor: number; comida?: boolean }

export function resumen(c: Cuenta): Renglon[] {
  const m = new Map<string, Renglon>();
  for (const l of c.lineas) {
    if (l.anulada) continue;
    const k = `${l.producto}:${l.nombre}:${l.precio}:${l.comida ? 1 : 0}`;
    const x = m.get(k) ?? { producto: l.producto, nombre: l.nombre, precio: l.precio, cantidad: 0, valor: 0, comida: l.comida };
    x.cantidad += l.cantidad;
    x.valor += l.cantidad * l.precio;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

/** Mismo color del botón de anotar: el ojo reconoce el producto antes de leerlo. */
export const colorDe = (producto: string) => {
  const p = productoDe(sinc.visible, producto);
  return p ? { background: p.fondo, color: p.texto } : undefined;
};
