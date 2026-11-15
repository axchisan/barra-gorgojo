// Lo que ve cada persona (docs/17 «Accesos de empleados»). El servidor manda a cada celular
// solo lo que su persona puede ver: esconder un botón no es seguridad (docs/03). Función
// pura, para probarla sin el Worker.
//
// - Sin permiso «dia»: no le llegan los cierres de caja (ni ve «El día» en la pantalla).
// - Sin permiso «historial»: de las deudas, solo lo fiado y lo pagado hoy; de las cuentas,
//   las abiertas y las que tuvieron algo hoy (no las de ayer que siguen en la ventana de 36 h).

import type { Deudor } from "./deudas";
import { esVigente, jornada, situacion, total, type Cuenta, type Estado } from "./estado";

export interface Vista {
  /** Ve el día de ventas: totales, cierres de caja, días anteriores. */
  dia: boolean;
  /** Ve deudas y cuentas de otros días. */
  historial: boolean;
}

export const VISTA_COMPLETA: Vista = { dia: true, historial: true };
export const esCompleta = (v: Vista) => v.dia && v.historial;

/** Una cuenta que sí ve quien no tiene historial: abierta con algo, o con movimiento hoy. */
export function cuentaDeHoy(c: Cuenta, ahora: number): boolean {
  const hoy = jornada(ahora);
  if (situacion(c) === "abierta" && total(c) > 0) return true;
  if (situacion(c) === "comida" && !c.comidaCobrada) return true;
  return jornada(c.ultima) === hoy || jornada(c.abiertaEn) === hoy;
}

/** Las deudas como las ve quien no tiene historial: solo los movimientos de hoy. */
export function deudasDeHoy(deudas: Record<string, Deudor>, ahora: number): Record<string, Deudor> {
  const hoy = jornada(ahora);
  const r: Record<string, Deudor> = {};
  for (const d of Object.values(deudas)) {
    const movimientos = d.movimientos.filter((m) => jornada(m.en) === hoy);
    if (movimientos.length) r[d.id] = { ...d, movimientos };
  }
  return r;
}

/** El estado recortado para esta vista (las cuentas ya vienen recortadas a lo vigente). */
export function limitarEstado(e: Estado, v: Vista, ahora: number): Estado {
  if (esCompleta(v)) return e;
  const r: Estado = { ...e };
  if (!v.dia) delete r.jornadas;
  if (!v.historial) {
    r.cuentas = Object.fromEntries(Object.entries(e.cuentas).filter(([, c]) => esVigente(c, ahora) && cuentaDeHoy(c, ahora)));
    if (e.deudas) r.deudas = deudasDeHoy(e.deudas, ahora);
  }
  return r;
}

/** Lo mismo para los cambios que se mandan después de cada operación. */
export function limitarCambios<T extends { cuentas?: Record<string, Cuenta>; jornadas?: unknown; deudas?: Record<string, Deudor> }>(c: T, v: Vista, ahora: number): T {
  if (esCompleta(v)) return c;
  const r = { ...c };
  if (!v.dia) delete r.jornadas;
  if (!v.historial) {
    if (r.cuentas) r.cuentas = Object.fromEntries(Object.entries(r.cuentas).filter(([, x]) => cuentaDeHoy(x, ahora)));
    if (r.deudas) r.deudas = deudasDeHoy(r.deudas, ahora);
  }
  return r;
}
