// Reglas de la barra. Función pura compartida por el celular y el servidor:
// el total que se ve en pantalla es el mismo que calcula el servidor.
// Ver docs/04-sincronizacion-y-fuera-de-linea.md.

import { areaDe, esArea, type Area } from "./areas";
import { idDeudor, saldoDeudor, type Deudor } from "./deudas";
import { CATALOGO, ESPECIALES, PRODUCTOS, TOPE_VALOR_LIBRE, type Categoria, type Producto } from "./catalogo";

export type TipoCuenta = "grupo" | "persona" | "mesa" | "cancha" | "rapida";
/** «deuda»: no entra plata; queda como deuda de alguien (docs/15). */
export type Medio = "efectivo" | "nequi" | "breve" | "comida" | "deuda";
export type Cancha = "1" | "2" | "pequena";

export interface Linea {
  id: string;
  ronda: string;
  producto: string;
  nombre: string;
  precio: number;
  cantidad: number;
  anulada?: { por: string; en: number };
  /** Algo de comida anotado en la barra («Otro» marcado como comida): se suma aparte. */
  comida?: boolean;
  /** Si se le cambió la cantidad después de anotarla: quién, cuándo y cuánto era. */
  editada?: { por: string; en: number; antes: number };
  /** Si vino en un petaco o medio petaco (puro o mixto). Todas las líneas del mismo paquete comparten `id`. */
  paquete?: Paquete;
  /** Nota del producto al anotarlo («solo carne», «más yuca»). */
  nota?: string;
  /** Bebida pedida desde comida que la barra aún no ha despachado (docs/14). */
  porDespachar?: true;
  /** Quién la despachó y cuándo. */
  despachada?: { por: string; en: number };
  /** Vino de otra cuenta que se juntó con esta (su id). */
  de?: string;
}

export interface Paquete {
  id: string;
  tipo: "petaco" | "medio";
  mixto: boolean;
}

export interface Ronda {
  id: string;
  numero: number;
  persona: string;
  en: number;
  /** Vino de otra cuenta que se juntó con esta: su id, su nombre y el número que tenía allá. */
  de?: { cuenta: string; nombre: string; numero: number };
  /** En las canchas: un pedido suelto que no cuenta como chico (una cerveza más después del chivo). */
  adicional?: true;
  /** Detalles de un pedido a la barra: para dónde o para quién («para el limón»). */
  detalle?: string;
}

export interface Pago {
  id: string;
  medio: Medio;
  monto: number;
  recibido?: number;
  persona: string;
  en: number;
  deshecho?: boolean;
  /** Abono: no cubrió todo lo que faltaba en ese momento. */
  parcial?: boolean;
  /** Qué productos pagó (abono por productos): línea y unidades. */
  lineas?: { linea: string; cantidad: number }[];
  /** Quién del grupo pagó (opcional, escrito al cobrar): para saber quién abonó qué. */
  pagador?: string;
  /** Si se dividió la cuenta: entre cuántas personas (el siguiente que pague ve cuántos faltan). */
  entre?: number;
  /** Pasado a deuda: de quién (id en `Estado.deudas`). */
  deudor?: string;
  /** Desde qué área se cobró (su caja). Sin ella, la barra (docs/14). */
  area?: Area;
  /** Abono hecho en otra cuenta que se juntó con esta (su id). */
  de?: string;
}

export interface Cuenta {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  mesa?: number;
  cancha?: Cancha;
  abiertaEn: number;
  abiertaPor: string;
  ultima: number;
  rondas: Ronda[];
  lineas: Linea[];
  pagos: Pago[];
  comidaCobrada: boolean;
  anulada: boolean;
  /** Quién la anuló, cuándo y por qué (el motivo lo exige el servidor si tenía productos). */
  anulacion?: { por: string; en: number; motivo?: string };
  /** Se anotó algo después de cobrarla (otro celular sin señal). */
  reabierta: boolean;
  /** Se sumó a otra cuenta para cobrarlas juntas: a cuál, quién y cuándo. */
  juntadaA?: { cuenta: string; nombre: string; por: string; en: number };
  /** Cuentas que se sumaron a esta; `pagos`: cuántos pagos tenía justo después (para separar). */
  juntadas?: { cuenta: string; nombre: string; por: string; en: number; pagos: number }[];
}

