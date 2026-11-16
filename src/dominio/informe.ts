// Informes por semana y por mes (2026-11-16, docs/18 fase 3 b, docs/02 «Informes»). Pedido
// del dueño: «que encaje de la mejor manera, algo muy cómodo, útil y bien estructurado».
// Suma los días de un periodo (lo vendido, cómo pagaron, lo más vendido, la caja, el fiado)
// y lo compara con el periodo anterior. Función pura: el servidor arma cada día
// (`DiaInforme`) desde la proyección y la pantalla y el CSV salen de aquí.

import type { CierreJornada } from "./estado";
import { celda, NOMBRE_MEDIO, type Medios, type Parte, type RenglonDia } from "./jornada";

export type TipoPeriodo = "semana" | "mes";

/** Un día, como lo manda el servidor para los informes. */
export interface DiaInforme {
  fecha: string;
  vendido: number;
  vendidoComida: number;
  cuentas: number;
  /** Cambios de plata (no son venta). */
  cambios: number;
  porMedio: Record<Medios, Parte>;
  porCobrar: Parte;
  porProducto: RenglonDia[];
  cierres: CierreJornada[];
  /** Pagos de deudas recibidos ese día (aparte de la caja). */
  pagosDeudas: { total: number; efectivo: number; nequi: number; breve: number };
}

const MS_DIA = 86_400_000;
const comoFecha = (f: string) => new Date(`${f}T12:00:00Z`);
const texto = (d: Date) => d.toISOString().slice(0, 10);
export const sumarDias = (f: string, n: number) => texto(new Date(comoFecha(f).getTime() + n * MS_DIA));

/** El lunes de la semana de una fecha AAAA-MM-DD. */
export function lunesDe(fecha: string): string {
  const dia = comoFecha(fecha).getUTCDay(); // 0 domingo … 6 sábado
  return sumarDias(fecha, -((dia + 6) % 7));
}

/** La clave del periodo de una fecha: el lunes de su semana, o AAAA-MM. */
export const claveDe = (tipo: TipoPeriodo, fecha: string) => (tipo === "semana" ? lunesDe(fecha) : fecha.slice(0, 7));

