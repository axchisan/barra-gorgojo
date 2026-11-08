// Memoria del celular (E2 de docs/12): IndexedDB con Dexie, compartida por todas las
// pestañas y por la app instalada. Ver docs/04 «Almacenamiento».
//
// Dos tablas: `pendientes` (la cola, en el orden en que se tocó, única por id) y
// `ajustes` (sesión, lo confirmado por el servidor, base, apartados y personas). Cada
// cambio es una transacción.
//
// La versión 0.1 guardaba todo en localStorage. Al abrir, lo que haya ahí se pasa a
// IndexedDB uniendo por id (nada se pierde ni se duplica) y se borra; se hace cada vez
// que aparezca, porque una pestaña con la versión vieja puede seguir escribiendo.
// Si IndexedDB no abre (navegador muy viejo o bloqueado), se sigue con localStorage.

import type { Area } from "../dominio/areas";
import Dexie, { type Table } from "dexie";
import { BASE_ORIGINAL } from "../dominio/base";
import { estadoVacio, type Estado, type Operacion } from "../dominio/estado";

/** `areas`: las de hoy según el servidor; `panel`: el área que se está usando en este celular. */
export interface Sesion { token: string; persona: string; rol?: string; areas?: Area[]; panel?: Area; deudas?: boolean }
/** Una persona como la ve la entrada de un celular vinculado (sin PIN). */
export interface PersonaPublica { id: string; nombre: string; color: string; admin: boolean; tienePin: boolean }
export type Apartado = Operacion & { base: string };
export interface Confirmado { estado: Estado; seq: number }

export interface Ajustes {
  sesion: Sesion | null;
  confirmado: Confirmado;
  base: string;
  apartados: Apartado[];
  personas: PersonaPublica[];
}
export type Guardado = Ajustes & { pendientes: Operacion[] };

/** Un cambio atómico: ajustes nuevos y pendientes que entran o salen. */
export interface Cambio {
  ajustes?: Partial<Ajustes>;
  agregar?: Operacion[];
  quitar?: string[];
  /** Vacía la cola antes de agregar (cambio de base). */
  vaciar?: boolean;
}

export interface Memoria {
  readonly tipo: "indexeddb" | "localstorage";
  cargar(): Promise<Guardado>;
  escribir(c: Cambio): Promise<void>;
}

const porDefecto = (): Ajustes => ({
  sesion: null, confirmado: { estado: estadoVacio(), seq: 0 }, base: BASE_ORIGINAL, apartados: [], personas: [],
});

// ── localStorage (la versión 0.1, y respaldo) ───────────────────────────

/** Las llaves de la versión 0.1. `bg.clave` era la clave del negocio, ya no existe. */
export const LLAVES_VIEJAS = {
  sesion: "bg.sesion", confirmado: "bg.confirmado", pendientes: "bg.pendientes", base: "bg.base",
  apartados: "bg.pendientes-base-anterior", personas: "bg.personas", clave: "bg.clave",
} as const;

function leerLS<T>(k: string): T | undefined {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : undefined;
  } catch {
    return undefined;
  }
}
function escribirLS(k: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch { /* almacenamiento lleno o bloqueado: seguimos en memoria */ }
}

/**
 * Lo que haya en localStorage, o null si no hay nada que traer. `bg.base` sola no cuenta:
 * se deja ahí a propósito (ver `borrarViejo`).
 */
function leerViejo(): (Partial<Ajustes> & { pendientes?: Operacion[] }) | null {
  try {
    const hay = Object.values(LLAVES_VIEJAS).some((k) => k !== LLAVES_VIEJAS.base && localStorage.getItem(k) != null);
    if (!hay) return null;
  } catch {
    return null;
  }
  return {
    sesion: leerLS<Sesion | null>(LLAVES_VIEJAS.sesion),
    confirmado: leerLS<Confirmado>(LLAVES_VIEJAS.confirmado),
    pendientes: leerLS<Operacion[]>(LLAVES_VIEJAS.pendientes),
    base: leerLS<string>(LLAVES_VIEJAS.base),
    apartados: leerLS<Apartado[]>(LLAVES_VIEJAS.apartados),
    personas: leerLS<PersonaPublica[]>(LLAVES_VIEJAS.personas),
  };
}

/**
 * Borra lo ya traído, menos `bg.base`: una pestaña con la versión 0.1 que siga abierta
 * escribe pendientes sin decir su base, y así se sabe de qué base son al traerlos.
 */
function borrarViejo() {
  for (const k of Object.values(LLAVES_VIEJAS)) if (k !== LLAVES_VIEJAS.base) escribirLS(k, null);
}

class MemoriaLocalStorage implements Memoria {
  readonly tipo = "localstorage" as const;
  async cargar(): Promise<Guardado> {
    const v = leerViejo() ?? {};
    const d = porDefecto();
    return {
      sesion: v.sesion ?? d.sesion, confirmado: v.confirmado ?? d.confirmado, base: v.base ?? d.base,
      apartados: v.apartados ?? d.apartados, personas: v.personas ?? d.personas, pendientes: v.pendientes ?? [],
    };
  }
  async escribir(c: Cambio) {
    let pendientes = c.vaciar ? [] : leerLS<Operacion[]>(LLAVES_VIEJAS.pendientes) ?? [];
    if (c.quitar?.length) { const fuera = new Set(c.quitar); pendientes = pendientes.filter((p) => !fuera.has(p.id)); }
    if (c.agregar?.length) { const ya = new Set(pendientes.map((p) => p.id)); pendientes.push(...c.agregar.filter((p) => !ya.has(p.id))); }
    if (c.vaciar || c.quitar?.length || c.agregar?.length) escribirLS(LLAVES_VIEJAS.pendientes, pendientes);
    for (const [k, v] of Object.entries(c.ajustes ?? {})) escribirLS(LLAVES_VIEJAS[k as keyof Ajustes], v);
  }
}