export interface Estado {
  cuentas: Record<string, Cuenta>;
  /** Productos creados o cambiados desde la app por el administrador. Pisan al catálogo base. */
  productos?: Record<string, Producto>;
  /** Orden de los botones que definió el administrador. Lo que no esté aquí va al final. */
  orden?: string[];
  /** Cierres de cada jornada (AAAA-MM-DD), en el orden en que se hicieron. RF-51. */
  jornadas?: Record<string, CierreJornada[]>;
  /** Quienes deben, con sus cargos y pagos (docs/15). */
  deudas?: Record<string, Deudor>;
}

/** Un cierre del día: el efectivo contado contra el esperado en ese momento. */
export interface CierreJornada {
  id: string;
  por: string;
  en: number;
  contado: number;
  /** Efectivo que debía haber por las ventas de la jornada cuando se cerró. */
  esperado: number;
  /** La caja que se cerró (barra o cocina). Sin ella: todo el negocio (cierres de antes de las áreas). */
  area?: Area;
  notas?: string;
}

/** El producto vigente: lo que el administrador haya definido, o el del catálogo base. */
export function producto(estado: Estado, id: string): Producto | undefined {
  return estado.productos?.[id] ?? PRODUCTOS.get(id);
}

/** Catálogo completo: el base (con sus cambios) y después los creados desde la app. */
export function catalogo(estado: Estado): Producto[] {
  const extra = estado.productos ?? {};
  const base = CATALOGO.map((p) => extra[p.id] ?? p);
  const nuevos = Object.values(extra).filter((p) => !PRODUCTOS.has(p.id));
  const todos = [...base, ...nuevos];
  if (!estado.orden?.length) return todos;
  const pos = new Map(estado.orden.map((id, i) => [id, i]));
  return todos
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (pos.get(a.p.id) ?? 10_000 + a.i) - (pos.get(b.p.id) ?? 10_000 + b.i))
    .map((x) => x.p);
}

/**
 * Desde cuándo rige el precio de cancha. Lo anotado antes se cobró al precio normal y
 * así debe seguir al recalcular el registro (pasó el 2026-11-01: ver docs/04).
 */
export const PRECIO_CANCHA_DESDE = Date.parse("2026-11-01T20:48:00Z");

/**
 * Desde cuándo, al juntar una cuenta que no es cancha con una cancha, sus pedidas llegan
 * como adicionales (una pedida suelta no es un chico). Lo juntado antes queda como quedó:
 * el registro viejo da el mismo estado (regla 0).
 */
export const JUNTAR_ADICIONAL_DESDE = Date.parse("2026-11-08T21:00:00Z");

/** El precio que aplica según el tipo de cuenta: en las canchas, el de cancha si lo tiene. */
export function precioPara(p: Producto, tipo?: TipoCuenta): number | null {
  if (tipo === "cancha" && p.precioCancha && p.precioCancha > 0) return p.precioCancha;
  return p.precio;
}

const CATEGORIAS_VALIDAS: Categoria[] = ["cerveza", "gaseosa", "cigarrillo", "otro", "licor", "comida"];
const COLOR = /^#[0-9a-fA-F]{6}$/;

interface Base {
  id: string;
  /** Quién lo hizo: quien estaba usando el celular al anotar. */
  persona: string;
  en: number;
  seq?: number;
  /**
   * Quién la envió, si no fue la misma persona (otra entró al celular antes de que saliera
   * lo anotado sin señal). Lo escribe solo el servidor; no cambia ninguna regla.
   */
  enviadaPor?: string;
  /**
   * Solo en el celular y en el envío: la sesión firmada de quien anotó, con la que el
   * servidor prueba la autoría. El servidor la quita antes de guardar; no cambia ninguna regla.
   */
  firma?: string;
}

