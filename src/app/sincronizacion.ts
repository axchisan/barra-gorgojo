// Memoria local, cola de envío y conexión con el servidor.
// Lo visible = lo confirmado por el servidor + lo pendiente de este celular.
// `aplicar` es idempotente, así que reaplicar un pendiente ya confirmado no duplica nada.
//
// La memoria vive en IndexedDB (memoria.ts), compartida por todas las pestañas del
// celular. Una sola pestaña tiene la conexión: la que tiene el candado (Web Locks). Las
// demás anotan en la memoria y avisan por un BroadcastChannel; la del candado envía, y
// todas releen la memoria cuando otra la cambia. Ver docs/04 «Varias pestañas».

import { BASE_ORIGINAL } from "../dominio/base";
import { aplicar, estadoVacio, recortar, type Estado, type Operacion } from "../dominio/estado";
import { abrirMemoria, type Ajustes, type Apartado, type Cambio, type Confirmado, type Memoria, type PersonaPublica, type Sesion } from "./memoria";

export type { PersonaPublica, Sesion } from "./memoria";

type DistribuirOp<T> = T extends unknown ? Omit<T, "id" | "persona" | "en" | "seq"> : never;
export type NuevaOperacion = DistribuirOp<Operacion>;
export type Conexion = "conectado" | "conectando" | "sin-senal";

/** Mensajes entre pestañas del mismo celular. */
type Mensaje =
  | { tipo: "cambio" }
  | { tipo: "hola" }
  | { tipo: "conexion"; conexion: Conexion }
  | { tipo: "rechazo"; motivo: string };

/** Cómo quedó lo que tocaron unas operaciones, según el servidor (docs/13, punto 4). */
interface Cambios {
  cuentas?: Estado["cuentas"];
  productos?: Estado["productos"];
  orden?: Estado["orden"];
  jornadas?: Estado["jornadas"];
}

const CANDADO = "barra-gorgojo-conexion";
/** Versión de esta compilación; en pruebas unitarias (sin Vite) no existe. */
const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "desarrollo";
const CANAL = "barra-gorgojo";

type Respuesta<T> = T & { error?: string };

async function pedir<T>(ruta: string, init?: RequestInit): Promise<{ status: number; datos: Respuesta<T> }> {
  const r = await fetch(ruta, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...init?.headers } });
  return { status: r.status, datos: (await r.json().catch(() => ({}))) as Respuesta<T> };
}

class Sincronizador {
  /** Ya se leyó la memoria del celular. Antes de eso la app no muestra nada. */
  listo = false;
  sesion: Sesion | null = null;
  private confirmado: Confirmado = { estado: estadoVacio(), seq: 0 };
  pendientes: Operacion[] = [];
  /**
   * Base de datos a la que pertenece lo confirmado y lo pendiente. Un celular de la
   * versión 0.1 no la guardaba: entonces es la original. Ver src/dominio/base.ts.
   */
  base: string = BASE_ORIGINAL;
  /** Pendientes de una base anterior: no se envían nunca a la nueva. Se avisa en pantalla. */
  apartados: Apartado[] = [];
  /** Personas del negocio, guardadas para mostrar la entrada aunque no haya señal. */
  personas: PersonaPublica[] = [];
  /**
   * Si este celular está vinculado (tiene la cookie del dispositivo, que el código no
   * puede leer): se sabe al preguntarle al servidor por las personas.
   */
  vinculado: boolean | null = null;
  /** Lo avisa la pantalla: el servidor no aceptó algo que se anotó en este celular. */
  alRechazo: ((motivo: string) => void) | null = null;
  conexion: Conexion = "conectando";
  visible: Estado = estadoVacio();
  version = 0;
  /** Esta pestaña tiene la conexión del celular (el candado de Web Locks). */
  lider = false;
  /** Dónde quedó la memoria: «indexeddb», o «localstorage» si IndexedDB no abrió. */
  memoriaTipo: Memoria["tipo"] | null = null;

