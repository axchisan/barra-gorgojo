// Memoria local, cola de envío y conexión con el servidor.
// Lo visible = lo confirmado por el servidor + lo pendiente de este celular.
// `aplicar` es idempotente, así que reaplicar un pendiente ya confirmado no duplica nada.

import { aplicar, estadoVacio, recortar, type Estado, type Operacion } from "../dominio/estado";

type DistribuirOp<T> = T extends unknown ? Omit<T, "id" | "persona" | "en" | "seq"> : never;
export type NuevaOperacion = DistribuirOp<Operacion>;
export type Conexion = "conectado" | "conectando" | "sin-senal";

const K = { sesion: "bg.sesion", clave: "bg.clave", confirmado: "bg.confirmado", pendientes: "bg.pendientes" };

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

export interface Sesion { token: string; persona: string }

class Sincronizador {
  sesion: Sesion | null = leer(K.sesion, null);
  private confirmado: { estado: Estado; seq: number } = leer(K.confirmado, { estado: estadoVacio(), seq: 0 });
  pendientes: Operacion[] = leer(K.pendientes, []);
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

  get claveGuardada(): string { return leer(K.clave, ""); }

  async entrar(persona: string, clave: string): Promise<string | null> {
    try {
      const r = await fetch("/api/entrar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona, clave }),
      });
      const d = (await r.json()) as { token?: string; persona?: string; error?: string };
      if (!r.ok || !d.token) return d.error ?? "No se pudo entrar.";
      this.sesion = { token: d.token, persona: d.persona! };
      escribir(K.sesion, this.sesion);
      escribir(K.clave, clave); // este celular ya quedó autorizado: cambiar de persona no vuelve a pedirla
      this.cerrarSocket();
      this.conectar();
      this.avisar();
      return null;
    } catch {
      return "Sin señal. Para entrar la primera vez se necesita internet.";
    }
  }

  /** Cambiar de persona. Los pendientes se conservan y salen con la próxima sesión. */
  salir(olvidarClave = false) {
    this.sesion = null;
    escribir(K.sesion, null);
    if (olvidarClave) escribir(K.clave, null);
    this.cerrarSocket();
    this.avisar();
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
      this.ws.send(JSON.stringify({ tipo: "ops", ops: this.pendientes.slice(0, 100) }));
    }
  }

  // ── Recibir ────────────────────────────────────────────────────────

  private quitarPendientes(ids: Iterable<string>) {
    const fuera = new Set(ids);
    const antes = this.pendientes.length;
    this.pendientes = this.pendientes.filter((p) => !fuera.has(p.id));
    return antes !== this.pendientes.length;
  }

  private recibirFoto(estado: Estado, seq: number) {
    this.confirmado = { estado, seq };
    this.guardar();
    this.recalcular();
  }

  private alMensaje(texto: string) {
    this.ultimoMensaje = Date.now();
    if (texto === "pong") return;
    const m = JSON.parse(texto);
    if (m.tipo === "foto") {
      this.recibirFoto(m.estado, m.seq);
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
    } else if (m.tipo === "ok") {
      this.enVuelo = 0;
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
        body: JSON.stringify({ ops: this.pendientes.slice(0, 100) }),
      });
      if (r.status === 401) return this.salir();
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { ok: string[]; estado: Estado; seq: number };
      this.quitarPendientes(d.ok);
      this.recibirFoto(d.estado, d.seq);
      this.ponerConexion("conectado");
    } catch {
      this.ponerConexion("sin-senal");
    }
  }
}

export const sinc = new Sincronizador();