export type Operacion = Base &
  (
    | { t: "abrir"; cuenta: string; nombre: string; tipo: TipoCuenta; mesa?: number; cancha?: Cancha }
    | { t: "renombrar"; cuenta: string; nombre: string }
    | { t: "marcar_ronda"; cuenta: string; ronda: string; adicional: boolean }
    | { t: "anotar"; cuenta: string; ronda: string; area?: Area; adicional?: boolean; detalle?: string; lineas: { id: string; producto: string; cantidad: number; precio?: number; nombre?: string; paquete?: Paquete; comida?: boolean; precioFijado?: number; nota?: string }[] }
    | { t: "despachar"; cuenta: string; lineas?: string[] }
    | { t: "juntar"; cuenta: string; desde: string }
    | { t: "separar"; cuenta: string; desde: string }
    | { t: "anular"; cuenta: string; linea: string }
    | { t: "cobrar"; cuenta: string; pago: string; medio: Medio; recibido?: number; monto?: number; lineas?: { linea: string; cantidad: number }[]; pagador?: string; area?: Area; entre?: number; deudor?: string }
    | { t: "deuda_cargo"; deudor: string; valor: number; concepto: string; comida?: boolean }
    | { t: "deuda_pago"; deudor: string; valor: number; medio: "efectivo" | "nequi" | "breve" }
    | { t: "deuda_anular"; deudor: string; movimiento: string }
    | { t: "deshacer_pago"; cuenta: string; pago: string }
    | { t: "pagador"; cuenta: string; pago: string; pagador: string }
    | { t: "reabrir"; cuenta: string }
    | { t: "comida_cobrada"; cuenta: string; valor: boolean }
    | { t: "anular_cuenta"; cuenta: string; motivo?: string }
    | { t: "producto"; producto: Producto }
    | { t: "orden"; ids: string[] }
    | { t: "cantidad"; cuenta: string; linea: string; cantidad: number }
    | { t: "comida_linea"; cuenta: string; linea: string; valor: boolean }
    | { t: "cerrar_jornada"; fecha: string; contado: number; notas?: string; area?: Area }
  );

export const estadoVacio = (): Estado => ({ cuentas: {}, productos: {} });

export function total(c: Cuenta): number {
  let s = 0;
  for (const l of c.lineas) if (!l.anulada) s += l.precio * l.cantidad;
  return s;
}

export function pagado(c: Cuenta): number {
  let s = 0;
  for (const p of c.pagos) if (!p.deshecho) s += p.monto;
  return s;
}

export const saldo = (c: Cuenta) => total(c) - pagado(c);

/** Unidades ya pagadas de cada línea, por abonos que dijeron qué productos pagaban. */
export function pagadoPorLinea(c: Cuenta): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of c.pagos) {
    if (p.deshecho) continue;
    for (const x of p.lineas ?? []) m.set(x.linea, (m.get(x.linea) ?? 0) + x.cantidad);
  }
  return m;
}

/** Lo que falta pagar de cada línea viva (unidades), para escoger qué paga un abono. */
export function porPagarPorLinea(c: Cuenta): Map<string, number> {
  const pagadas = pagadoPorLinea(c);
  const m = new Map<string, number>();
  for (const l of c.lineas) {
    if (l.anulada) continue;
    const falta = l.cantidad - (pagadas.get(l.id) ?? 0);
    if (falta > 0) m.set(l.id, falta);
  }
  return m;
}

/** Abonos vivos de una cuenta que no la terminaron de pagar (para mostrar «abonado»). */
export const abonos = (c: Cuenta) => c.pagos.filter((p) => !p.deshecho);

export type Situacion = "abierta" | "cobrada" | "comida" | "anulada" | "juntada";

export function situacion(c: Cuenta): Situacion {
  if (c.anulada) return "anulada";
  // Juntada con otra: cerrada mientras no le anoten nada nuevo (otro celular sin señal).
  if (c.juntadaA && total(c) === 0 && !c.pagos.some((p) => !p.deshecho)) return "juntada";
  const vivos = c.pagos.filter((p) => !p.deshecho);
  if (vivos.length > 0 && saldo(c) <= 0) {
    return vivos[vivos.length - 1].medio === "comida" ? "comida" : "cobrada";
  }
  return "abierta";
}

/** Lo que en la cuenta es comida (marcado así en «Otro»). El resto es barra. */
export function totalComida(c: Cuenta): number {
  let s = 0;
  for (const l of c.lineas) if (!l.anulada && l.comida) s += l.precio * l.cantidad;
  return s;
}

export const unidades = (c: Cuenta) =>
  c.lineas.reduce((s, l) => s + (l.anulada ? 0 : l.cantidad), 0);

/** Aplica una operación sobre `estado`, mutándolo. Ignora lo que no tenga sentido. */
/** Efectivo cobrado en una jornada (sin cuentas anuladas ni cobros deshechos). */
/** Efectivo cobrado en la jornada; con `area`, solo el de esa caja (docs/14). */
export function efectivoDeJornada(cuentas: Iterable<Cuenta>, fecha: string, area?: Area): number {
  let s = 0;
  for (const c of cuentas) {
    if (c.anulada) continue;
    for (const p of c.pagos) {
      if (p.deshecho || p.medio !== "efectivo" || jornada(p.en) !== fecha) continue;
      if (area && areaDe(p.area) !== area) continue;
      s += p.monto;
    }
  }
  return s;
}