/** Primer y último día del periodo. */
export function rango(tipo: TipoPeriodo, clave: string): { desde: string; hasta: string } {
  if (tipo === "semana") return { desde: clave, hasta: sumarDias(clave, 6) };
  const [a, m] = clave.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${clave}-01`, hasta: `${clave}-${String(ultimo).padStart(2, "0")}` };
}

/** La clave del periodo anterior (o siguiente, con `paso` = 1). */
export function otroPeriodo(tipo: TipoPeriodo, clave: string, paso = -1): string {
  if (tipo === "semana") return sumarDias(clave, 7 * paso);
  const [a, m] = clave.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + paso, 1));
  return texto(d).slice(0, 7);
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const diaMes = (f: string) => `${Number(f.slice(8))} de ${MESES[Number(f.slice(5, 7)) - 1]}`;

/** «Semana del 16 al 22 de noviembre», «Noviembre de 2026». */
export function nombrePeriodo(tipo: TipoPeriodo, clave: string): string {
  if (tipo === "mes") {
    const nombre = MESES[Number(clave.slice(5)) - 1];
    return `${nombre[0].toUpperCase()}${nombre.slice(1)} de ${clave.slice(0, 4)}`;
  }
  const { desde, hasta } = rango(tipo, clave);
  return desde.slice(5, 7) === hasta.slice(5, 7)
    ? `Semana del ${Number(desde.slice(8))} al ${diaMes(hasta)}`
    : `Semana del ${diaMes(desde)} al ${diaMes(hasta)}`;
}

/** «esta semana», «la semana pasada», «este mes»… para comparar en palabras. */
export function relativo(tipo: TipoPeriodo, clave: string, hoy: string): string | null {
  const actual = claveDe(tipo, hoy);
  if (clave === actual) return tipo === "semana" ? "esta semana" : "este mes";
  if (clave === otroPeriodo(tipo, actual)) return tipo === "semana" ? "la semana pasada" : "el mes pasado";
  return null;
}

export const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const diaSemana = (f: string) => DIAS_SEMANA[comoFecha(f).getUTCDay()];

/** El último cierre de cada caja (si se cerró dos veces, vale el último). */
export function ultimosCierres(cierres: CierreJornada[]): CierreJornada[] {
  const m = new Map<string, CierreJornada>();
  for (const c of cierres) m.set(c.area ?? "todo", c);
  return [...m.values()];
}

export interface Informe {
  tipo: TipoPeriodo;
  clave: string;
  desde: string;
  hasta: string;
  /** El periodo incluye hoy: aún no termina. */
  enCurso: boolean;
  /** Los días con movimiento, del más viejo al más nuevo. */
  dias: DiaInforme[];
  vendido: number;
  vendidoComida: number;
  cuentas: number;
  cambios: number;
  porMedio: Record<Medios, Parte>;
  porCobrar: Parte;
  productos: RenglonDia[];
  caja: {
    cuadraron: number;
    sobro: { dias: number; valor: number };
    falto: { dias: number; valor: number };
    /** Días que pasaron sin cerrar la caja (hoy no cuenta: aún puede cerrarse). */
    sinCerrar: string[];
  };
  /** Lo que se fió en el periodo (cuentas pasadas a deuda). */
  fiado: number;
  /** Lo que se recibió de deudas en el periodo. */
  pagosDeudas: { total: number; efectivo: number; nequi: number; breve: number };
  promedioDia: number;
  promedioCuentas: number;
  masFuerte: { fecha: string; vendido: number } | null;
}

const parte = (): Parte => ({ barra: 0, comida: 0 });
const medios = (): Record<Medios, Parte> => ({ efectivo: parte(), nequi: parte(), breve: parte(), deuda: parte(), comida: parte() });

/** El informe de un periodo con los días que tuvieron movimiento en él. `hoy`: la jornada de hoy. */
export function informe(tipo: TipoPeriodo, clave: string, todos: DiaInforme[], hoy: string): Informe {
  const { desde, hasta } = rango(tipo, clave);
  const dias = todos.filter((d) => d.fecha >= desde && d.fecha <= hasta).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const porMedio = medios();
  const porCobrar = parte();
  const productos = new Map<string, RenglonDia>();
  const caja: Informe["caja"] = { cuadraron: 0, sobro: { dias: 0, valor: 0 }, falto: { dias: 0, valor: 0 }, sinCerrar: [] };
  const pagosDeudas = { total: 0, efectivo: 0, nequi: 0, breve: 0 };
  let vendido = 0, vendidoComida = 0, cuentas = 0, cambios = 0;
  let masFuerte: Informe["masFuerte"] = null;
  for (const d of dias) {
    vendido += d.vendido;
    vendidoComida += d.vendidoComida;
    cuentas += d.cuentas;
    cambios += d.cambios;
    for (const m of Object.keys(porMedio) as Medios[]) {
      porMedio[m].barra += d.porMedio[m].barra;
      porMedio[m].comida += d.porMedio[m].comida;
    }
    // Lo que quedó por cobrar se ve de cada día: lo que se cobró después ya no está.
    porCobrar.barra += d.porCobrar.barra;
    porCobrar.comida += d.porCobrar.comida;
    for (const x of d.porProducto) {
      const k = `${x.producto}:${x.nombre}:${x.comida ? 1 : 0}`;
      const y = productos.get(k) ?? { ...x, cantidad: 0, valor: 0 };
      y.cantidad += x.cantidad;
      y.valor += x.valor;
      productos.set(k, y);
    }
    for (const k of ["total", "efectivo", "nequi", "breve"] as const) pagosDeudas[k] += d.pagosDeudas[k];
    const cierres = ultimosCierres(d.cierres);
    if (!cierres.length) { if (d.fecha !== hoy && d.vendido > 0) caja.sinCerrar.push(d.fecha); }
    else {
      const dif = cierres.reduce((t, c) => t + c.contado - c.esperado, 0);
      if (cierres.every((c) => c.contado === c.esperado)) caja.cuadraron++;
      else if (dif >= 0) { caja.sobro.dias++; caja.sobro.valor += dif; }
      else { caja.falto.dias++; caja.falto.valor -= dif; }
    }
    if (d.vendido > 0 && (!masFuerte || d.vendido > masFuerte.vendido)) masFuerte = { fecha: d.fecha, vendido: d.vendido };
  }
  const abiertos = dias.filter((d) => d.vendido > 0).length;
  return {
    tipo, clave, desde, hasta, enCurso: hoy >= desde && hoy <= hasta, dias,
    vendido, vendidoComida, cuentas, cambios, porMedio, porCobrar,
    productos: [...productos.values()].sort((a, b) => b.valor - a.valor || b.cantidad - a.cantidad),
    caja, fiado: porMedio.deuda.barra + porMedio.deuda.comida, pagosDeudas,
    promedioDia: abiertos ? Math.round(vendido / abiertos) : 0,
    promedioCuentas: abiertos ? Math.round(cuentas / abiertos) : 0,
    masFuerte: dias.length > 1 ? masFuerte : null,
  };
}

/**
 * Lo vendido en el periodo anterior, para comparar. Si el actual aún no termina, se compara
 * con los mismos días del anterior (lunes a miércoles contra lunes a miércoles; del 1 al 16
 * contra del 1 al 16): comparar media semana con una entera no dice nada.
 */
export function comparacion(actual: Pick<Informe, "tipo" | "clave" | "desde" | "enCurso" | "vendido">, todos: Pick<DiaInforme, "fecha" | "vendido">[], hoy: string): { anterior: number; parcial: boolean; cambio: number | null } {
  const clave = otroPeriodo(actual.tipo, actual.clave);
  const { desde, hasta: fin } = rango(actual.tipo, clave);
  let hasta = fin;
  if (actual.enCurso) {
    if (actual.tipo === "semana") hasta = sumarDias(desde, Math.round((comoFecha(hoy).getTime() - comoFecha(actual.desde).getTime()) / MS_DIA));
    else hasta = `${clave}-${hoy.slice(8)}` < fin ? `${clave}-${hoy.slice(8)}` : fin;
  }
  const anterior = todos.filter((d) => d.fecha >= desde && d.fecha <= hasta).reduce((t, d) => t + d.vendido, 0);
  return { anterior, parcial: actual.enCurso, cambio: anterior > 0 ? Math.round(((actual.vendido - anterior) * 100) / anterior) : null };
}

/** Las fechas que hay que pedirle al servidor para un informe y su comparación. */
export function fechasParaInforme(tipo: TipoPeriodo, clave: string): { desde: string; hasta: string } {
  return { desde: rango(tipo, otroPeriodo(tipo, clave)).desde, hasta: rango(tipo, clave).hasta };
}

const nombreCaja = (area?: string) => (area === "comida" ? "Cocina" : area === "barra" ? "Barra" : "Toda");

/** El informe en un CSV por secciones, como el del día: resumen, por día, cómo pagaron, por producto, caja y fiado. */
export function csvInforme(inf: Informe, comp: ReturnType<typeof comparacion>): string {
  const filas: (string | number)[][] = [];
  const blanco = () => filas.push([]);
  const suma = (p: Parte) => p.barra + p.comida;
  filas.push([`Barra del Gorgojo · ${nombrePeriodo(inf.tipo, inf.clave)} (del ${inf.desde} al ${inf.hasta})${inf.enCurso ? " · en curso" : ""}`]);
  blanco();
  filas.push(["RESUMEN"]);
  filas.push(["concepto", "barra", "comida", "total"]);
  filas.push(["Vendido", inf.vendido - inf.vendidoComida, inf.vendidoComida, inf.vendido]);
  filas.push([`Vendido ${inf.tipo === "semana" ? "la semana anterior" : "el mes anterior"}${comp.parcial ? " (los mismos días)" : ""}`, "", "", comp.anterior]);
  if (comp.cambio !== null) filas.push(["Diferencia", "", "", `${comp.cambio > 0 ? "+" : ""}${comp.cambio} %`]);
  filas.push(["Días con ventas", "", "", inf.dias.filter((d) => d.vendido > 0).length]);
  filas.push(["Venta promedio por día", "", "", inf.promedioDia]);
  filas.push(["Cuentas", "", "", inf.cuentas]);
  if (inf.cambios > 0) filas.push(["Cambios de plata (no es venta)", "", "", inf.cambios]);

  blanco();
  filas.push(["POR DÍA"]);
  filas.push(["fecha", "día", "cuentas", "barra", "comida", "vendido", "efectivo", "nequi", "breve", "fiado", "caja"]);
  for (const d of inf.dias) {
    const cierres = ultimosCierres(d.cierres);
    const dif = cierres.reduce((t, c) => t + c.contado - c.esperado, 0);
    const estado = !cierres.length ? "sin cerrar" : cierres.every((c) => c.contado === c.esperado) ? "cuadró" : dif >= 0 ? `sobraron ${dif}` : `faltaron ${-dif}`;
    filas.push([d.fecha, diaSemana(d.fecha), d.cuentas, d.vendido - d.vendidoComida, d.vendidoComida, d.vendido, suma(d.porMedio.efectivo), suma(d.porMedio.nequi), suma(d.porMedio.breve), suma(d.porMedio.deuda), estado]);
  }
  filas.push(["TOTAL", "", inf.cuentas, inf.vendido - inf.vendidoComida, inf.vendidoComida, inf.vendido, suma(inf.porMedio.efectivo), suma(inf.porMedio.nequi), suma(inf.porMedio.breve), suma(inf.porMedio.deuda), ""]);

  blanco();
  filas.push(["CÓMO PAGARON"]);
  filas.push(["medio", "barra", "comida", "total"]);
  for (const m of Object.keys(NOMBRE_MEDIO) as Medios[]) {
    if (m !== "efectivo" && suma(inf.porMedio[m]) === 0) continue;
    filas.push([NOMBRE_MEDIO[m], inf.porMedio[m].barra, inf.porMedio[m].comida, suma(inf.porMedio[m])]);
  }
  if (suma(inf.porCobrar) > 0) filas.push(["Quedó por cobrar", inf.porCobrar.barra, inf.porCobrar.comida, suma(inf.porCobrar)]);

  blanco();
  filas.push(["POR PRODUCTO"]);
  filas.push(["producto", "área", "cantidad", "valor"]);
  for (const x of [...inf.productos].sort((a, b) => Number(!!a.comida) - Number(!!b.comida) || b.valor - a.valor)) {
    filas.push([x.nombre, x.comida ? "comida" : "barra", x.cantidad, x.valor]);
  }

  blanco();
  filas.push(["CAJA"]);
  filas.push(["fecha", "caja", "cerró", "efectivo contado", "debía haber", "diferencia"]);
  for (const d of inf.dias) {
    const cierres = ultimosCierres(d.cierres);
    if (!cierres.length && d.vendido > 0) filas.push([d.fecha, "Sin cerrar"]);
    for (const c of cierres) filas.push([d.fecha, nombreCaja(c.area), c.por, c.contado, c.esperado, c.contado - c.esperado]);
  }

  blanco();
  filas.push(["FIADO"]);
  filas.push(["concepto", "total"]);
  filas.push(["Se fió", inf.fiado]);
  filas.push(["Pagaron de deudas", inf.pagosDeudas.total]);
  return filas.map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
}
