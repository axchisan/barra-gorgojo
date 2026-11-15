// Reglas de la barra. Función pura compartida por el celular y el servidor:
// el total que se ve en pantalla es el mismo que calcula el servidor.
// Ver docs/04-sincronizacion-y-fuera-de-linea.md.

import { areaDe, esArea, type Area } from "./areas";
import { idDeudor, saldoDeudor, type Deudor } from "./deudas";
import { CATALOGO, ESPECIALES, PRODUCTOS, TOPE_VALOR_LIBRE, type Categoria, type Producto } from "./catalogo";
import { solicitudesVigentes, TOPE_LINEAS, TOPE_UNIDADES, type Solicitud } from "./solicitudes";

export type TipoCuenta = "grupo" | "persona" | "mesa" | "cancha" | "rapida" | "domicilio";
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
  /** Agregada a una pedida ya anotada (edición): quién y cuándo. */
  agregada?: { por: string; en: number };
  /** Cambiada por otro producto (edición): quién, cuándo y la línea que la reemplaza. */
  cambiada?: { por: string; en: number; a: string };
  /** Reemplaza a otra línea de la misma pedida (la que se cambió). */
  reemplaza?: string;
  /** Si vino en un petaco o medio petaco (puro o mixto). Todas las líneas del mismo paquete comparten `id`. */
  paquete?: Paquete;
  /** Nota del producto al anotarlo («solo carne», «más yuca»). */
  nota?: string;
  /** Bebida pedida desde comida que la barra aún no ha despachado (docs/14). */
  porDespachar?: true;
  /** Quién la despachó y cuándo. */
  despachada?: { por: string; en: number };
  /** La barra no la pudo despachar (se acabó, no hay fría): quién, cuándo y por qué. Queda anulada. */
  rechazada?: { por: string; en: number; motivo: string };
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
  /**
   * En las canchas: con qué precio se cobra la pedida (docs/04 «Precio de los adicionales»).
   * Sin él (lo anotado antes del 2026-11-15), el de cancha. Desde entonces el servidor lo
   * escribe siempre: los chicos van a precio de cancha y los adicionales a precio normal,
   * salvo que se escoja otra cosa al anotar o después («precio_ronda»).
   */
  precio?: ModoPrecio;
  /**
   * Apartada para más tarde (2026-11-15, pedido de comida): «apártenme una picada para las
   * 2». `para`: la hora (ms), si la dijeron. Se ve en «⏰ Apartados» hasta que se entregue.
   */
  apartado?: { para?: number };
  /** Un apartado ya entregado: quién y cuándo. */
  entregado?: { por: string; en: number };
}

/** En qué va un domicilio, en orden. */
export const ESTADOS_DOMICILIO = ["recibido", "preparacion", "camino", "entregado"] as const;
export type EstadoDomicilio = (typeof ESTADOS_DOMICILIO)[number];
export const esEstadoDomicilio = (x: unknown): x is EstadoDomicilio => ESTADOS_DOMICILIO.includes(x as EstadoDomicilio);
export const nombreEstadoDomicilio: Record<EstadoDomicilio, string> = { recibido: "Recibido", preparacion: "En preparación", camino: "En camino", entregado: "Entregado" };
/** El estado de un domicilio (sin datos: recibido). */
export const estadoDomicilio = (c: Pick<Cuenta, "domicilio">): EstadoDomicilio => c.domicilio?.estado ?? "recibido";

/** Precio de una pedida de cancha: el de cancha o el normal. */
export type ModoPrecio = "cancha" | "normal";
export const esModoPrecio = (x: unknown): x is ModoPrecio => x === "cancha" || x === "normal";

/** El precio con que se cobra una pedida: en las canchas, el que diga (o el de cancha); fuera de ellas, el normal. */
export function modoPrecio(c: Pick<Cuenta, "tipo">, r: Pick<Ronda, "precio"> | undefined): ModoPrecio {
  if (c.tipo !== "cancha") return "normal";
  return r?.precio ?? "cancha";
}