/**
 * Si alguien con estas áreas puede cambiar o anular un producto ya anotado (docs/14): la
 * barra, todo; quien solo tiene comida, los platos y las bebidas que pidió comida mientras
 * la barra no las despache. Lo demás lo ve pero no lo toca.
 */
export function puedeEditarLinea(areas: readonly Area[], l: Linea): boolean {
  return areas.includes("barra") || !!l.comida || !!l.porDespachar;
}

/** La persona que debe, por su nombre; si no existe, se crea. */
function deudorDe(estado: Estado, nombre: string): Deudor {
  const id = idDeudor(nombre);
  estado.deudas ??= {};
  return (estado.deudas[id] ??= { id, nombre: nombre.trim().slice(0, 40), movimientos: [] });
}

/** Deshacer un pago a deuda de una cuenta anula su cargo en la deuda. */
function anularCargoDeCuenta(estado: Estado, p: Pago, op: { persona: string; en: number }) {
  if (p.medio !== "deuda" || !p.deudor) return;
  const m = estado.deudas?.[p.deudor]?.movimientos.find((x) => x.id === p.id);
  if (m && !m.anulado) m.anulado = { por: op.persona, en: op.en };
}

/** Bebidas pedidas desde comida que la barra no ha despachado, de todas las cuentas vivas. */
export function porDespachar(cuentas: Iterable<Cuenta>): { cuenta: Cuenta; lineas: Linea[] }[] {
  const r: { cuenta: Cuenta; lineas: Linea[] }[] = [];
  for (const c of cuentas) {
    if (c.anulada) continue;
    const lineas = c.lineas.filter((l) => l.porDespachar && !l.anulada);
    if (lineas.length) r.push({ cuenta: c, lineas });
  }
  return r;
}

