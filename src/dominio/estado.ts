// Reglas de la barra. Función pura compartida por el celular y el servidor:
// el total que se ve en pantalla es el mismo que calcula el servidor.
// Ver docs/04-sincronizacion-y-fuera-de-linea.md.

import { CATALOGO, PRODUCTOS, TOPE_VALOR_LIBRE, type Categoria, type Producto } from "./catalogo";

export type TipoCuenta = "grupo" | "persona" | "mesa" | "cancha" | "rapida";
export type Medio = "efectivo" | "nequi" | "breve" | "comida";
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
}

export interface Pago {
  id: string;
  medio: Medio;
  monto: number;
  recibido?: number;
  persona: string;
  en: number;
  deshecho?: boolean;
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
  /** Se anotó algo después de cobrarla (otro celular sin señal). */
  reabierta: boolean;
}

export interface Estado {
  cuentas: Record<string, Cuenta>;
  /** Productos creados o cambiados desde la app por el administrador. Pisan al catálogo base. */
  productos?: Record<string, Producto>;
  /** Orden de los botones que definió el administrador. Lo que no esté aquí va al final. */
  orden?: string[];
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

/** El precio que aplica según el tipo de cuenta: en las canchas, el de cancha si lo tiene. */
export function precioPara(p: Producto, tipo?: TipoCuenta): number | null {
  if (tipo === "cancha" && p.precioCancha && p.precioCancha > 0) return p.precioCancha;
  return p.precio;
}

const CATEGORIAS_VALIDAS: Categoria[] = ["cerveza", "gaseosa", "cigarrillo", "otro", "licor"];
const COLOR = /^#[0-9a-fA-F]{6}$/;

interface Base {
  id: string;
  persona: string;
  en: number;
  seq?: number;
}

export type Operacion = Base &
  (
    | { t: "abrir"; cuenta: string; nombre: string; tipo: TipoCuenta; mesa?: number; cancha?: Cancha }
    | { t: "renombrar"; cuenta: string; nombre: string }
    | { t: "anotar"; cuenta: string; ronda: string; lineas: { id: string; producto: string; cantidad: number; precio?: number; nombre?: string; paquete?: Paquete; comida?: boolean; precioFijado?: number }[] }
    | { t: "anular"; cuenta: string; linea: string }
    | { t: "cobrar"; cuenta: string; pago: string; medio: Medio; recibido?: number }
    | { t: "reabrir"; cuenta: string }
    | { t: "comida_cobrada"; cuenta: string; valor: boolean }
    | { t: "anular_cuenta"; cuenta: string }
    | { t: "producto"; producto: Producto }
    | { t: "orden"; ids: string[] }
    | { t: "cantidad"; cuenta: string; linea: string; cantidad: number }
    | { t: "comida_linea"; cuenta: string; linea: string; valor: boolean }
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

export type Situacion = "abierta" | "cobrada" | "comida" | "anulada";

export function situacion(c: Cuenta): Situacion {
  if (c.anulada) return "anulada";
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
export function aplicar(estado: Estado, op: Operacion): Estado {
  const c = "cuenta" in op ? estado.cuentas[op.cuenta] : undefined;
  switch (op.t) {
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
        // Solo lo escrito a mano («Otro») puede ser comida; el catálogo es de la barra.
        const comida = p.conNombre && l.comida === true;
        nuevas.push({ id: l.id, ronda: op.ronda, producto: p.id, nombre, precio, cantidad, ...(paquete ? { paquete } : {}), ...(comida ? { comida } : {}) });
      }
      if (nuevas.length === 0) return estado;
      const estabaCerrada = situacion(c) === "cobrada" || situacion(c) === "comida";
      c.rondas.push({ id: op.ronda, numero: c.rondas.length + 1, persona: op.persona, en: op.en });
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
      const monto = saldo(c);
      if (monto <= 0) return estado; // otro celular ya la cobró
      if (op.medio === "comida" && c.tipo !== "mesa") return estado;
      c.pagos.push({
        id: op.pago,
        medio: op.medio,
        monto,
        recibido: op.medio === "efectivo" && op.recibido && op.recibido >= monto ? Math.floor(op.recibido) : undefined,
        persona: op.persona,
        en: op.en,
      });
      c.ultima = op.en;
      c.reabierta = false;
      return estado;
    }
    case "reabrir": {
      if (!c) return estado;
      for (const p of c.pagos) p.deshecho = true;
      c.comidaCobrada = false;
      c.ultima = op.en;
      return estado;
    }
    case "comida_cobrada": {
      if (c) c.comidaCobrada = op.valor;
      return estado;
    }
    case "anular_cuenta": {
      if (c) c.anulada = true;
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
      const base = PRODUCTOS.get(p.id);
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
  return { cuentas, productos: estado.productos ?? {}, orden: estado.orden };
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
      : typeof o.cuenta === "string" && o.cuenta.length <= 64)
  );
}
