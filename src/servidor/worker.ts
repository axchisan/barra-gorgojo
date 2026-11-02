// Worker de la barra: entrada, API y el Durable Object que ordena todo.
// Ver docs/03-arquitectura.md (ADR-01) y docs/04-sincronizacion-y-fuera-de-linea.md.

import { DurableObject } from "cloudflare:workers";
import { BASE_ORIGINAL } from "../dominio/base";
import { PERSONAS } from "../dominio/catalogo";
import { aplicar, esOperacion, estadoVacio, recortar, type Estado, type Operacion } from "../dominio/estado";

interface Env {
  BARRA: DurableObjectNamespace<Barra>;
  ASSETS: Fetcher;
  RESPALDOS: R2Bucket;
  /** Clave del negocio para entrar. Secreto: `wrangler secret put CLAVE`. */
  CLAVE: string;
  /** Llave para firmar sesiones. Secreto: `wrangler secret put FIRMA`. */
  FIRMA: string;
  /** Nombre de la base (instancia del Durable Object). Variable de wrangler.jsonc. */
  BASE?: string;
  /** Llave de la importación de la migración. Sin ella, importar está apagado. */
  MIGRACION?: string;
}

const ADMINISTRADOR = "Administrador";
const nombreBase = (env: Env) => env.BASE || BASE_ORIGINAL;
const barraDe = (env: Env) => env.BARRA.get(env.BARRA.idFromName(nombreBase(env)));

const DIA = 24 * 3600_000;
const DURACION_SESION = 60 * DIA;

// ── Sesiones firmadas ────────────────────────────────────────────────

const codificar = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(llave: string, texto: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(llave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return codificar(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(texto)));
}

async function firmarSesion(env: Env, persona: string): Promise<string> {
  const cuerpo = `${encodeURIComponent(persona)}.${Date.now() + DURACION_SESION}`;
  return `${cuerpo}.${await hmac(env.FIRMA, cuerpo)}`;
}

async function leerSesion(env: Env, token: string | null): Promise<string | null> {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [persona, vence, firma] = partes;
  if (Number(vence) < Date.now()) return null;
  if ((await hmac(env.FIRMA, `${persona}.${vence}`)) !== firma) return null;
  return decodeURIComponent(persona);
}

function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const json = (datos: unknown, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// ── Worker ───────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);

    if (url.pathname === "/api/entrar" && req.method === "POST") {
      const { persona, clave } = (await req.json().catch(() => ({}))) as { persona?: string; clave?: string };
      if (!persona || !(PERSONAS as readonly string[]).includes(persona)) return json({ error: "Escoja quién es." }, 400);
      if (!clave || !igualesEnTiempoConstante(clave.trim(), env.CLAVE)) {
        await new Promise((r) => setTimeout(r, 800)); // frena el ensayo y error
        return json({ error: "La clave no es correcta." }, 401);
      }
      return json({ token: await firmarSesion(env, persona), persona, base: nombreBase(env) });
    }

    const token = url.searchParams.get("t") ?? req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
    const persona = await leerSesion(env, token);
    if (!persona) return json({ error: "sesion" }, 401);
    if (url.pathname.startsWith("/api/admin/") && persona !== ADMINISTRADOR) return json({ error: "Solo el administrador." }, 403);

    const barra = barraDe(env);
    const interna = new URL(req.url);
    interna.searchParams.delete("t");
    const cabeceras = new Headers(req.headers);
    cabeceras.set("x-persona", encodeURIComponent(persona));
    return barra.fetch(new Request(interna, { method: req.method, headers: cabeceras, body: req.body }));
  },

  /** Todos los días a las 5:30 a. m. de Colombia: copia del registro completo en R2. */
  async scheduled(_evento: ScheduledController, env: Env): Promise<void> {
    const barra = barraDe(env);
    const { texto, operaciones } = await barra.respaldo();
    const comprimido = await new Response(new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    const fecha = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    await env.RESPALDOS.put(`respaldos/${fecha}.json.gz`, comprimido, {
      httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
      customMetadata: { operaciones: String(operaciones), base: nombreBase(env) },
    });
  },
} satisfies ExportedHandler<Env>;

// ── Durable Object ───────────────────────────────────────────────────

type Mensaje = { tipo: "hola" } | { tipo: "ops"; ops: unknown[]; base?: unknown };