  private memoria: Memoria | null = null;
  private canal: BroadcastChannel | null = null;
  /** Escrituras y lecturas de la memoria, una tras otra, en el orden en que se pidieron. */
  private cola: Promise<unknown> = Promise.resolve();
  /** Cambios de esta pestaña que aún no están en la memoria: releer no debe deshacerlos. */
  private porGuardar = new Set<string>();
  private porQuitar = new Set<string>();
  private ajustesPorGuardar = new Map<keyof Ajustes, number>();

  private oyentes = new Set<() => void>();
  private ws: WebSocket | null = null;
  private intentos = 0;
  private ultimoMensaje = 0;
  private enVuelo = 0;
  private temporizadorReconexion: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (typeof window === "undefined") { this.listo = true; return; }
    void this.arrancar();
  }

  private async arrancar() {
    this.memoria = await abrirMemoria();
    this.memoriaTipo = this.memoria.tipo;
    this.tomar(await this.memoria.cargar(), true);
    this.listo = true;
    this.recalcular();
    if (typeof BroadcastChannel !== "undefined") {
      this.canal = new BroadcastChannel(CANAL);
      this.canal.onmessage = (e: MessageEvent<Mensaje>) => this.deOtraPestana(e.data);
      this.avisarPestanas({ tipo: "hola" }); // la que tenga la conexión responde cómo está
    }
    window.addEventListener("online", () => this.reconectarYa());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.reconectarYa();
    });
    setInterval(() => this.vigilar(), 5000);
    this.pedirCandado();
  }

  /** Solo una pestaña por celular mantiene la conexión; si se cierra, la toma otra. */
  private pedirCandado() {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    const serLider = () => {
      this.lider = true;
      this.ponerConexion("conectando");
      if (this.sesion) this.conectar();
    };
    if (!locks?.request) return serLider(); // sin Web Locks: cada pestaña con su conexión, como antes
    void locks.request(CANDADO, () => {
      serLider();
      return new Promise<void>(() => {}); // se suelta al cerrar la pestaña
    });
  }

  // ── Memoria ─────────────────────────────────────────────────────────

  /** Toma lo leído de la memoria sin deshacer lo que esta pestaña aún no guardó. */
  private tomar(g: Awaited<ReturnType<Memoria["cargar"]>>, todo: boolean) {
    const sinGuardar = (k: keyof Ajustes) => (this.ajustesPorGuardar.get(k) ?? 0) > 0;
    const sesionAntes = this.sesion?.token;
    const cambioBase = g.base !== this.base;
    if (!sinGuardar("sesion")) this.sesion = g.sesion;
    if (!sinGuardar("base")) this.base = g.base;
    if (!sinGuardar("apartados")) this.apartados = g.apartados;
    if (!sinGuardar("personas")) this.personas = g.personas;
    // Lo confirmado lo escribe solo la pestaña con la conexión: ella no lo relee.
    if ((todo || !this.lider || cambioBase) && !sinGuardar("confirmado")) {
      this.confirmado = { estado: recortar(g.confirmado.estado, Date.now()), seq: g.confirmado.seq };
    }
    const enMemoria = g.pendientes.filter((op) => !this.porQuitar.has(op.id));
    const ids = new Set(enMemoria.map((op) => op.id));
    this.pendientes = [...enMemoria, ...this.pendientes.filter((op) => this.porGuardar.has(op.id) && !ids.has(op.id))];
    return sesionAntes !== this.sesion?.token;
  }

  /** Guarda un cambio en la memoria; después avisa a las otras pestañas. */
  private guardar(c: Cambio): Promise<void> {
    const agregados = (c.agregar ?? []).map((op) => op.id);
    const quitados = c.quitar ?? [];
    const claves = Object.keys(c.ajustes ?? {}) as (keyof Ajustes)[];
    for (const id of agregados) this.porGuardar.add(id);
    for (const id of quitados) this.porQuitar.add(id);
    for (const k of claves) this.ajustesPorGuardar.set(k, (this.ajustesPorGuardar.get(k) ?? 0) + 1);
    const hecho = this.cola.then(async () => {
      try {
        await this.memoria?.escribir(c);
        this.avisarPestanas({ tipo: "cambio" });
      } catch { /* memoria llena o bloqueada: seguimos en memoria de la pestaña */ }
      for (const id of agregados) this.porGuardar.delete(id);
      for (const id of quitados) this.porQuitar.delete(id);
      for (const k of claves) this.ajustesPorGuardar.set(k, (this.ajustesPorGuardar.get(k) ?? 1) - 1);
    });
    this.cola = hecho;
    return hecho;
  }

  private avisarPestanas(m: Mensaje) {
    try { this.canal?.postMessage(m); } catch { /* canal cerrado */ }
  }

  /** Otra pestaña del celular cambió la memoria, la conexión o recibió un rechazo. */
  private deOtraPestana(m: Mensaje) {
    if (m.tipo === "conexion") { if (!this.lider) this.ponerConexion(m.conexion); return; }
    if (m.tipo === "rechazo") { this.alRechazo?.(m.motivo); return; }
    if (m.tipo === "hola") { if (this.lider) this.avisarPestanas({ tipo: "conexion", conexion: this.conexion }); return; }
    this.cola = this.cola.then(async () => {
      if (!this.memoria) return;
      const otraSesion = this.tomar(await this.memoria.cargar(), false);
      this.recalcular();
      if (!this.lider) return;
      if (otraSesion) { this.cerrarSocket(); if (this.sesion) this.conectar(); else this.ponerConexion("sin-senal"); }
      else this.enviar();
    }).catch(() => {});
  }

  suscribir = (fn: () => void) => {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  };
  instantanea = () => this.version;

  private avisar() {
    this.version++;
    for (const fn of this.oyentes) fn();
  }

  private recalcular() {
    const base = structuredClone(this.confirmado.estado);
    for (const op of this.pendientes) aplicar(base, op);
    this.visible = base;
    this.avisar();
  }

  // ── Sesión ─────────────────────────────────────────────────────────

  get esAdministrador() { return this.sesion?.rol === "admin"; }

  private ponerPersonas(personas: PersonaPublica[]) {
    this.personas = personas;
    void this.guardar({ ajustes: { personas } });
    this.vinculado = true;
    this.avisar();
  }

  /** Pregunta quiénes pueden entrar; de paso, si el celular está vinculado. */
  async cargarPersonas(): Promise<void> {
    try {
      const { status, datos } = await pedir<{ personas: PersonaPublica[] }>("/api/personas");
      if (status === 401) { this.vinculado = false; this.avisar(); return; }
      if (datos.personas) this.ponerPersonas(datos.personas);
    } catch { /* sin señal: queda lo guardado */ }
  }

  /** Vincula este celular con el código de 6 dígitos que da el administrador. */
  async vincular(codigo: string, nombre: string): Promise<string | null> {
    try {
      const { datos } = await pedir<{ personas?: PersonaPublica[]; base?: string }>("/api/vincular", { method: "POST", body: JSON.stringify({ codigo, nombre }) });
      if (!datos.personas) return datos.error ?? "No se pudo vincular.";
      if (datos.base) this.cambiarDeBase(datos.base);
      this.ponerPersonas(datos.personas);
      return null;
    } catch {
      return "Sin señal. Para vincular el celular se necesita internet.";
    }
  }

  /**
   * Entra con el PIN. Si la persona todavía no tiene, `pinNuevo` lo crea. Devuelve el
   * error para mostrar, «sin-pin» si hay que crearlo, o null si entró.
   */
  async entrar(persona: string, pin: string, pinNuevo?: string): Promise<string | null> {
    try {
      const { status, datos } = await pedir<{ token?: string; persona?: string; rol?: string; base?: string }>("/api/entrar", {
        method: "POST", body: JSON.stringify({ persona, pin, pinNuevo }),
      });
      if (status === 401 && datos.error === "dispositivo") { this.vinculado = false; this.avisar(); return "Este celular no está vinculado."; }
      if (!datos.token) return datos.error ?? "No se pudo entrar.";
      if (datos.base) this.cambiarDeBase(datos.base);
      this.sesion = { token: datos.token, persona: datos.persona!, rol: datos.rol };
      void this.guardar({ ajustes: { sesion: this.sesion } });
      if (this.lider) { this.cerrarSocket(); this.conectar(); }
      this.avisar();
      return null;
    } catch {
      return "Sin señal. Para entrar se necesita internet.";
    }
  }

  /** Cambia el PIN de quien está usando el celular. */
  async cambiarMiPin(actual: string, nuevo: string): Promise<string | null> {
    if (!this.sesion) return "No hay sesión.";
    try {
      const { datos } = await pedir("/api/mi-pin", { method: "POST", headers: { authorization: `Bearer ${this.sesion.token}` }, body: JSON.stringify({ actual, nuevo }) });
      return datos.error ?? null;
    } catch {
      return "Sin señal. Para cambiar el PIN se necesita internet.";
    }
  }

  /** Para las pantallas del administrador: llamadas a /api/admin/… con la sesión. */
  async admin<T>(ruta: string, cuerpo?: unknown): Promise<Respuesta<T>> {
    if (!this.sesion) return { error: "No hay sesión." } as Respuesta<T>;
    try {
      const { status, datos } = await pedir<T>(`/api/admin/${ruta}`, {
        method: cuerpo === undefined ? "GET" : "POST",
        headers: { authorization: `Bearer ${this.sesion.token}` },
        ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
      });
      if (status === 401) this.salir();
      return datos;
    } catch {
      return { error: "Sin señal." } as Respuesta<T>;
    }
  }

  /** Descarga un archivo de /api/admin/… (por ejemplo, el CSV de un día). */
  async descargarAdmin(ruta: string, nombre: string): Promise<string | null> {
    if (!this.sesion) return "No hay sesión.";
    try {
      const r = await fetch(`/api/admin/${ruta}`, { credentials: "same-origin", headers: { authorization: `Bearer ${this.sesion.token}` } });
      if (!r.ok) return "No se pudo descargar.";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.blob());
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return null;
    } catch {
      return "Sin señal.";
    }
  }

  /** Cambiar de persona. Los pendientes se conservan y salen con la próxima sesión. */
  salir() {
    this.sesion = null;
    void this.guardar({ ajustes: { sesion: null } });
    this.cerrarSocket();
    this.avisar();
  }

  /** El servidor no aceptó estas operaciones: salen de la cola y se avisa por qué (regla 8). */
  private rechazar(rechazadas: { id: string; motivo: string }[] | undefined) {
    if (!rechazadas?.length) return;
    if (this.quitarPendientes(rechazadas.map((r) => r.id))) this.recalcular();
    for (const motivo of new Set(rechazadas.map((r) => r.motivo))) {
      this.alRechazo?.(motivo);
      this.avisarPestanas({ tipo: "rechazo", motivo }); // pudo anotarlo otra pestaña
    }
  }

  // ── Escribir ───────────────────────────────────────────────────────

  emitir(nueva: NuevaOperacion): Operacion {
    // `firma`: la sesión de quien anota, para que el servidor sepa con prueba quién fue aunque
    // la envíe otra persona después (anotada sin señal). Se queda solo en este celular y en
    // el envío; el servidor no la guarda.
    const op = { ...nueva, id: crypto.randomUUID(), persona: this.sesion?.persona ?? "?", en: Date.now(), ...(this.sesion ? { firma: this.sesion.token } : {}) } as Operacion;
    this.pendientes.push(op);
    this.recalcular(); // se ve al instante
    // Se guarda ya; se envía cuando quedó guardada (o lo envía la pestaña con la conexión).
    void this.guardar({ agregar: [op] }).then(() => this.enviar());
    return op;
  }

  private enviar() {
    if (!this.lider || !this.pendientes.length) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (Date.now() - this.enVuelo < 8000) return;
      this.enVuelo = Date.now();
      this.ws.send(JSON.stringify({ tipo: "ops", base: this.base, ops: this.pendientes.slice(0, 100), version: VERSION, pendientes: this.pendientes.length }));
    }
  }

  // ── Recibir ────────────────────────────────────────────────────────

  private quitarPendientes(ids: Iterable<string>) {
    const fuera = new Set(ids);
    const quitados = this.pendientes.filter((p) => fuera.has(p.id)).map((p) => p.id);
    if (!quitados.length) return false;
    this.pendientes = this.pendientes.filter((p) => !fuera.has(p.id));
    void this.guardar({ quitar: quitados });
    return true;
  }

  /**
   * El servidor está en otra base (se migró, o se volvió atrás): lo confirmado ya no
   * sirve y lo pendiente se aparta, porque aplicarlo en la otra base podría revivir
   * cuentas descartadas.
   */
  private cambiarDeBase(base: string) {
    if (base === this.base) return;
    const ajustes: Partial<Ajustes> = { confirmado: { estado: estadoVacio(), seq: 0 }, base };
    if (this.pendientes.length) {
      this.apartados = [...this.apartados, ...this.pendientes.map((op) => ({ ...op, base: this.base }))];
      ajustes.apartados = this.apartados;
      this.pendientes = [];
    }
    this.confirmado = { estado: estadoVacio(), seq: 0 };
    this.base = base;
    void this.guardar({ ajustes, vaciar: true }); // todo junto: no queda una cola a medio apartar
    this.recalcular();
  }

  /** Descarta los apartados, después de que el administrador los descargó y revisó. */
  olvidarApartados() {
    this.apartados = [];
    void this.guardar({ ajustes: { apartados: [] } });
    this.avisar();
  }

  private recibirFoto(estado: Estado, seq: number, base?: string) {
    if (base) this.cambiarDeBase(base);
    this.confirmado = { estado, seq };
    void this.guardar({ ajustes: { confirmado: this.confirmado } });
    this.recalcular();
  }

  /** El saludo al servidor: con lo que ya se tiene, para que mande solo lo nuevo. */
  private hola() {
    return JSON.stringify({ tipo: "hola", version: VERSION, pendientes: this.pendientes.length, ...(this.confirmado.seq > 0 ? { seq: this.confirmado.seq, base: this.base } : {}) });
  }

  /** Toma lo que dice el servidor de lo que cambió: es el total oficial (regla 5). */
  private tomarCambios(c: Cambios | undefined) {
    if (!c) return;
    const e = this.confirmado.estado;
    for (const [id, cuenta] of Object.entries(c.cuentas ?? {})) e.cuentas[id] = cuenta;
    if (c.productos) e.productos = c.productos;
    if (c.orden) e.orden = c.orden;
    if (c.jornadas) e.jornadas = c.jornadas;
  }

  private recibirNovedades(m: { seq: number; cambios?: Cambios }) {
    this.tomarCambios(m.cambios);
    this.confirmado.seq = m.seq;
    void this.guardar({ ajustes: { confirmado: this.confirmado } });
    this.recalcular();
  }

  private alMensaje(texto: string) {
    this.ultimoMensaje = Date.now();
    if (texto === "pong") return;
    const m = JSON.parse(texto);
    if (m.tipo === "foto" || m.tipo === "novedades") {
      if (m.tipo === "foto") this.recibirFoto(m.estado, m.seq, m.base);
      else this.recibirNovedades(m);
      this.enVuelo = 0;
      this.enviar();
    } else if (m.tipo === "op") {
      const op = m.op as Operacion;
      if (op.seq === this.confirmado.seq + 1) {
        // Con `cambios`, lo que dice el servidor; sin ellos (servidor viejo), se aplica aquí.
        if (m.cambios) this.tomarCambios(m.cambios);
        else aplicar(this.confirmado.estado, op);
        this.confirmado.seq = op.seq;
      } else if ((op.seq ?? 0) > this.confirmado.seq + 1) {
        this.ws?.send(this.hola()); // se perdió algo: pedir lo que falta
      }
      this.quitarPendientes([op.id]);
      void this.guardar({ ajustes: { confirmado: this.confirmado } });
      this.recalcular();
    } else if (m.tipo === "acceso") {
      // Quitaron este celular o desactivaron a la persona: a la entrada, y se revisa la vinculación.
      this.salir();
      void this.cargarPersonas();
    } else if (m.tipo === "ok") {
      this.enVuelo = 0;
      this.rechazar(m.rechazadas);
      if (this.quitarPendientes(m.ids)) this.recalcular();
      this.enviar();
    }
  }

  // ── Conexión ───────────────────────────────────────────────────────

  private ponerConexion(c: Conexion) {
    if (this.conexion !== c) {
      this.conexion = c;
      this.avisar();
    }
    if (this.lider) this.avisarPestanas({ tipo: "conexion", conexion: c });
  }

  private conectar() {
    if (!this.lider || !this.sesion || this.ws) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/api/ws?t=${encodeURIComponent(this.sesion.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.intentos = 0;
      this.ultimoMensaje = Date.now();
      this.enVuelo = 0;
      this.ponerConexion("conectado");
      ws.send(this.hola());
    };
    ws.onmessage = (e) => this.alMensaje(String(e.data));
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.ponerConexion("sin-senal");
      const espera = Math.min(30_000, 1000 * 2 ** this.intentos++) + Math.random() * 500;
      clearTimeout(this.temporizadorReconexion);
      this.temporizadorReconexion = setTimeout(() => this.conectar(), espera);
    };
  }

  private cerrarSocket() {
    const ws = this.ws;
    this.ws = null;
    clearTimeout(this.temporizadorReconexion);
    try { ws?.close(); } catch { /* nada */ }
  }

  private reconectarYa() {
    if (!this.lider || !this.sesion) return;
    if (this.ws?.readyState === WebSocket.OPEN) return this.enviar();
    this.intentos = 0;
    this.cerrarSocket();
    this.conectar();
  }

  /** Cada 5 s: latido del WebSocket, y si no hay WebSocket, respaldo por HTTP. */
  private async vigilar() {
    if (!this.lider || !this.sesion) return;
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      if (Date.now() - this.ultimoMensaje > 45_000) return this.reconectarYa(); // conexión zombi
      if (Date.now() - this.ultimoMensaje > 20_000) ws.send("ping");
      return this.enviar();
    }
    // Sin WebSocket, por HTTP: si se ve la app, o si hay algo por enviar (la pestaña con la
    // conexión puede estar escondida detrás de otra).
    if (document.visibilityState !== "visible" && !this.pendientes.length) return;
    try {
      const r = await fetch("/api/ops", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.sesion.token}` },
        body: JSON.stringify({ base: this.base, ops: this.pendientes.slice(0, 100), ...(this.confirmado.seq > 0 ? { seq: this.confirmado.seq } : {}) }),
      });
      if (r.status === 401) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        if (e.error === "dispositivo") this.vinculado = false;
        return this.salir();
      }
      if (!r.ok && r.status !== 409) throw new Error(); // 409: otra base; llega su foto
      const d = (await r.json()) as { ok: string[]; rechazadas?: { id: string; motivo: string }[]; tipo?: string; estado: Estado; seq: number; base?: string; cambios?: Cambios };
      this.quitarPendientes(d.ok);
      this.rechazar(d.rechazadas);
      if (d.tipo === "novedades") this.recibirNovedades(d);
      else this.recibirFoto(d.estado, d.seq, d.base);
      this.ponerConexion("conectado");
    } catch {
      this.ponerConexion("sin-senal");
    }
  }
}

export const sinc = new Sincronizador();