// ── IndexedDB ──────────────────────────────────────────────────────────

type ClaveAjuste = keyof Ajustes;

class BaseLocal extends Dexie {
  pendientes!: Table<{ n?: number; id: string; op: Operacion }, number>;
  ajustes!: Table<{ clave: ClaveAjuste; valor: unknown }, ClaveAjuste>;
  constructor() {
    super("barra-gorgojo");
    this.version(1).stores({ pendientes: "++n, &id", ajustes: "clave" });
  }
}

class MemoriaIndexedDB implements Memoria {
  readonly tipo = "indexeddb" as const;
  constructor(private db: BaseLocal) {}

  async cargar(): Promise<Guardado> {
    await this.traerViejo();
    return this.db.transaction("r", this.db.pendientes, this.db.ajustes, async () => {
      const filas = await this.db.ajustes.toArray();
      const a = { ...porDefecto() } as Record<ClaveAjuste, unknown>;
      for (const f of filas) a[f.clave] = f.valor;
      const pendientes = (await this.db.pendientes.orderBy("n").toArray()).map((f) => f.op);
      return { ...(a as unknown as Ajustes), pendientes };
    });
  }

  async escribir(c: Cambio) {
    await this.db.transaction("rw", this.db.pendientes, this.db.ajustes, async () => {
      if (c.vaciar) await this.db.pendientes.clear();
      if (c.quitar?.length) await this.db.pendientes.where("id").anyOf(c.quitar).delete();
      for (const op of c.agregar ?? []) {
        if (!(await this.db.pendientes.where("id").equals(op.id).count())) await this.db.pendientes.add({ id: op.id, op });
      }
      const ajustes = Object.entries(c.ajustes ?? {}).map(([clave, valor]) => ({ clave: clave as ClaveAjuste, valor }));
      if (ajustes.length) await this.db.ajustes.bulkPut(ajustes);
    });
    if (c.ajustes?.base) escribirLS(LLAVES_VIEJAS.base, c.ajustes.base); // ver `borrarViejo`
  }

  /** Pasa a IndexedDB lo que haya en localStorage (versión 0.1) y lo borra de allá. */
  private async traerViejo() {
    const v = leerViejo();
    if (!v) return;
    let base = "";
    await this.db.transaction("rw", this.db.pendientes, this.db.ajustes, async () => {
      const filas = await this.db.ajustes.toArray();
      const a = new Map(filas.map((f) => [f.clave, f.valor]));
      const ids = new Set((await this.db.pendientes.toArray()).map((f) => f.id));
      const nuevo = filas.length === 0 && ids.size === 0;
      const baseAqui = (a.get("base") as string | undefined) ?? v.base ?? BASE_ORIGINAL;
      const baseVieja = v.base ?? BASE_ORIGINAL;
      const poner = (clave: ClaveAjuste, valor: unknown) => this.db.ajustes.put({ clave, valor });

      if (nuevo || !a.has("base")) await poner("base", baseAqui);
      if (v.sesion && (nuevo || !a.get("sesion"))) await poner("sesion", v.sesion);
      if (v.personas?.length && (nuevo || !(a.get("personas") as unknown[] | undefined)?.length)) await poner("personas", v.personas);
      // Lo confirmado: el más reciente de la misma base.
      const conf = a.get("confirmado") as Confirmado | undefined;
      if (v.confirmado && baseVieja === baseAqui && (!conf || v.confirmado.seq > conf.seq)) await poner("confirmado", v.confirmado);

      // Pendientes: los de la misma base entran a la cola; los de otra base, a apartados.
      let apartados = (a.get("apartados") as Apartado[] | undefined) ?? [];
      const yaApartados = new Set(apartados.map((x) => x.id));
      const masApartados = (v.apartados ?? []).filter((x) => !yaApartados.has(x.id));
      for (const op of v.pendientes ?? []) {
        if (ids.has(op.id)) continue;
        if (baseVieja === baseAqui) { await this.db.pendientes.add({ id: op.id, op }); ids.add(op.id); }
        else if (!yaApartados.has(op.id)) masApartados.push({ ...op, base: baseVieja });
      }
      if (masApartados.length) { apartados = [...apartados, ...masApartados]; await poner("apartados", apartados); }
      base = baseAqui;
    });
    borrarViejo();
    escribirLS(LLAVES_VIEJAS.base, base); // después de confirmar la transacción: si algo falla antes, se reintenta al abrir
  }
}

/** Abre la memoria del celular: IndexedDB si se puede; si no, localStorage. */
export async function abrirMemoria(): Promise<Memoria> {
  try {
    if (typeof indexedDB === "undefined") throw new Error("sin IndexedDB");
    const db = new BaseLocal();
    await db.open();
    const m = new MemoriaIndexedDB(db);
    await m.cargar(); // prueba de lectura (y migración) antes de confiarle la cola
    return m;
  } catch {
    return new MemoriaLocalStorage();
  }
}