export function aplicar(estado: Estado, op: Operacion): Estado {
  const c = "cuenta" in op ? estado.cuentas[op.cuenta] : undefined;
  switch (op.t) {
    case "deuda_cargo": {
      // Una deuda anotada a mano (no salió de una cuenta).
      const nombre = typeof op.deudor === "string" ? op.deudor.trim().slice(0, 40) : "";
      const valor = Math.floor(Number(op.valor));
      if (!idDeudor(nombre) || !(valor > 0) || valor > TOPE_VALOR_LIBRE) return estado;
      const d = deudorDe(estado, nombre);
      if (d.movimientos.some((m) => m.id === op.id)) return estado;
      const concepto = typeof op.concepto === "string" ? op.concepto.trim().slice(0, 80) : "";
      d.movimientos.push({ id: op.id, tipo: "cargo", valor, en: op.en, por: op.persona, ...(concepto ? { concepto } : {}), ...(op.comida ? { comida: valor } : {}) });
      return estado;
    }
    case "deuda_pago": {
      // Pagó (todo o un abono). Nunca más de lo que debe.
      const d = estado.deudas?.[op.deudor];
      const debe = d ? saldoDeudor(d) : 0;
      const valor = Math.min(Math.floor(Number(op.valor)), debe);
      if (!d || !(valor > 0) || d.movimientos.some((m) => m.id === op.id)) return estado;
      const medio = op.medio === "nequi" || op.medio === "breve" ? op.medio : "efectivo";
      d.movimientos.push({ id: op.id, tipo: "pago", valor, en: op.en, por: op.persona, medio });
      return estado;
    }
    case "deuda_anular": {
      // Anula un cargo anotado a mano o un pago. Lo que salió de una cuenta se deshace en la cuenta.
      const m = estado.deudas?.[op.deudor]?.movimientos.find((x) => x.id === op.movimiento);
      if (!m || m.anulado || m.cuenta) return estado;
      m.anulado = { por: op.persona, en: op.en };
      return estado;
    }
    case "cerrar_jornada": {
      // Cerrar no bloquea nada: se puede volver a cerrar si después entra un cobro.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(op.fecha)) return estado;
      const contado = Math.floor(Number(op.contado));
      if (!(contado >= 0 && contado <= 1_000_000_000)) return estado;
      estado.jornadas ??= {};
      const cierres = (estado.jornadas[op.fecha] ??= []);
      if (cierres.some((x) => x.id === op.id)) return estado; // reintento
      const notas = typeof op.notas === "string" ? op.notas.trim().slice(0, 200) : "";
      const area = esArea(op.area) ? op.area : undefined;
      cierres.push({ id: op.id, por: op.persona, en: op.en, contado, esperado: efectivoDeJornada(Object.values(estado.cuentas), op.fecha, area), ...(notas ? { notas } : {}), ...(area ? { area } : {}) });
      return estado;
    }
    case "abrir": {
      if (c) return estado; // reintento: ya existe
      estado.cuentas[op.cuenta] = {
        id: op.cuenta,
        nombre: op.nombre.trim().slice(0, 60) || "Cuenta",
        tipo: op.tipo,
        mesa: op.tipo === "mesa" ? op.mesa : undefined,
        cancha: op.tipo === "cancha" ? op.cancha : undefined,
        abiertaEn: op.en,
        abiertaPor: op.persona,
        ultima: op.en,
        rondas: [],
        lineas: [],
        pagos: [],
        comidaCobrada: false,
        anulada: false,
        reabierta: false,
      };
      return estado;
    }
    case "renombrar": {
      if (c) c.nombre = op.nombre.trim().slice(0, 60) || c.nombre;
      return estado;
    }
    case "anotar": {
      if (!c || c.rondas.some((r) => r.id === op.ronda)) return estado;
      const nuevas: Linea[] = [];
      for (const l of op.lineas) {
        const p = producto(estado, l.producto);
        const cantidad = Math.floor(l.cantidad);
        if (!p || !(cantidad > 0) || cantidad > 3000) continue;
        // Precio del catálogo; solo los de valor libre traen el suyo.
        // `precioFijado` lo escribe el servidor al recibir la operación: es el precio con que
        // se cobró, y no cambia aunque después cambie el catálogo.
        const precio = p.libre
          ? Math.floor(l.precio ?? 0)
          : typeof l.precioFijado === "number"
            ? l.precioFijado
            : precioPara(p, op.en >= PRECIO_CANCHA_DESDE ? c.tipo : undefined);
        if (precio == null || !(precio > 0) || precio > TOPE_VALOR_LIBRE) continue;
        const nombre = p.conNombre ? (l.nombre ?? "").trim().slice(0, 40) || p.nombre : p.nombre;
        const pq = l.paquete;
        const paquete = pq && typeof pq.id === "string" && (pq.tipo === "petaco" || pq.tipo === "medio")
          ? { id: pq.id.slice(0, 64), tipo: pq.tipo, mixto: !!pq.mixto }
          : undefined;
        // Comida: lo escrito a mano («Otro») marcado así, o un producto de la categoría comida.
        const comida = (p.conNombre && l.comida === true) || p.categoria === "comida";
        const nota = typeof l.nota === "string" ? l.nota.trim().slice(0, 60) : "";
        // Una bebida (no comida) anotada desde comida queda por despachar en la barra.
        const despachar = op.area === "comida" && !comida;
        nuevas.push({ id: l.id, ronda: op.ronda, producto: p.id, nombre, precio, cantidad, ...(paquete ? { paquete } : {}), ...(comida ? { comida } : {}), ...(nota ? { nota } : {}), ...(despachar ? { porDespachar: true as const } : {}) });
      }
      if (nuevas.length === 0) return estado;
      const estabaCerrada = situacion(c) === "cobrada" || situacion(c) === "comida" || situacion(c) === "juntada";
      const detalle = typeof op.detalle === "string" ? op.detalle.trim().slice(0, 80) : "";
      c.rondas.push({ id: op.ronda, numero: c.rondas.length + 1, persona: op.persona, en: op.en, ...(op.adicional === true ? { adicional: true as const } : {}), ...(detalle ? { detalle } : {}) });
      c.lineas.push(...nuevas);
      c.ultima = op.en;
      if (c.anulada) c.anulada = false; // si alguien anotó, había clientes
      if (estabaCerrada) {
        c.reabierta = true;
        c.comidaCobrada = false;
      }
      return estado;
    }
    case "anular": {
      const l = c?.lineas.find((x) => x.id === op.linea);
      if (l && !l.anulada) l.anulada = { por: op.persona, en: op.en };
      return estado;
    }
    case "cobrar": {
      if (!c || c.pagos.some((p) => p.id === op.pago)) return estado;
      const falta = saldo(c);
      if (falta <= 0) return estado; // otro celular ya la cobró
      if (op.medio === "comida" && c.tipo !== "mesa") return estado;
      // A deuda: hace falta saber de quién.
      const nombreDeudor = op.medio === "deuda" && typeof op.deudor === "string" ? op.deudor.trim().slice(0, 40) : "";
      if (op.medio === "deuda" && !idDeudor(nombreDeudor)) return estado;
      // Abono (docs/04 «Abonos»): por productos (lo que valen las unidades que aún no se
      // han pagado) o por un valor. Sin nada de eso, como siempre: todo lo que falta. Pasar
      // a comida es siempre por todo lo que falta (regla 9). Nunca más que el saldo.
      let monto = falta;
      let cubre: { linea: string; cantidad: number }[] | undefined;
      if (op.medio !== "comida" && Array.isArray(op.lineas) && op.lineas.length) {
        const porPagar = porPagarPorLinea(c);
        cubre = [];
        let valor = 0;
        for (const x of op.lineas) {
          const l = c.lineas.find((y) => y.id === x?.linea);
          const cantidad = Math.min(Math.floor(Number(x?.cantidad)), porPagar.get(x?.linea) ?? 0);
          if (!l || !(cantidad > 0)) continue;
          porPagar.set(l.id, (porPagar.get(l.id) ?? 0) - cantidad);
          cubre.push({ linea: l.id, cantidad });
          valor += l.precio * cantidad;
        }
        if (!cubre.length) return estado;
        monto = Math.min(valor, falta);
      } else if (op.medio !== "comida" && op.monto != null) {
        const m = Math.floor(Number(op.monto));
        if (!(m > 0)) return estado;
        monto = Math.min(m, falta);
      }
      const parcial = monto < falta;
      const pagador = typeof op.pagador === "string" ? op.pagador.trim().slice(0, 40) : "";
      c.pagos.push({
        id: op.pago,
        medio: op.medio,
        monto,
        recibido: op.medio === "efectivo" && op.recibido && op.recibido >= monto ? Math.floor(op.recibido) : undefined,
        persona: op.persona,
        en: op.en,
        ...(parcial ? { parcial } : {}),
        ...(cubre?.length ? { lineas: cubre } : {}),
        ...(pagador ? { pagador } : {}),
        ...(esArea(op.area) ? { area: op.area } : {}),
        ...(Number.isInteger(op.entre) && op.entre! >= 2 && op.entre! <= 100 ? { entre: op.entre } : {}),
        ...(nombreDeudor ? { deudor: idDeudor(nombreDeudor) } : {}),
      });
      if (nombreDeudor) {
        // La deuda: lo pasado y cuánto de eso es comida (por productos, exacto; si no, en proporción).
        const comida = cubre?.length
          ? cubre.reduce((s, x) => { const l = c.lineas.find((y) => y.id === x.linea); return s + (l?.comida ? l.precio * x.cantidad : 0); }, 0)
          : total(c) > 0 ? Math.round((monto * totalComida(c)) / total(c)) : 0;
        deudorDe(estado, nombreDeudor).movimientos.push({
          id: op.pago, tipo: "cargo", valor: monto, en: op.en, por: op.persona,
          cuenta: { id: c.id, nombre: c.nombre }, ...(comida > 0 ? { comida: Math.min(comida, monto) } : {}),
        });
      }
      c.ultima = op.en;
      if (!parcial) c.reabierta = false;
      return estado;
    }
    case "despachar": {
      // La barra entregó bebidas pedidas desde comida: las dichas, o todas las de la cuenta.
      if (!c) return estado;
      const cuales = Array.isArray(op.lineas) && op.lineas.length ? new Set(op.lineas) : null;
      for (const l of c.lineas) {
        if (!l.porDespachar || (cuales && !cuales.has(l.id))) continue;
        delete l.porDespachar;
        l.despachada = { por: op.persona, en: op.en };
      }
      return estado;
    }
    case "marcar_ronda": {
      // Chico o adicional (canchas): solo cambia cómo se llama la pedida, no lo que vale.
      const r = c?.rondas.find((x) => x.id === op.ronda);
      if (!r) return estado;
      if (op.adicional === true) r.adicional = true;
      else delete r.adicional;
      return estado;
    }
    case "juntar": {
      // Suma una cuenta abierta a otra para cobrarlas juntas (docs/04 «Juntar cuentas»):
      // pedidas, productos y abonos pasan a la de destino; la de origen queda sin nada.
      const o = estado.cuentas[op.desde];
      if (!c || !o || o.id === c.id || c.anulada || o.anulada) return estado;
      if (situacion(c) !== "abierta" || situacion(o) !== "abierta" || !o.lineas.length) return estado;
      // Si la de origen ya tenía otras juntadas, todo pasa como suyo: separar después la
      // devuelve entera, y esas juntas internas ya no se separan.
      const comoAdicional = c.tipo === "cancha" && o.tipo !== "cancha" && op.en >= JUNTAR_ADICIONAL_DESDE;
      for (const r of o.rondas) c.rondas.push({ ...r, numero: c.rondas.length + 1, de: { cuenta: o.id, nombre: o.nombre, numero: r.numero }, ...(comoAdicional ? { adicional: true as const } : {}) });
      for (const l of o.lineas) c.lineas.push({ ...l, de: o.id });
      for (const p of o.pagos) c.pagos.push({ ...p, de: o.id });
      delete o.juntadas;
      (c.juntadas ??= []).push({ cuenta: o.id, nombre: o.nombre, por: op.persona, en: op.en, pagos: c.pagos.length });
      c.ultima = op.en;
      o.rondas = []; o.lineas = []; o.pagos = [];
      o.reabierta = false;
      o.juntadaA = { cuenta: c.id, nombre: c.nombre, por: op.persona, en: op.en };
      o.ultima = op.en;
      return estado;
    }
    case "separar": {
      // Deshace «juntar»: lo que vino de `desde` vuelve allá. Solo si después no se cobró nada.
      const o = estado.cuentas[op.desde];
      const j = c?.juntadas?.find((x) => x.cuenta === op.desde);
      if (!c || !o || !j || o.juntadaA?.cuenta !== c.id) return estado;
      if (c.pagos.slice(j.pagos).some((p) => !p.deshecho)) return estado;
      const vino = (x: { de?: string }) => x.de === o.id;
      const rondas = c.rondas.filter((r) => r.de?.cuenta === o.id);
      o.rondas = [...rondas.map(({ de, ...r }) => ({ ...r, numero: de!.numero })), ...o.rondas];
      o.lineas = [...c.lineas.filter(vino).map(({ de: _, ...l }) => l), ...o.lineas];
      o.pagos = [...c.pagos.filter(vino).map(({ de: _, ...p }) => p), ...o.pagos];
      c.rondas = c.rondas.filter((r) => r.de?.cuenta !== o.id).map((r, i) => ({ ...r, numero: i + 1 }));
      c.lineas = c.lineas.filter((l) => !vino(l));
      c.pagos = c.pagos.filter((p) => !vino(p));
      c.juntadas = c.juntadas!.filter((x) => x !== j);
      if (!c.juntadas.length) delete c.juntadas;
      delete o.juntadaA;
      o.ultima = op.en;
      c.ultima = op.en;
      return estado;
    }
    case "pagador": {
      // Quién pagó un abono, puesto o corregido después (solo la etiqueta, no el valor).
      const p = c?.pagos.find((x) => x.id === op.pago);
      if (!p) return estado;
      const nombre = typeof op.pagador === "string" ? op.pagador.trim().slice(0, 40) : "";
      if (nombre) p.pagador = nombre;
      else delete p.pagador;
      return estado;
    }
    case "deshacer_pago": {
      // Deshace un solo abono o cobro (no todos, como «reabrir»).
      const p = c?.pagos.find((x) => x.id === op.pago);
      if (!c || !p || p.deshecho) return estado;
      p.deshecho = true;
      if (p.medio === "comida") c.comidaCobrada = false;
      anularCargoDeCuenta(estado, p, op);
      c.ultima = op.en;
      return estado;
    }
    case "reabrir": {
      if (!c) return estado;
      for (const p of c.pagos) { if (!p.deshecho) anularCargoDeCuenta(estado, p, op); p.deshecho = true; }
      // También deshace una anulación («Deshacer» después de anular la cuenta).
      c.anulada = false;
      delete c.anulacion;
      c.comidaCobrada = false;
      c.ultima = op.en;
      return estado;
    }
    case "comida_cobrada": {
      if (c) c.comidaCobrada = op.valor;
      return estado;
    }
    case "anular_cuenta": {
      if (!c) return estado;
      c.anulada = true;
      const motivo = typeof op.motivo === "string" ? op.motivo.trim().slice(0, 120) : "";
      c.anulacion = { por: op.persona, en: op.en, ...(motivo ? { motivo } : {}) };
      return estado;
    }
    case "orden": {
      if (!Array.isArray(op.ids)) return estado;
      estado.orden = op.ids.filter((x) => typeof x === "string").slice(0, 500);
      return estado;
    }
    case "comida_linea": {
      const l = c?.lineas.find((x) => x.id === op.linea);
      if (!l || !producto(estado, l.producto)?.conNombre) return estado;
      if (op.valor) l.comida = true;
      else delete l.comida;
      return estado;
    }
    case "cantidad": {
      const l = c?.lineas.find((x) => x.id === op.linea);
      const cantidad = Math.floor(op.cantidad);
      if (!c || !l || l.anulada || !(cantidad > 0) || cantidad > 3000 || cantidad === l.cantidad) return estado;
      const estabaCerrada = situacion(c) === "cobrada" || situacion(c) === "comida";
      l.editada = { por: op.persona, en: op.en, antes: l.editada?.antes ?? l.cantidad };
      l.cantidad = cantidad;
      c.ultima = op.en;
      if (estabaCerrada && saldo(c) > 0) {
        c.reabierta = true;
        c.comidaCobrada = false;
      }
      return estado;
    }
    case "producto": {
      const p = op.producto;
      if (!p || typeof p.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(p.id)) return estado;
      const precio = p.precio == null ? null : Math.floor(Number(p.precio));
      if (precio != null && !(precio > 0 && precio <= TOPE_VALOR_LIBRE)) return estado;
      const pc = p.precioCancha == null ? null : Math.floor(Number(p.precioCancha));
      const precioCancha = pc != null && pc > 0 && pc <= TOPE_VALOR_LIBRE ? pc : null;
      const nombre = String(p.nombre ?? "").trim().slice(0, 40);
      if (!nombre) return estado;
      // Mecato y «Otro» conservan su comportamiento aunque no estén en el catálogo base.
      const base = ESPECIALES[p.id] ?? PRODUCTOS.get(p.id);
      estado.productos ??= {};
      estado.productos[p.id] = {
        id: p.id,
        nombre,
        corto: String(p.corto ?? "").trim().slice(0, 16).toUpperCase() || nombre.toUpperCase().slice(0, 16),
        categoria: CATEGORIAS_VALIDAS.includes(p.categoria) ? p.categoria : "otro",
        precio,
        precioCancha,
        // Los especiales del catálogo base (mecato, otro) conservan su comportamiento.
        libre: base?.libre,
        conNombre: base?.conNombre,
        activo: !!p.activo && (precio != null || !!base?.libre),
        ...(Array.isArray(p.notas) && p.notas.length ? { notas: p.notas.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 30)).filter(Boolean).slice(0, 12) } : {}),
        fondo: COLOR.test(p.fondo) ? p.fondo : "#F0E9DE",
        texto: COLOR.test(p.texto) ? p.texto : "#241206",
      };
      return estado;
    }
  }
  return estado;
}

