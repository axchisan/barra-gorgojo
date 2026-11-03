// Memoria local, cola de envío y conexión con el servidor.
// Lo visible = lo confirmado por el servidor + lo pendiente de este celular.
// `aplicar` es idempotente, así que reaplicar un pendiente ya confirmado no duplica nada.

import { BASE_ORIGINAL } from "../dominio/base";
import { aplicar, estadoVacio, recortar, type Estado, type Operacion } from "../dominio/estado";

type DistribuirOp<T> = T extends unknown ? Omit<T, "id" | "persona" | "en" | "seq"> : never;
export type NuevaOperacion = DistribuirOp<Operacion>;
export type Conexion = "conectado" | "conectando" | "sin-senal";

const K = {
  sesion: "bg.sesion", clave: "bg.clave", confirmado: "bg.confirmado", pendientes: "bg.pendientes",
  base: "bg.base", apartados: "bg.pendientes-base-anterior", personas: "bg.personas",
};

function leer<T>(k: string, porDefecto: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}
function escribir(k: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch { /* almacenamiento lleno o bloqueado: seguimos en memoria */ }
}

export interface Sesion { token: string; persona: string; rol?: string }
/** Una persona como la ve la entrada de un celular vinculado (sin PIN). */
export interface PersonaPublica { id: string; nombre: string; color: string; admin: boolean; tienePin: boolean }
type Respuesta<T> = T & { error?: string };

async function pedir<T>(ruta: string, init?: RequestInit): Promise<{ status: number; datos: Respuesta<T> }> {
  const r = await fetch(ruta, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...init?.headers } });
  return { status: r.status, datos: (await r.json().catch(() => ({}))) as Respuesta<T> };
}

class Sincronizador {
  sesion: Sesion | null = leer(K.sesion, null);
  private confirmado: { estado: Estado; seq: number } = leer(K.confirmado, { estado: estadoVacio(), seq: 0 });
  pendientes: Operacion[] = leer(K.pendientes, []);
  /**
   * Base de datos a la que pertenece lo confirmado y lo pendiente. Un celular de la
   * versión 0.1 no la guardaba: entonces es la original. Ver src/dominio/base.ts.
   */
  base: string = leer(K.base, BASE_ORIGINAL);
  /** Pendientes de una base anterior: no se envían nunca a la nueva. Se avisa en pantalla. */
  apartados: (Operacion & { base: string })[] = leer(K.apartados, []);
  /** Personas del negocio, guardadas para mostrar la entrada aunque no haya señal. */
  personas: PersonaPublica[] = leer(K.personas, []);
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

