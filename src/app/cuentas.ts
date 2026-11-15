// Ayudas de presentación de una cuenta, compartidas por varias pantallas.
import { producto as productoDe, type Cuenta } from "../dominio/estado";
import { nombreCancha } from "../dominio/formato";
import { sinc } from "./sincronizacion";

export const iconoTipo = (c: Cuenta) =>
  c.tipo === "mesa" ? (c.mesa ? `🍽 Mesa ${c.mesa}` : "🍽 Mesa") :
  c.tipo === "cancha" ? `🎯 Cancha ${nombreCancha(c.cancha!)}` :
  c.tipo === "domicilio" ? `🛵 Domicilio${c.direccion ? ` · ${c.direccion}` : ""}` : null;

/** «14:00» → la hora de hoy en Colombia (ms); si ya pasó hace más de una hora, la de mañana. */
export function horaDeHoy(texto: string, ahora = Date.now()): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto.trim());
  if (!m) return undefined;
  const DIA = 24 * 3600_000;
  const medianoche = Math.floor((ahora - 5 * 3600_000) / DIA) * DIA + 5 * 3600_000;
  let en = medianoche + (Number(m[1]) * 60 + Number(m[2])) * 60_000;
  if (en < ahora - 3600_000) en += DIA;
  return en;
}

export interface Renglon { producto: string; nombre: string; cantidad: number; precio?: number; valor: number; comida?: boolean }

export function resumen(c: Cuenta): Renglon[] {
  const m = new Map<string, Renglon>();
  for (const l of c.lineas) {
    if (l.anulada) continue;
    // Un plato con nota va en su propio renglón, con la nota a la vista (docs/14).
    const k = `${l.producto}:${l.nombre}:${l.precio}:${l.comida ? 1 : 0}:${l.nota ?? ""}`;
    const x = m.get(k) ?? { producto: l.producto, nombre: l.nota ? `${l.nombre} · ${l.nota}` : l.nombre, precio: l.precio, cantidad: 0, valor: 0, comida: l.comida };
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