/** Día de trabajo en hora de Colombia, que cambia a las 5:00 a. m. */
export function jornada(en: number): string {
  return new Date(en - 10 * 3600_000).toISOString().slice(0, 10);
}

/** Lo que vale la pena tener en el celular: lo vivo y lo de las últimas 36 horas. */
export function esVigente(c: Cuenta, ahora: number): boolean {
  const s = situacion(c);
  if (s === "abierta" && total(c) > 0) return true;
  if (s === "comida" && !c.comidaCobrada) return true;
  return ahora - c.ultima < 36 * 3600_000;
}

export function recortar(estado: Estado, ahora: number): Estado {
  const cuentas: Record<string, Cuenta> = {};
  for (const c of Object.values(estado.cuentas)) if (esVigente(c, ahora)) cuentas[c.id] = c;
  return { cuentas, productos: estado.productos ?? {}, orden: estado.orden, ...(estado.jornadas ? { jornadas: estado.jornadas } : {}), ...(estado.deudas ? { deudas: estado.deudas } : {}) };
}

/** Validación ligera de forma, para lo que llega por la red. */
export function esOperacion(x: unknown): x is Operacion {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" && o.id.length >= 8 && o.id.length <= 64 &&
    typeof o.t === "string" && typeof o.en === "number" &&
    (o.t === "producto" ? typeof o.producto === "object"
      : o.t === "orden" ? Array.isArray(o.ids)
      : o.t === "cerrar_jornada" ? typeof o.fecha === "string" && typeof o.contado === "number"
      : o.t === "deuda_cargo" || o.t === "deuda_pago" || o.t === "deuda_anular" ? typeof o.deudor === "string" && o.deudor.length <= 64
      : typeof o.cuenta === "string" && o.cuenta.length <= 64)
  );
}
