// Deudas (fiado): lo que alguien queda debiendo (docs/15). Una cuenta o parte de ella se
// «pasa a deuda» al cobrarla con el medio «deuda», o el administrador anota una deuda a
// mano (las de comida que se llevaban aparte). Los pagos de deudas se llevan aquí, aparte
// de la caja del día: la venta ya contó el día en que se fió.

/** Un movimiento de la deuda de una persona. Nada se borra: se anula con quién y cuándo. */
export interface MovimientoDeuda {
  id: string;
  tipo: "cargo" | "pago";
  valor: number;
  en: number;
  por: string;
  /** Cargo que salió de una cuenta: cuál, y el pago de la cuenta que lo originó. */
  cuenta?: { id: string; nombre: string };
  /** Cargo anotado a mano: qué es. */
  concepto?: string;
  /** Cuánto del cargo es comida (para el total de deudas de comida). */
  comida?: number;
  /** Medio con que pagó (pagos). */
  medio?: "efectivo" | "nequi" | "breve";
  anulado?: { por: string; en: number };
}

export interface Deudor {
  id: string;
  nombre: string;
  movimientos: MovimientoDeuda[];
}

/** El id de una persona que debe, a partir de su nombre: «Pedro » y «pedro» son la misma. */
export function idDeudor(nombre: string): string {
  return nombre.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

const vivos = (d: Deudor) => d.movimientos.filter((m) => !m.anulado);

/** Lo que debe hoy: cargos menos pagos (nunca negativo en pantalla). */
export function saldoDeudor(d: Deudor): number {
  return vivos(d).reduce((s, m) => s + (m.tipo === "cargo" ? m.valor : -m.valor), 0);
}

/**
 * Lo que debe de comida: los cargos de comida menos la parte de los pagos que les toca
 * (los pagos se reparten en proporción a lo que se debía de cada cosa).
 */
export function comidaDeudor(d: Deudor): number {
  const cargos = vivos(d).filter((m) => m.tipo === "cargo");
  const total = cargos.reduce((s, m) => s + m.valor, 0);
  if (total <= 0) return 0;
  const comida = cargos.reduce((s, m) => s + (m.comida ?? 0), 0);
  return Math.round((comida * saldoDeudor(d)) / total);
}

/** Pagos de deudas recibidos en una jornada (aparte de la caja). */
export function pagosDeudasDe(deudores: Iterable<Deudor>, fecha: string, jornada: (en: number) => string) {
  const r = { total: 0, efectivo: 0, nequi: 0, breve: 0 };
  for (const d of deudores) {
    for (const m of vivos(d)) {
      if (m.tipo !== "pago" || jornada(m.en) !== fecha) continue;
      r.total += m.valor;
      r[m.medio ?? "efectivo"] += m.valor;
    }
  }
  return r;
}