/** El modo por defecto de una pedida nueva de cancha: los adicionales, a precio normal. */
export const modoPorDefecto = (adicional: boolean): ModoPrecio => (adicional ? "normal" : "cancha");

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
  /** Domicilio: a dónde va (opcional). */
  direccion?: string;
  /**
   * Domicilio (2026-11-15): en qué va y para qué hora es. Sin este campo, un domicilio está
   * «recibido» y sin hora (los abiertos antes no lo tienen: el registro viejo da lo mismo).
   */
  domicilio?: { estado: EstadoDomicilio; entrega?: number; historial: { estado: EstadoDomicilio; por: string; en: number }[] };
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
  /** Pedidos de los clientes por QR (docs/20): pendientes y resueltos de las últimas 36 h. */
  solicitudes?: Record<string, Solicitud>;
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
 * Opciones de un producto (sabores, marcas), en el orden del catálogo. Solo las de un
 * general que existe; una opción de una opción no cuenta (un solo nivel).
 */
export function opcionesDe(estado: Estado, id: string, todas = false): Producto[] {
  return catalogo(estado).filter((p) => p.padre === id && (todas || p.activo));
}

/** Si el producto va en la cuadrícula: los generales, y las opciones cuyo general ya no existe. */
export function enCuadricula(estado: Estado, p: Producto): boolean {
  if (!p.padre) return true;
  const padre = producto(estado, p.padre);
  return !padre || !!padre.padre;
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
    | { t: "abrir"; cuenta: string; nombre: string; tipo: TipoCuenta; mesa?: number; cancha?: Cancha; direccion?: string; entrega?: number }
    | { t: "domicilio"; cuenta: string; estado?: EstadoDomicilio; entrega?: number | null }
    | { t: "apartado_entregado"; cuenta: string; ronda: string; valor: boolean }
    | { t: "solicitud"; solicitud: Omit<Solicitud, "estado" | "resuelta"> }
    | { t: "aceptar_solicitud"; solicitud: string; cuenta: string; aceptadas?: string[]; motivo?: string }
    | { t: "rechazar_solicitud"; solicitud: string; motivo: string }
    | { t: "renombrar"; cuenta: string; nombre: string }
    | { t: "marcar_ronda"; cuenta: string; ronda: string; adicional: boolean; precio?: ModoPrecio; precios?: Record<string, number> }
    | { t: "precio_ronda"; cuenta: string; ronda: string; precio: ModoPrecio; precios?: Record<string, number> }
    | { t: "agregar"; cuenta: string; ronda: string; area?: Area; lineas: LineaAnotada[] }
    | { t: "cambiar_producto"; cuenta: string; linea: string; nueva: LineaAnotada }
    | { t: "anotar"; cuenta: string; ronda: string; area?: Area; adicional?: boolean; precio?: ModoPrecio; detalle?: string; apartado?: { para?: number }; sinDespacho?: boolean; lineas: LineaAnotada[] }
    | { t: "despachar"; cuenta: string; lineas?: string[] }
    | { t: "rechazar_despacho"; cuenta: string; lineas?: string[]; motivo: string }
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

/** Una línea como la manda el celular al anotar, agregar o cambiar producto. */
export type LineaAnotada = { id: string; producto: string; cantidad: number; precio?: number; nombre?: string; paquete?: Paquete; comida?: boolean; precioFijado?: number; nota?: string };

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

/**
 * Una línea nueva tal como queda en la cuenta, desde lo que mandó el celular. La usan
 * anotar, agregar y cambiar producto, para que las tres fijen precio, comida, nota y
 * despacho igual. `null` si no sirve (producto que no existe, cantidad o precio inválidos).
 */
function construirLinea(estado: Estado, c: Cuenta, l: LineaAnotada, ronda: string, area: Area | undefined, en: number, modo: ModoPrecio): Linea | null {
  const p = producto(estado, l.producto);
  const cantidad = Math.floor(l.cantidad);
  if (!p || !(cantidad > 0) || cantidad > 3000) return null;
  // Precio del catálogo; solo los de valor libre traen el suyo.
  // `precioFijado` lo escribe el servidor al recibir la operación: es el precio con que
  // se cobró, y no cambia aunque después cambie el catálogo.
  const precio = p.libre
    ? Math.floor(l.precio ?? 0)
    : typeof l.precioFijado === "number"
      ? l.precioFijado
      : precioPara(p, en >= PRECIO_CANCHA_DESDE && modo === "cancha" ? c.tipo : undefined);
  // Un producto gratis (precio 0: los vasos, 2026-11-15) también se anota; el valor libre, no en 0.
  if (precio == null || !(p.libre ? precio > 0 : precio >= 0) || precio > TOPE_VALOR_LIBRE) return null;
  const nombre = p.conNombre ? (l.nombre ?? "").trim().slice(0, 40) || p.nombre : p.nombre;
  const pq = l.paquete;
  const paquete = pq && typeof pq.id === "string" && (pq.tipo === "petaco" || pq.tipo === "medio")
    ? { id: pq.id.slice(0, 64), tipo: pq.tipo, mixto: !!pq.mixto }
    : undefined;
  // Comida: lo escrito a mano («Otro») marcado así, o un producto de la categoría comida.
  const comida = (p.conNombre && l.comida === true) || p.categoria === "comida";
  // Hasta 120 letras desde el 2026-11-15 (antes 60: lo viejo ya venía recortado, da lo mismo).
  const nota = typeof l.nota === "string" ? l.nota.trim().slice(0, 120) : "";
  // Una bebida (no comida) anotada desde comida queda por despachar en la barra.
  const despachar = area === "comida" && !comida;
  return { id: l.id, ronda, producto: p.id, nombre, precio, cantidad, ...(paquete ? { paquete } : {}), ...(comida ? { comida } : {}), ...(nota ? { nota } : {}), ...(despachar ? { porDespachar: true as const } : {}) };
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

/** Una hora de entrega con sentido: desde una hora antes hasta dos días después. */
function entregaValida(x: unknown, en: number): boolean {
  const v = Number(x);
  return x != null && Number.isFinite(v) && v > en - 3600_000 && v < en + 2 * 24 * 3600_000;
}

/** Domicilios por entregar (no anulados, con algo), por hora de entrega: los sin hora al final. */
export function domiciliosPendientes(cuentas: Iterable<Cuenta>): Cuenta[] {
  return [...cuentas]
    .filter((c) => c.tipo === "domicilio" && !c.anulada && estadoDomicilio(c) !== "entregado" && c.lineas.some((l) => !l.anulada))
    .sort((a, b) => (a.domicilio?.entrega ?? Infinity) - (b.domicilio?.entrega ?? Infinity) || a.abiertaEn - b.abiertaEn);
}

/** Apartados por entregar (de cuentas no anuladas, con algo vivo), por hora: los sin hora al final. */
export function apartadosPendientes(cuentas: Iterable<Cuenta>): { cuenta: Cuenta; ronda: Ronda; lineas: Linea[] }[] {
  const r: { cuenta: Cuenta; ronda: Ronda; lineas: Linea[] }[] = [];
  for (const c of cuentas) {
    if (c.anulada) continue;
    for (const ronda of c.rondas) {
      if (!ronda.apartado || ronda.entregado) continue;
      const lineas = c.lineas.filter((l) => l.ronda === ronda.id && !l.anulada);
      if (lineas.length) r.push({ cuenta: c, ronda, lineas });
    }
  }
  return r.sort((a, b) => (a.ronda.apartado!.para ?? Infinity) - (b.ronda.apartado!.para ?? Infinity) || a.ronda.en - b.ronda.en);
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

/**
 * Los precios que tendrían las líneas de una pedida con este modo: solo las vivas, de
 * productos con precio fijo (no «Otro» ni el mecato) y sin pagar con un abono por
 * productos. Las que no cambian no salen. El servidor guarda el resultado en la operación
 * (`precios`) para que recalcular el registro nunca dependa del catálogo (regla 0).
 */
export function preciosParaModo(estado: Estado, c: Cuenta, rondaId: string, modo: ModoPrecio): Record<string, number> {
  const pagadas = pagadoPorLinea(c);
  const r: Record<string, number> = {};
  for (const l of c.lineas) {
    if (l.ronda !== rondaId || l.anulada || (pagadas.get(l.id) ?? 0) > 0) continue;
    const p = producto(estado, l.producto);
    if (!p || p.libre) continue;
    const precio = precioPara(p, modo === "cancha" ? "cancha" : undefined);
    if (precio != null && precio > 0 && precio <= TOPE_VALOR_LIBRE && precio !== l.precio) r[l.id] = precio;
  }
  return r;
}

/**
 * Pone el modo de precio de una pedida y, si la cuenta sigue abierta, le cambia el precio a
 * sus líneas: el que fijó el servidor (`precios`) o, en el celular antes de confirmarse,
 * el del catálogo. Una cuenta ya cobrada no cambia de valor (se reabre primero).
 */
function cambiarPrecioRonda(estado: Estado, c: Cuenta, r: Ronda, modo: ModoPrecio, precios: Record<string, number> | undefined, en: number) {
  r.precio = modo;
  if (situacion(c) !== "abierta") return;
  const nuevos = precios && typeof precios === "object" ? precios : preciosParaModo(estado, c, r.id, modo);
  for (const l of c.lineas) {
    const v = Math.floor(Number(nuevos[l.id]));
    if (l.ronda !== r.id || l.anulada || !(v > 0) || v > TOPE_VALOR_LIBRE || v === l.precio) continue;
    l.precio = v;
  }
  c.ultima = en;
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
        mesa: op.tipo === "mesa" && Number(op.mesa) > 0 ? Math.floor(Number(op.mesa)) : undefined,
        cancha: op.tipo === "cancha" ? op.cancha : undefined,
        ...(op.tipo === "domicilio" && typeof op.direccion === "string" && op.direccion.trim() ? { direccion: op.direccion.trim().slice(0, 80) } : {}),
        // La hora de entrega, si la dijeron (dentro de los dos días siguientes).
        ...(op.tipo === "domicilio" && entregaValida(op.entrega, op.en) ? { domicilio: { estado: "recibido" as const, entrega: Math.floor(Number(op.entrega)), historial: [] } } : {}),
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
      // Precio de la pedida en las canchas: el que diga la operación (el servidor lo escribe
      // siempre desde el 2026-11-15); sin él, el de cancha, como se anotaba antes.
      const modo = c.tipo === "cancha" && esModoPrecio(op.precio) ? op.precio : undefined;
      const nuevas: Linea[] = [];
      for (const l of op.lineas) {
        const linea = construirLinea(estado, c, l, op.ronda, op.area, op.en, modo ?? "cancha");
        // Desde comida, «sin avisar a la barra» (2026-11-15): la bebida la lleva comida misma.
        // Queda como despachada por quien la anotó: no suena, y sigue siendo «de comida».
        if (linea?.porDespachar && op.sinDespacho === true) { delete linea.porDespachar; linea.despachada = { por: op.persona, en: op.en }; }
        if (linea) nuevas.push(linea);
      }
      if (nuevas.length === 0) return estado;
      const estabaCerrada = situacion(c) === "cobrada" || situacion(c) === "comida" || situacion(c) === "juntada";
      // La nota de la pedida («📝 Nota larga» de comida, detalles del pedido a la barra): hasta 300 letras.
      const detalle = typeof op.detalle === "string" ? op.detalle.trim().slice(0, 300) : "";
      // Apartado para más tarde: con hora si la dijeron (dentro de los dos días siguientes).
      const para = Number(op.apartado?.para);
      const apartado = op.apartado && typeof op.apartado === "object"
        ? { ...(Number.isFinite(para) && para > op.en - 3600_000 && para < op.en + 2 * 24 * 3600_000 ? { para: Math.floor(para) } : {}) }
        : undefined;
      c.rondas.push({ id: op.ronda, numero: c.rondas.length + 1, persona: op.persona, en: op.en, ...(op.adicional === true ? { adicional: true as const } : {}), ...(modo ? { precio: modo } : {}), ...(detalle ? { detalle } : {}), ...(apartado ? { apartado } : {}) });
      c.lineas.push(...nuevas);
      c.ultima = op.en;
      if (c.anulada) c.anulada = false; // si alguien anotó, había clientes
      if (estabaCerrada) {
        c.reabierta = true;
        c.comidaCobrada = false;
      }
      return estado;
    }
    case "agregar": {
      // Edición de una pedida (2026-11-15): productos que se suman a una pedida ya anotada.
      // Quedan marcados como agregados (quién y cuándo); la auditoría lo muestra como edición.
      const ronda = c?.rondas.find((r) => r.id === op.ronda);
      if (!c || c.anulada || !ronda) return estado;
      const nuevas: Linea[] = [];
      for (const l of op.lineas) {
        if (c.lineas.some((x) => x.id === l.id)) continue; // reintento
        // Lo agregado se cobra con el precio de la pedida (cancha o normal).
        const linea = construirLinea(estado, c, l, op.ronda, op.area, op.en, modoPrecio(c, ronda));
        if (linea) nuevas.push({ ...linea, agregada: { por: op.persona, en: op.en } });
      }
      if (!nuevas.length) return estado;
      const estabaCerrada = situacion(c) === "cobrada" || situacion(c) === "comida";
      c.lineas.push(...nuevas);
      c.ultima = op.en;
      if (estabaCerrada) { c.reabierta = true; c.comidaCobrada = false; }
      return estado;
    }
    case "cambiar_producto": {
      // Edición de una pedida: un producto por otro, con la misma cantidad. El anterior queda
      // anulado como «cambiado por …» y el nuevo entra en la misma pedida, justo después.
      const vieja = c?.lineas.find((x) => x.id === op.linea);
      if (!c || !vieja || vieja.anulada || !op.nueva || c.lineas.some((x) => x.id === op.nueva.id)) return estado;
      if ((pagadoPorLinea(c).get(vieja.id) ?? 0) > 0) return estado; // ya pagada con un abono por productos
      const nueva = construirLinea(estado, c, { ...op.nueva, cantidad: vieja.cantidad }, vieja.ronda, vieja.porDespachar ? "comida" : undefined, op.en, modoPrecio(c, c.rondas.find((r) => r.id === vieja.ronda)));
      if (!nueva || nueva.producto === vieja.producto) return estado;
      const estabaCerrada = situacion(c) === "cobrada" || situacion(c) === "comida";
      vieja.anulada = { por: op.persona, en: op.en };
      vieja.cambiada = { por: op.persona, en: op.en, a: nueva.id };
      const reemplazo: Linea = { ...nueva, ...(vieja.paquete ? { paquete: vieja.paquete } : {}), reemplaza: vieja.id };
      if (!vieja.porDespachar) delete reemplazo.porDespachar;
      c.lineas.splice(c.lineas.indexOf(vieja) + 1, 0, reemplazo);
      c.ultima = op.en;
      if (estabaCerrada && saldo(c) > 0) { c.reabierta = true; c.comidaCobrada = false; }
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
    case "solicitud": {
      // Un pedido de un cliente por QR (lo escribe solo el servidor): queda pendiente.
      const s = op.solicitud;
      if (!s || typeof s.id !== "string" || !s.lugar || typeof s.lugar.token !== "string" || !Array.isArray(s.lineas)) return estado;
      if (estado.solicitudes?.[s.id]) return estado; // reintento
      const lineas = s.lineas.slice(0, TOPE_LINEAS).flatMap((l) => {
        const cantidad = Math.floor(Number(l?.cantidad));
        const precio = Math.floor(Number(l?.precio));
        if (typeof l?.id !== "string" || typeof l.producto !== "string" || !(cantidad > 0) || cantidad > TOPE_UNIDADES || !(precio >= 0)) return [];
        const nota = typeof l.nota === "string" ? l.nota.trim().slice(0, 60) : "";
        return [{ id: l.id, producto: l.producto, nombre: String(l.nombre ?? "").slice(0, 40), precio, cantidad, ...(nota ? { nota } : {}) }];
      });
      if (!lineas.length) return estado;
      const cliente = typeof s.cliente === "string" ? s.cliente.trim().slice(0, 40) : "";
      const nota = typeof s.nota === "string" ? s.nota.trim().slice(0, 120) : "";
      estado.solicitudes ??= {};
      estado.solicitudes[s.id] = {
        id: s.id, en: op.en, lugar: { ...s.lugar, nombre: String(s.lugar.nombre ?? "").slice(0, 40) }, lineas, estado: "pendiente",
        ...(cliente ? { cliente } : {}), ...(nota ? { nota } : {}),
      };
      return estado;
    }
    case "aceptar_solicitud": {
      // Aceptada (todo, o lo de `aceptadas`; lo demás no se pudo, con el motivo). La pedida
      // en la cuenta la anota el celular aparte, con las reglas de siempre.
      const s = estado.solicitudes?.[op.solicitud];
      if (!s || s.estado !== "pendiente" || typeof op.cuenta !== "string") return estado;
      const ids = new Set(s.lineas.map((l) => l.id));
      const aceptadas = Array.isArray(op.aceptadas) ? [...new Set(op.aceptadas.filter((x) => ids.has(x)))] : [];
      const parcial = aceptadas.length > 0 && aceptadas.length < s.lineas.length;
      const motivo = parcial && typeof op.motivo === "string" ? op.motivo.trim().slice(0, 80) : "";
      s.estado = "aceptada";
      s.resuelta = { por: op.persona, en: op.en, cuenta: op.cuenta, ...(parcial ? { aceptadas } : {}), ...(motivo ? { motivo } : {}) };
      return estado;
    }
    case "rechazar_solicitud": {
      // «No se puede», con el motivo: el cliente lo ve en la página de su pedido.
      const s = estado.solicitudes?.[op.solicitud];
      const motivo = typeof op.motivo === "string" ? op.motivo.trim().slice(0, 80) : "";
      if (!s || s.estado !== "pendiente" || !motivo) return estado;
      s.estado = "rechazada";
      s.resuelta = { por: op.persona, en: op.en, motivo };
      return estado;
    }
    case "domicilio": {
      // En qué va un domicilio, o su hora de entrega (null la quita).
      if (!c || c.tipo !== "domicilio") return estado;
      const d = (c.domicilio ??= { estado: "recibido", historial: [] });
      if (esEstadoDomicilio(op.estado) && op.estado !== d.estado) {
        d.estado = op.estado;
        d.historial.push({ estado: op.estado, por: op.persona, en: op.en });
      }
      if (op.entrega === null) delete d.entrega;
      else if (entregaValida(op.entrega, op.en)) d.entrega = Math.floor(Number(op.entrega));
      c.ultima = op.en;
      return estado;
    }
    case "apartado_entregado": {
      // Un apartado entregado (o deshacer «Entregado»).
      const r = c?.rondas.find((x) => x.id === op.ronda);
      if (!c || !r?.apartado) return estado;
      if (op.valor) r.entregado = { por: op.persona, en: op.en };
      else delete r.entregado;
      c.ultima = op.en;
      return estado;
    }
    case "rechazar_despacho": {
      // La barra no puede despachar lo que pidió comida (docs/04 «Rechazar un pedido»): esas
      // bebidas quedan anuladas como rechazadas, con el motivo, y comida recibe el aviso.
      const motivo = typeof op.motivo === "string" ? op.motivo.trim().slice(0, 80) : "";
      if (!c || !motivo) return estado;
      const cuales = Array.isArray(op.lineas) && op.lineas.length ? new Set(op.lineas) : null;
      let alguna = false;
      for (const l of c.lineas) {
        if (!l.porDespachar || l.anulada || (cuales && !cuales.has(l.id))) continue;
        delete l.porDespachar;
        l.anulada = { por: op.persona, en: op.en };
        l.rechazada = { por: op.persona, en: op.en, motivo };
        alguna = true;
      }
      if (alguna) c.ultima = op.en;
      return estado;
    }
    case "marcar_ronda": {
      // Chico o adicional (canchas). Antes del 2026-11-15 solo cambiaba el nombre; desde
      // entonces la operación trae el precio que le toca (adicional: normal; chico: cancha)
      // y, si la cuenta está abierta, la pedida se vuelve a cobrar con ese precio.
      const r = c?.rondas.find((x) => x.id === op.ronda);
      if (!c || !r) return estado;
      if (op.adicional === true) r.adicional = true;
      else delete r.adicional;
      if (c.tipo === "cancha" && esModoPrecio(op.precio)) cambiarPrecioRonda(estado, c, r, op.precio, op.precios, op.en);
      return estado;
    }
    case "precio_ronda": {
      // Precio normal o de cancha para una pedida de cancha ya anotada (docs/04).
      const r = c?.rondas.find((x) => x.id === op.ronda);
      if (!c || !r || c.tipo !== "cancha" || !esModoPrecio(op.precio)) return estado;
      cambiarPrecioRonda(estado, c, r, op.precio, op.precios, op.en);
      return estado;
    }
    case "juntar": {
      // Suma una cuenta abierta a otra para cobrarlas juntas (docs/04 «Juntar cuentas»):
      // pedidas, productos y abonos pasan a la de destino; la de origen queda sin nada.
      const o = estado.cuentas[op.desde];
      if (!c || !o || o.id === c.id || c.anulada || o.anulada) return estado;
      // La de origen puede estar ya cobrada (2026-11-15, para el seguimiento): sus pagos viajan
      // con ella, así que lo que falta en la de destino no cambia. Antes el servidor rechazaba
      // ese caso, así que en el registro no hay juntas así: el registro viejo da lo mismo.
      const origenSirve = situacion(o) === "abierta" || situacion(o) === "cobrada";
      if (situacion(c) !== "abierta" || !origenSirve || !o.lineas.length) return estado;
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
      // Precio 0 = gratis (los vasos, 2026-11-15). Antes se ignoraba; no hay ninguno así en el registro.
      if (precio != null && !(precio >= 0 && precio <= TOPE_VALOR_LIBRE)) return estado;
      const pc = p.precioCancha == null ? null : Math.floor(Number(p.precioCancha));
      const precioCancha = pc != null && pc > 0 && pc <= TOPE_VALOR_LIBRE ? pc : null;
      const nombre = String(p.nombre ?? "").trim().slice(0, 40);
      if (!nombre) return estado;
      // Mecato y «Otro» conservan su comportamiento aunque no estén en el catálogo base.
      const base = ESPECIALES[p.id] ?? PRODUCTOS.get(p.id);
      // Opción de otro producto: el id del general (no se valida que exista: el orden de las
      // operaciones no importa). Una opción no puede ser de sí misma.
      const padre = typeof p.padre === "string" && /^[a-z0-9-]{1,40}$/.test(p.padre) && p.padre !== p.id ? p.padre : undefined;
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
        ...(padre ? { padre } : {}),
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
  const solicitudes = solicitudesVigentes(estado.solicitudes, ahora);
  return { cuentas, productos: estado.productos ?? {}, orden: estado.orden, ...(estado.jornadas ? { jornadas: estado.jornadas } : {}), ...(estado.deudas ? { deudas: estado.deudas } : {}), ...(solicitudes ? { solicitudes } : {}) };
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
      : o.t === "solicitud" ? typeof o.solicitud === "object" && o.solicitud !== null
      : o.t === "rechazar_solicitud" ? typeof o.solicitud === "string"
      : typeof o.cuenta === "string" && o.cuenta.length <= 64)
  );
}