  private oyentes = new Set<() => void>();
  private ws: WebSocket | null = null;
  private intentos = 0;
  private ultimoMensaje = 0;
  private enVuelo = 0;
  private temporizadorReconexion: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.confirmado.estado = recortar(this.confirmado.estado, Date.now());
    this.recalcular();
    if (typeof window === "undefined") return;
    window.addEventListener("online", () => this.reconectarYa());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.reconectarYa();
    });
    setInterval(() => this.vigilar(), 5000);
    if (this.sesion) this.conectar();
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

  private guardar() {
    escribir(K.confirmado, this.confirmado);
    escribir(K.pendientes, this.pendientes);
  }

  // ── Sesión ─────────────────────────────────────────────────────────

  get esAdministrador() { return this.sesion?.rol === "admin"; }

  private ponerPersonas(personas: PersonaPublica[]) {
    this.personas = personas;
    escribir(K.personas, personas);
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
      escribir(K.clave, null); // la clave del negocio ya no existe
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
      escribir(K.sesion, this.sesion);
      this.cerrarSocket();
      this.conectar();
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

  /** Cambiar de persona. Los pendientes se conservan y salen con la próxima sesión. */
  salir() {
    this.sesion = null;
    escribir(K.sesion, null);
    this.cerrarSocket();
    this.avisar();
  }

  /** El servidor no aceptó estas operaciones: salen de la cola y se avisa por qué (regla 8). */
  private rechazar(rechazadas: { id: string; motivo: string }[] | undefined) {
    if (!rechazadas?.length) return;
    if (this.quitarPendientes(rechazadas.map((r) => r.id))) {
      this.guardar();
      this.recalcular();
    }
    for (const motivo of new Set(rechazadas.map((r) => r.motivo))) this.alRechazo?.(motivo);
  }

  // ── Escribir ───────────────────────────────────────────────────────

  emitir(nueva: NuevaOperacion): Operacion {
    const op = { ...nueva, id: crypto.randomUUID(), persona: this.sesion?.persona ?? "?", en: Date.now() } as Operacion;
    this.pendientes.push(op);
    this.guardar(); // primero queda guardada; después se muestra y se envía
    this.recalcular();
    this.enviar();
    return op;
  }

  private enviar() {
    if (!this.pendientes.length) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (Date.now() - this.enVuelo < 8000) return;
      this.enVuelo = Date.now();
      this.ws.send(JSON.stringify({ tipo: "ops", base: this.base, ops: this.pendientes.slice(0, 100) }));
    }
  }

  // ── Recibir ────────────────────────────────────────────────────────

  private quitarPendientes(ids: Iterable<string>) {
    const fuera = new Set(ids);
    const antes = this.pendientes.length;
    this.pendientes = this.pendientes.filter((p) => !fuera.has(p.id));
    return antes !== this.pendientes.length;
  }

  /**
   * El servidor está en otra base (se migró, o se volvió atrás): lo confirmado ya no
   * sirve y lo pendiente se aparta, porque aplicarlo en la otra base podría revivir
   * cuentas descartadas.
   */
  private cambiarDeBase(base: string) {
    if (base === this.base) return;
    if (this.pendientes.length) {
      this.apartados = [...this.apartados, ...this.pendientes.map((op) => ({ ...op, base: this.base }))];
      escribir(K.apartados, this.apartados);
      this.pendientes = [];
    }
    this.confirmado = { estado: estadoVacio(), seq: 0 };
    this.base = base;
    escribir(K.base, base);
    this.guardar();
    this.recalcular();
  }

  /** Descarta los apartados, después de que el administrador los descargó y revisó. */
  olvidarApartados() {
    this.apartados = [];
    escribir(K.apartados, null);
    this.avisar();
  }

  private recibirFoto(estado: Estado, seq: number, base?: string) {
    if (base) this.cambiarDeBase(base);
    this.confirmado = { estado, seq };
    this.guardar();
    this.recalcular();
  }

  private alMensaje(texto: string) {
    this.ultimoMensaje = Date.now();
    if (texto === "pong") return;
    const m = JSON.parse(texto);
    if (m.tipo === "foto") {
      this.recibirFoto(m.estado, m.seq, m.base);
      this.enVuelo = 0;
      this.enviar();
    } else if (m.tipo === "op") {
      const op = m.op as Operacion;
      if (op.seq === this.confirmado.seq + 1) {
        aplicar(this.confirmado.estado, op);
        this.confirmado.seq = op.seq;
      } else if ((op.seq ?? 0) > this.confirmado.seq + 1) {
        this.ws?.send(JSON.stringify({ tipo: "hola" })); // se perdió algo: pedir la foto completa
      }
      this.quitarPendientes([op.id]);
      this.guardar();
      this.recalcular();
    } else if (m.tipo === "acceso") {
      // Quitaron este celular o desactivaron a la persona: a la entrada, y se revisa la vinculación.
      this.salir();
      void this.cargarPersonas();
    } else if (m.tipo === "ok") {
      this.enVuelo = 0;
      this.rechazar(m.rechazadas);
      if (this.quitarPendientes(m.ids)) {
        this.guardar();
        this.recalcular();
      }
      this.enviar();
    }
  }

  // ── Conexión ───────────────────────────────────────────────────────

  private ponerConexion(c: Conexion) {
    if (this.conexion !== c) {
      this.conexion = c;
      this.avisar();
    }
  }

  private conectar() {
    if (!this.sesion || this.ws) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/api/ws?t=${encodeURIComponent(this.sesion.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.intentos = 0;
      this.ultimoMensaje = Date.now();
      this.enVuelo = 0;
      this.ponerConexion("conectado");
      ws.send(JSON.stringify({ tipo: "hola" }));
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
    if (!this.sesion) return;
    if (this.ws?.readyState === WebSocket.OPEN) return this.enviar();
    this.intentos = 0;
    this.cerrarSocket();
    this.conectar();
  }

  /** Cada 5 s: latido del WebSocket, y si no hay WebSocket, respaldo por HTTP. */
  private async vigilar() {
    if (!this.sesion) return;
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      if (Date.now() - this.ultimoMensaje > 45_000) return this.reconectarYa(); // conexión zombi
      if (Date.now() - this.ultimoMensaje > 20_000) ws.send("ping");
      return this.enviar();
    }
    if (document.visibilityState !== "visible") return;
    try {
      const r = await fetch("/api/ops", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.sesion.token}` },
        body: JSON.stringify({ base: this.base, ops: this.pendientes.slice(0, 100) }),
      });
      if (r.status === 401) {
        const e = (await r.json().catch(() => ({}))) as { error?: string };
        if (e.error === "dispositivo") this.vinculado = false;
        return this.salir();
      }
      if (!r.ok && r.status !== 409) throw new Error(); // 409: otra base; llega su foto
      const d = (await r.json()) as { ok: string[]; rechazadas?: { id: string; motivo: string }[]; estado: Estado; seq: number; base?: string };
      this.quitarPendientes(d.ok);
      this.rechazar(d.rechazadas);
      this.recibirFoto(d.estado, d.seq, d.base);
      this.ponerConexion("conectado");
    } catch {
      this.ponerConexion("sin-senal");
    }
  }
}

export const sinc = new Sincronizador();
