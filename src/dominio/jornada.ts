// El día (jornada, de 5 a. m. a 5 a. m. en Colombia): resumen y CSV. Función pura,
// compartida por la pantalla «El día», el historial del servidor y la exportación.
// RF-50 a RF-53 de docs/01.

import { areaDe, type Area } from "./areas";
import { efectivoDeJornada, jornada, saldo, situacion, type Cuenta, type Medio } from "./estado";
import { horaDe } from "./formato";

export interface RenglonDia { producto: string; nombre: string; cantidad: number; valor: number; comida?: boolean }

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
  const porMedio: Record<Medio, number> = { efectivo: 0, nequi: 0, breve: 0, comida: 0, deuda: 0 };
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
      const clave = `${l.producto}:${l.nombre}:${l.comida ? 1 : 0}`;
      const x = porProducto.get(clave) ?? { producto: l.producto, nombre: l.nombre, cantidad: 0, valor: 0, ...(l.comida ? { comida: true } : {}) };
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

// ── Las cuentas del día para hacer cuentas (2026-11-15) ──────────────────────────────
// Una cuenta con comida y barra se cobra completa en una sola caja (ADR-15). Para saber
// cuánto de comida entró por Nequi, o cuánto le debe pasar una caja a la otra, cada pago
// se reparte entre barra y comida: el pago por productos, exacto por sus productos; los
// demás, en orden, según lo que le faltaba pagar a cada área en ese momento.

/** Un pago de la cuenta, repartido entre lo que se vendió de barra y de comida. */
export interface PagoRepartido {
  id: string;
  medio: Medio;
  /** La caja donde entró (docs/14). */
  caja: Area;
  monto: number;
  barra: number;
  comida: number;
  persona: string;
  en: number;
  deudor?: string;
  pagador?: string;
}

export interface CuentaDelDia {
  cuenta: Cuenta;
  barra: number;
  comida: number;
  /** Los pagos de esa jornada (los de otros días no suman aquí). */
  pagos: PagoRepartido[];
  /** Lo que falta por cobrar hoy (cuentas abiertas). */
  falta: number;
  /** La primera pedida o el primer pago de la jornada. */
  desde: number;
}

/** Cifras de una celda: barra, comida y total. */
export interface Parte { barra: number; comida: number }
export type Medios = "efectivo" | "nequi" | "breve" | "deuda" | "comida";

export interface CuentasDelDia {
  cuentas: CuentaDelDia[];
  anuladas: Cuenta[];
  /** Cómo pagaron, por medio, partido en barra y comida. */
  porMedio: Record<Medios, Parte>;
  /** Lo que queda por cobrar, partido en barra y comida. */
  porCobrar: Parte;
  /** Lo que cobró cada caja, por medio (y cuánto de eso era de la otra área). */
  cajas: Record<Area, { porMedio: Record<Medios, number>; deLaOtra: Record<Medios, number> }>;
}

const parteVacia = (): Parte => ({ barra: 0, comida: 0 });
const mediosVacios = (): Record<Medios, number> => ({ efectivo: 0, nequi: 0, breve: 0, deuda: 0, comida: 0 });

/** Reparte los pagos vivos de una cuenta entre barra y comida (todos, de cualquier día). */
export function repartirPagos(c: Cuenta): PagoRepartido[] {
  const vivas = c.lineas.filter((l) => !l.anulada);
  const precio = new Map(vivas.map((l) => [l.id, l]));
  const falta = { barra: 0, comida: 0 };
  for (const l of vivas) falta[l.comida ? "comida" : "barra"] += l.precio * l.cantidad;
  const r: PagoRepartido[] = [];
  for (const p of [...c.pagos].filter((x) => !x.deshecho).sort((a, b) => a.en - b.en)) {
    let comida: number;
    if (p.lineas?.length) {
      // Por productos: exacto (escalado si el monto no da lo mismo, p. ej. con tope).
      let pc = 0, pb = 0;
      for (const x of p.lineas) {
        const l = precio.get(x.linea);
        if (!l) continue;
        if (l.comida) pc += l.precio * x.cantidad; else pb += l.precio * x.cantidad;
      }
      comida = pc + pb > 0 ? Math.round((p.monto * pc) / (pc + pb)) : 0;
    } else {
      const fc = Math.max(0, falta.comida), fb = Math.max(0, falta.barra);
      comida = fc + fb > 0 ? Math.round((p.monto * fc) / (fc + fb)) : 0;
    }
    comida = Math.max(0, Math.min(p.monto, comida));
    const barra = p.monto - comida;
    falta.comida -= comida;
    falta.barra -= barra;
    r.push({
      id: p.id, medio: p.medio, caja: areaDe(p.area), monto: p.monto, barra, comida, persona: p.persona, en: p.en,
      ...(p.deudor ? { deudor: p.deudor } : {}), ...(p.pagador ? { pagador: p.pagador } : {}),
    });
  }
  return r;
}

/** Las cuentas de una jornada (con pedidas o cobros ese día), con sus pagos repartidos y los totales. */
export function cuentasDelDia(cuentas: Iterable<Cuenta>, fecha: string): CuentasDelDia {
  const lista: CuentaDelDia[] = [];
  const anuladas: Cuenta[] = [];
  const porMedio = { efectivo: parteVacia(), nequi: parteVacia(), breve: parteVacia(), deuda: parteVacia(), comida: parteVacia() };
  const porCobrar = parteVacia();
  const cajas = {
    barra: { porMedio: mediosVacios(), deLaOtra: mediosVacios() },
    comida: { porMedio: mediosVacios(), deLaOtra: mediosVacios() },
  };
  for (const c of cuentas) {
    const rondasHoy = c.rondas.filter((r) => jornada(r.en) === fecha);
    const pagosHoy = c.pagos.filter((p) => !p.deshecho && jornada(p.en) === fecha);
    if (!rondasHoy.length && !pagosHoy.length) continue;
    if (c.anulada) { anuladas.push(c); continue; }
    if (c.juntadaA) continue; // lo suyo se cobra en la cuenta con que se juntó
    const repartidos = repartirPagos(c);
    const hoy = repartidos.filter((p) => jornada(p.en) === fecha);
    let barra = 0, comida = 0;
    for (const l of c.lineas) if (!l.anulada) { if (l.comida) comida += l.precio * l.cantidad; else barra += l.precio * l.cantidad; }
    for (const p of hoy) {
      const m = p.medio as Medios;
      porMedio[m].barra += p.barra;
      porMedio[m].comida += p.comida;
      cajas[p.caja].porMedio[m] += p.monto;
      cajas[p.caja].deLaOtra[m] += p.caja === "barra" ? p.comida : p.barra;
    }
    const falta = situacion(c) === "abierta" ? Math.max(0, saldo(c)) : 0;
    if (falta > 0) {
      const pagado = repartidos.reduce((t, p) => ({ barra: t.barra + p.barra, comida: t.comida + p.comida }), parteVacia());
      const fc = Math.max(0, comida - pagado.comida);
      const fb = Math.max(0, barra - pagado.barra);
      const pc = fc + fb > 0 ? Math.round((falta * fc) / (fc + fb)) : 0;
      porCobrar.comida += pc;
      porCobrar.barra += falta - pc;
    }
    const desde = Math.min(...rondasHoy.map((r) => r.en), ...pagosHoy.map((p) => p.en));
    lista.push({ cuenta: c, barra, comida, pagos: hoy, falta, desde });
  }
  lista.sort((a, b) => b.desde - a.desde);
  return { cuentas: lista, anuladas, porMedio, porCobrar, cajas };
}