/** La base a la que el celular dice mandar sus operaciones. Sin decirlo: la original. */
const baseDelEnvio = (b: unknown) => (typeof b === "string" && b ? b : BASE_ORIGINAL);

export class Barra extends DurableObject<Env> {
  private estado: Estado = estadoVacio();
  private seq = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec(`CREATE TABLE IF NOT EXISTS operaciones (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        persona TEXT NOT NULL,
        datos TEXT NOT NULL,
        recibida_en INTEGER NOT NULL
      )`);
      // El estado es el resultado de aplicar el registro en orden.
      this.rearmar();
    });
  }

  /** Registro completo de operaciones: con él se reconstruye todo. */
  respaldo(): { texto: string; operaciones: number } {
    const filas = this.ctx.storage.sql
      .exec<{ seq: number; datos: string; recibida_en: number }>("SELECT seq, datos, recibida_en FROM operaciones ORDER BY seq")
      .toArray();
    const texto = JSON.stringify({ generado: Date.now(), base: this.base, seq: this.seq, operaciones: filas.map((f) => ({ ...JSON.parse(f.datos), seq: f.seq, recibida_en: f.recibida_en })) });
    return { texto, operaciones: filas.length };
  }

  private get base() {
    return nombreBase(this.env);
  }

  private foto() {
    return { tipo: "foto" as const, base: this.base, estado: recortar(this.estado, Date.now()), seq: this.seq };
  }

  /** Rearma el estado aplicando el registro guardado, en orden. */
  private rearmar() {
    this.estado = estadoVacio();
    this.seq = 0;
    for (const fila of this.ctx.storage.sql.exec<{ seq: number; datos: string }>("SELECT seq, datos FROM operaciones ORDER BY seq")) {
      const op = JSON.parse(fila.datos) as Operacion;
      op.seq = fila.seq;
      aplicar(this.estado, op);
      this.seq = fila.seq;
    }
  }

  private avisarATodos(mensaje: unknown) {
    const texto = JSON.stringify(mensaje);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(texto); } catch { /* conexión muerta: se limpia sola */ }
    }
  }

  /**
   * Operaciones para otra base (un celular que todavía no sabe del cambio): no se aplican.
   * Se registra, y el celular recibe la foto con la base nueva para que las aparte.
   */
  private esDeOtraBase(base: unknown, persona: string, cuantas: number): boolean {
    const suya = baseDelEnvio(base);
    if (suya === this.base) return false;
    console.warn(JSON.stringify({ aviso: "operaciones-de-otra-base", base: suya, actual: this.base, persona, cuantas }));
    return true;
  }

  /** Carga un registro depurado en una base vacía (migración). Ver negocio/docs/10. */
  private importar(operaciones: unknown[]): Response {
    if (this.seq !== 0) return json({ error: "La base no está vacía.", seq: this.seq }, 409);
    if (!operaciones.length || !operaciones.every(esOperacion)) return json({ error: "Hay operaciones sin forma válida." }, 400);
    const ids = new Set(operaciones.map((o) => o.id));
    if (ids.size !== operaciones.length) return json({ error: "Hay operaciones con id repetido." }, 400);
    const ahora = Date.now();
    this.ctx.storage.transactionSync(() => {
      for (const crudo of operaciones) {
        const { seq: _s, recibida_en: _r, ...op } = crudo as Operacion & { recibida_en?: number };
        this.ctx.storage.sql.exec(
          "INSERT INTO operaciones (id, persona, datos, recibida_en) VALUES (?, ?, ?, ?)",
          op.id, op.persona, JSON.stringify(op), ahora,
        );
      }
    });
    this.rearmar();
    this.avisarATodos(this.foto());
    const cuentas = Object.values(this.estado.cuentas);
    return json({ base: this.base, seq: this.seq, cuentas: cuentas.length, total: cuentas.reduce((t, c) => t + c.lineas.reduce((s, l) => s + (l.anulada ? 0 : l.precio * l.cantidad), 0), 0) });
  }

  /** Recibe operaciones de un celular. Idempotente por `id`. */
  private recibir(ops: unknown[], persona: string): string[] {
    const aceptadas: string[] = [];
    const ahora = Date.now();
    for (const crudo of ops.slice(0, 200)) {
      if (!esOperacion(crudo)) continue;
      // El catálogo lo cambia solo el administrador. Se marca como recibida para que salga de la cola.
      if ((crudo.t === "producto" || crudo.t === "orden") && persona !== ADMINISTRADOR) {
        aceptadas.push(crudo.id);
        continue;
      }
      const ya = this.ctx.storage.sql.exec("SELECT seq FROM operaciones WHERE id = ?", crudo.id).toArray();
      if (ya.length > 0) {
        aceptadas.push(crudo.id);
        continue;
      }
      // Quién la hizo lo dice la sesión, no el celular. La hora se acota.
      const op = { ...crudo, persona, en: Math.min(ahora, Math.max(ahora - DIA, crudo.en)) } as Operacion;
      delete op.seq;
      // El precio fijado solo lo pone el servidor: lo que mande el celular se descarta.
      if (op.t === "anotar") op.lineas = op.lineas.map(({ precioFijado: _, ...l }) => l);
      aplicar(this.estado, op);
      // Queda escrito el precio con que se cobró cada línea, para que recalcular el
      // registro nunca cambie lo ya anotado aunque después cambie el catálogo.
      if (op.t === "anotar") {
        const cobradas = new Map((this.estado.cuentas[op.cuenta]?.lineas ?? []).filter((l) => l.ronda === op.ronda).map((l) => [l.id, l.precio]));
        op.lineas = op.lineas.map((l) => (cobradas.has(l.id) ? { ...l, precioFijado: cobradas.get(l.id) } : l));
      }
      const { seq } = this.ctx.storage.sql
        .exec<{ seq: number }>(
          "INSERT INTO operaciones (id, persona, datos, recibida_en) VALUES (?, ?, ?, ?) RETURNING seq",
          op.id, persona, JSON.stringify(op), ahora,
        )
        .one();
      op.seq = seq;
      this.seq = seq;
      aceptadas.push(op.id);
      this.avisarATodos({ tipo: "op", op });
    }
    return aceptadas;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const persona = decodeURIComponent(req.headers.get("x-persona") ?? "");

    if (url.pathname === "/api/ws") {
      if (req.headers.get("upgrade") !== "websocket") return json({ error: "Se esperaba WebSocket" }, 426);
      const { 0: cliente, 1: servidor } = new WebSocketPair();
      this.ctx.acceptWebSocket(servidor, [persona]);
      return new Response(null, { status: 101, webSocket: cliente });
    }
    if (url.pathname === "/api/ops" && req.method === "POST") {
      const { ops, base } = (await req.json().catch(() => ({ ops: [] }))) as { ops: unknown[]; base?: unknown };
      const lista = Array.isArray(ops) ? ops : [];
      if (lista.length && this.esDeOtraBase(base, persona, lista.length)) return json({ error: "base", ok: [], ...this.foto() }, 409);
      const ok = this.recibir(lista, persona);
      return json({ ok, ...this.foto() });
    }
    if (url.pathname === "/api/foto") return json(this.foto());
    // Las rutas /api/admin/ ya llegan filtradas por el Worker: solo el administrador.
    if (url.pathname === "/api/admin/respaldo" && req.method === "GET") {
      return new Response(this.respaldo().texto, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    }
    if (url.pathname === "/api/admin/importar" && req.method === "POST") {
      const llave = this.env.MIGRACION;
      if (!llave || !igualesEnTiempoConstante(req.headers.get("x-migracion") ?? "", llave)) return json({ error: "Importar está apagado." }, 403);
      const { operaciones } = (await req.json().catch(() => ({}))) as { operaciones?: unknown };
      return this.importar(Array.isArray(operaciones) ? operaciones : []);
    }
    return json({ error: "No existe" }, 404);
  }

  async webSocketMessage(ws: WebSocket, mensaje: string | ArrayBuffer) {
    if (typeof mensaje !== "string") return;
    let m: Mensaje;
    try { m = JSON.parse(mensaje); } catch { return; }
    const persona = this.ctx.getTags(ws)[0] ?? "";
    if (m.tipo === "hola") ws.send(JSON.stringify(this.foto()));
    else if (m.tipo === "ops" && Array.isArray(m.ops)) {
      if (m.ops.length && this.esDeOtraBase(m.base, persona, m.ops.length)) ws.send(JSON.stringify(this.foto()));
      else ws.send(JSON.stringify({ tipo: "ok", ids: this.recibir(m.ops, persona) }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code, "fin"); } catch { /* ya cerrada */ }
  }
}
