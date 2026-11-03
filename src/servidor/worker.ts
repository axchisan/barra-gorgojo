// Worker de la barra: archivos de la app, y la API, que atiende el Durable Object.
// Ver docs/03-arquitectura.md (ADR-01, ADR-10) y docs/04-sincronizacion-y-fuera-de-linea.md.

import { DurableObject } from "cloudflare:workers";
import { BASE_ORIGINAL } from "../dominio/base";
import { PERSONAS } from "../dominio/catalogo";
import { aplicar, esOperacion, estadoVacio, recortar, situacion, total, type Estado, type Operacion } from "../dominio/estado";
import { csvJornada, jornadasConMovimiento, resumenJornada } from "../dominio/jornada";
import { Acceso, ADMIN, esPin, firmarSesion, igualesEnTiempoConstante, leerSesion, type Rol } from "./acceso";

interface Env {
  BARRA: DurableObjectNamespace<Barra>;
  ASSETS: Fetcher;
  RESPALDOS: R2Bucket;
  /** Llave de instalación: solo sirve para sacar un código de vinculación desde la terminal. */
  CLAVE: string;
  /** Llave para firmar sesiones. Secreto: `wrangler secret put FIRMA`. */
  FIRMA: string;
  /** Llave con que se cifran los PIN. Secreto: `wrangler secret put PINES`. */
  PINES: string;
  /** Nombre de la base (instancia del Durable Object). Variable de wrangler.jsonc. */
  BASE?: string;
  /** Llave de la importación de la migración. Sin ella, importar está apagado. */
  MIGRACION?: string;
}

const nombreBase = (env: Env) => env.BASE || BASE_ORIGINAL;
const barraDe = (env: Env) => env.BARRA.get(env.BARRA.idFromName(nombreBase(env)));

const DIA = 24 * 3600_000;
/** Ventana en que quien cobró o anuló puede deshacerlo sin ser administrador. */
const VENTANA_DESHACER = 5 * 60_000;
const COOKIE = "bg_disp";

const json = (datos: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(datos), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

const cookieDe = (req: Request) =>
  (req.headers.get("cookie") ?? "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === COOKIE)?.[1] ?? null;

// ── Worker ───────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    return barraDe(env).fetch(req);
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
interface Quien { id: string; nombre: string; rol: Rol; dispositivo: string }
interface Rechazo { id: string; motivo: string }

/** La base a la que el celular dice mandar sus operaciones. Sin decirlo: la original. */
const baseDelEnvio = (b: unknown) => (typeof b === "string" && b ? b : BASE_ORIGINAL);

export class Barra extends DurableObject<Env> {
  private estado: Estado = estadoVacio();
  private seq = 0;
  private acceso: Acceso;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.acceso = new Acceso(ctx.storage.sql, env.PINES ?? "");
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
      // Lo que el servidor no aceptó, con su motivo (regla 8: nada se descarta en silencio).
      sql.exec(`CREATE TABLE IF NOT EXISTS rechazadas (
        id TEXT NOT NULL, persona TEXT NOT NULL, dispositivo TEXT NOT NULL,
        datos TEXT NOT NULL, motivo TEXT NOT NULL, en INTEGER NOT NULL
      )`);
      this.acceso.preparar(PERSONAS);
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

  /** Corta las conexiones de un celular quitado o de una persona desactivada. */
  private cortar(etiqueta: string) {
    // Primero el aviso, para que el celular salga aunque el cierre tarde en llegarle.
    for (const ws of this.ctx.getWebSockets(etiqueta)) {
      try { ws.send(JSON.stringify({ tipo: "acceso" })); ws.close(4001, "acceso"); } catch { /* ya cerrada */ }
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

  /**
   * Lo que el rol de la persona no permite. El servidor lo revisa en cada operación:
   * esconder un botón no es seguridad (docs/03 «Acceso y seguridad»).
   */
  private permiso(op: Operacion, quien: Quien, ahora: number): string | null {
    if (quien.rol === ADMIN) {
      if (op.t === "anular_cuenta") {
        const c = this.estado.cuentas[op.cuenta];
        if (c && total(c) > 0 && !(typeof op.motivo === "string" && op.motivo.trim())) return "Para anular una cuenta con productos escriba el motivo.";
      }
      return null;
    }
    if (op.t === "producto" || op.t === "orden") return "Solo el administrador cambia productos y precios.";
    const c = "cuenta" in op ? this.estado.cuentas[op.cuenta] : undefined;
    if (op.t === "anular_cuenta" && c && total(c) > 0) return "Solo el administrador anula una cuenta con productos.";
    if (op.t === "reabrir" && c) {
      // Quien acaba de cobrar o de anular puede deshacerlo («Deshacer») unos minutos.
      if (c.anulada) {
        const a = c.anulacion;
        if (!(a && a.por === quien.nombre && ahora - a.en < VENTANA_DESHACER)) return "Solo el administrador reabre una cuenta anulada.";
      } else if (situacion(c) === "cobrada" || situacion(c) === "comida") {
        const vivos = c.pagos.filter((p) => !p.deshecho);
        const ultimo = vivos[vivos.length - 1];
        if (!(ultimo && ultimo.persona === quien.nombre && ahora - ultimo.en < VENTANA_DESHACER)) return "Solo el administrador reabre una cuenta cobrada.";
      }
    }
    return null;
  }

  /** Recibe operaciones de un celular. Idempotente por `id`. */
  private recibir(ops: unknown[], quien: Quien): { aceptadas: string[]; rechazadas: Rechazo[] } {
    const aceptadas: string[] = [];
    const rechazadas: Rechazo[] = [];
    const ahora = Date.now();
    for (const crudo of ops.slice(0, 200)) {
      if (!esOperacion(crudo)) continue;
      const ya = this.ctx.storage.sql.exec("SELECT seq FROM operaciones WHERE id = ?", crudo.id).toArray();
      if (ya.length > 0) {
        aceptadas.push(crudo.id);
        continue;
      }
      // Quién la hizo lo dice la sesión, no el celular. La hora se acota.
      const op = { ...crudo, persona: quien.nombre, en: Math.min(ahora, Math.max(ahora - DIA, crudo.en)) } as Operacion;
      delete op.seq;
      const motivo = this.permiso(op, quien, ahora);
      if (motivo) {
        this.ctx.storage.sql.exec("INSERT INTO rechazadas (id, persona, dispositivo, datos, motivo, en) VALUES (?, ?, ?, ?, ?, ?)",
          op.id, quien.nombre, quien.dispositivo, JSON.stringify(crudo), motivo, ahora);
        console.warn(JSON.stringify({ aviso: "operacion-rechazada", id: op.id, t: op.t, persona: quien.nombre, motivo }));
        rechazadas.push({ id: op.id, motivo });
        continue;
      }
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
          op.id, quien.nombre, JSON.stringify(op), ahora,
        )
        .one();
      op.seq = seq;
      this.seq = seq;
      aceptadas.push(op.id);
      this.avisarATodos({ tipo: "op", op });
    }
    return { aceptadas, rechazadas };
  }

  /** Quién hace el pedido: sesión firmada + celular vinculado que coincide + persona activa. */
  private async quien(req: Request, url: URL): Promise<Quien | Response> {
    const disp = await this.acceso.dispositivo(cookieDe(req));
    if (!disp) return json({ error: "dispositivo" }, 401);
    const token = url.searchParams.get("t") ?? req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
    const s = await leerSesion(this.env.FIRMA, token);
    if (!s || s.dispositivo !== disp.id) return json({ error: "sesion" }, 401);
    const p = this.acceso.persona(s.persona);
    if (!p || !p.activa) return json({ error: "sesion" }, 401);
    return { id: p.id, nombre: p.nombre, rol: p.rol, dispositivo: disp.id };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const ruta = url.pathname;
    const cuerpo = async <T>() => (await req.json().catch(() => ({}))) as T;

    // ── Sin sesión ──────────────────────────────────────────────────
    if (ruta === "/api/instalacion/codigo" && req.method === "POST") {
      // Solo desde la terminal, con la llave de instalación: el primer celular del negocio.
      if (!this.env.CLAVE || !igualesEnTiempoConstante(req.headers.get("x-llave") ?? "", this.env.CLAVE)) {
        await new Promise((r) => setTimeout(r, 800));
        return json({ error: "Llave equivocada." }, 403);
      }
      return json(await this.acceso.crearCodigo("instalación"));
    }
    if ((ruta === "/api/instalacion/respaldo" || ruta === "/api/instalacion/foto") && req.method === "GET") {
      // Solo lectura desde la terminal, para comparar antes y después de un despliegue (regla 2).
      if (!this.env.CLAVE || !igualesEnTiempoConstante(req.headers.get("x-llave") ?? "", this.env.CLAVE)) {
        await new Promise((r) => setTimeout(r, 800));
        return json({ error: "Llave equivocada." }, 403);
      }
      if (ruta === "/api/instalacion/foto") return json(this.foto());
      return new Response(this.respaldo().texto, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    }
    if (ruta === "/api/vincular" && req.method === "POST") {
      const { codigo, nombre } = await cuerpo<{ codigo?: string; nombre?: string }>();
      const r = await this.acceso.vincular(String(codigo ?? ""), String(nombre ?? ""));
      if ("error" in r) return json({ error: r.error }, r.status);
      const cookie = `${COOKIE}=${r.token}; Path=/; Max-Age=157680000; HttpOnly; Secure; SameSite=Strict`;
      return json({ ok: true, personas: this.personasPublicas(), base: this.base }, 200, { "set-cookie": cookie });
    }
    if (ruta === "/api/personas" && req.method === "GET") {
      if (!(await this.acceso.dispositivo(cookieDe(req)))) return json({ error: "dispositivo" }, 401);
      return json({ personas: this.personasPublicas() });
    }
    if (ruta === "/api/entrar" && req.method === "POST") return this.entrar(req, await cuerpo());

    // ── Con sesión ──────────────────────────────────────────────────
    const q = await this.quien(req, url);
    if (q instanceof Response) return q;

    if (ruta === "/api/ws") {
      if (req.headers.get("upgrade") !== "websocket") return json({ error: "Se esperaba WebSocket" }, 426);
      const { 0: cliente, 1: servidor } = new WebSocketPair();
      this.ctx.acceptWebSocket(servidor, [q.nombre, `p:${q.id}`, `d:${q.dispositivo}`]);
      return new Response(null, { status: 101, webSocket: cliente });
    }
    if (ruta === "/api/ops" && req.method === "POST") {
      const { ops, base } = await cuerpo<{ ops?: unknown[]; base?: unknown }>();
      const lista = Array.isArray(ops) ? ops : [];
      if (lista.length && this.esDeOtraBase(base, q.nombre, lista.length)) return json({ error: "base", ok: [], rechazadas: [], ...this.foto() }, 409);
      const { aceptadas, rechazadas } = this.recibir(lista, q);
      return json({ ok: aceptadas, rechazadas, ...this.foto() });
    }
    if (ruta === "/api/foto") return json(this.foto());
    if (ruta === "/api/mi-pin" && req.method === "POST") {
      const { actual, nuevo } = await cuerpo<{ actual?: string; nuevo?: string }>();
      if (!esPin(nuevo)) return json({ error: "El PIN nuevo debe tener 4 números." }, 400);
      const r = await this.acceso.revisarPin(q.id, q.dispositivo, String(actual ?? ""));
      if (!r.ok) return json({ error: r.motivo === "bloqueada" ? "Demasiados intentos. Espere 5 minutos." : "El PIN actual no es correcto." }, 403);
      await this.acceso.ponerPin(q.id, nuevo);
      return json({ ok: true });
    }

    // ── Solo el administrador ───────────────────────────────────────
    if (ruta.startsWith("/api/admin/") && q.rol !== ADMIN) return json({ error: "Solo el administrador." }, 403);
    if (ruta === "/api/admin/personas" && req.method === "GET") return json({ personas: await this.acceso.personasConPin() });
    if (ruta === "/api/admin/personas" && req.method === "POST") {
      const b = await cuerpo<{ accion?: string; id?: string; nombre?: string; rol?: string; pin?: string | null; activa?: boolean }>();
      if (b.accion === "crear") {
        const r = this.acceso.crearPersona(String(b.nombre ?? ""), b.rol === ADMIN ? ADMIN : "operador");
        return "error" in r ? json(r, 400) : json({ persona: r });
      }
      const p = b.id ? this.acceso.persona(b.id) : undefined;
      if (!p) return json({ error: "No existe esa persona." }, 404);
      if (b.accion === "pin") {
        if (b.pin !== null && !esPin(b.pin)) return json({ error: "El PIN debe tener 4 números." }, 400);
        await this.acceso.ponerPin(p.id, b.pin ?? null);
        return json({ ok: true });
      }
      if (b.accion === "activa") {
        if (p.id === q.id && !b.activa) return json({ error: "No puede desactivarse a sí mismo." }, 400);
        this.acceso.activar(p.id, !!b.activa);
        if (!b.activa) this.cortar(`p:${p.id}`);
        return json({ ok: true });
      }
      return json({ error: "Acción desconocida." }, 400);
    }
    if (ruta === "/api/admin/codigo" && req.method === "POST") return json(await this.acceso.crearCodigo(q.nombre));
    if (ruta === "/api/admin/dispositivos" && req.method === "GET") return json({ dispositivos: this.acceso.dispositivos(), este: q.dispositivo });
    if (ruta === "/api/admin/dispositivos" && req.method === "POST") {
      const { revocar } = await cuerpo<{ revocar?: string }>();
      if (!revocar) return json({ error: "Falta el celular." }, 400);
      if (revocar === q.dispositivo) return json({ error: "No puede quitar el celular que está usando." }, 400);
      this.acceso.revocar(revocar);
      this.cortar(`d:${revocar}`);
      return json({ ok: true });
    }
    if (ruta === "/api/admin/jornadas" && req.method === "GET") {
      // Días anteriores (RF-52): con el estado completo, que el celular no guarda.
      const cuentas = Object.values(this.estado.cuentas);
      const dias = jornadasConMovimiento(cuentas).slice(0, 120).map((fecha) => {
        const { porProducto: _, ...r } = resumenJornada(cuentas, fecha);
        return { ...r, cierres: this.estado.jornadas?.[fecha] ?? [] };
      });
      return json({ dias });
    }
    if (ruta === "/api/admin/jornadas/csv" && req.method === "GET") {
      const fecha = url.searchParams.get("fecha") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: "Falta la fecha." }, 400);
      // Con BOM: así Excel reconoce las tildes.
      return new Response(`\uFEFF${csvJornada(Object.values(this.estado.cuentas), fecha)}`, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="barra-${fecha}.csv"`, "cache-control": "no-store" },
      });
    }
    if (ruta === "/api/admin/rechazadas" && req.method === "GET") {
      return json({ rechazadas: this.ctx.storage.sql.exec("SELECT id, persona, dispositivo, motivo, en, datos FROM rechazadas ORDER BY en DESC LIMIT 200").toArray() });
    }
    if (ruta === "/api/admin/respaldo" && req.method === "GET") {
      return new Response(this.respaldo().texto, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    }
    if (ruta === "/api/admin/importar" && req.method === "POST") {
      const llave = this.env.MIGRACION;
      if (!llave || !igualesEnTiempoConstante(req.headers.get("x-migracion") ?? "", llave)) return json({ error: "Importar está apagado." }, 403);
      const { operaciones } = await cuerpo<{ operaciones?: unknown }>();
      return this.importar(Array.isArray(operaciones) ? operaciones : []);
    }
    return json({ error: "No existe" }, 404);
  }

  /** Lo que ve un celular vinculado en la entrada (sin PIN). */
  private personasPublicas() {
    return this.acceso.personas().filter((p) => p.activa).map(({ id, nombre, color, rol, tienePin }) => ({ id, nombre, color, admin: rol === ADMIN, tienePin }));
  }

  private async entrar(req: Request, b: { persona?: string; pin?: string; pinNuevo?: string }): Promise<Response> {
    const disp = await this.acceso.dispositivo(cookieDe(req));
    if (!disp) return json({ error: "dispositivo" }, 401);
    const p = b.persona ? this.acceso.persona(b.persona) : undefined;
    if (!p || !p.activa) return json({ error: "Escoja quién es." }, 400);
    if (!p.tienePin) {
      // Primera vez: la persona crea su PIN.
      if (!esPin(b.pinNuevo)) return json({ error: "sin-pin" }, 409);
      await this.acceso.ponerPin(p.id, b.pinNuevo);
    } else {
      const r = await this.acceso.revisarPin(p.id, disp.id, String(b.pin ?? ""));
      if (!r.ok) {
        if (r.motivo === "bloqueada") return json({ error: "Demasiados intentos. Espere 5 minutos.", hasta: r.hasta }, 429);
        if (r.motivo === "sin-pin") return json({ error: "sin-pin" }, 409);
        await new Promise((res) => setTimeout(res, 500));
        return json({ error: `El PIN no es correcto.${r.quedan ? ` Quedan ${r.quedan} ${r.quedan === 1 ? "intento" : "intentos"}.` : ""}` }, 401);
      }
    }
    return json({ token: await firmarSesion(this.env.FIRMA, p.id, disp.id), persona: p.nombre, rol: p.rol, base: this.base });
  }

  async webSocketMessage(ws: WebSocket, mensaje: string | ArrayBuffer) {
    if (typeof mensaje !== "string") return;
    let m: Mensaje;
    try { m = JSON.parse(mensaje); } catch { return; }
    const etiquetas = this.ctx.getTags(ws);
    const personaId = etiquetas.find((t) => t.startsWith("p:"))?.slice(2) ?? "";
    const dispositivo = etiquetas.find((t) => t.startsWith("d:"))?.slice(2) ?? "";
    // Se revisa en cada mensaje: un celular quitado o una persona desactivada no siguen.
    const p = this.acceso.persona(personaId);
    if (!p || !p.activa || !this.acceso.dispositivoActivo(dispositivo)) {
      try { ws.close(4001, "acceso"); } catch { /* ya cerrada */ }
      return;
    }
    const quien: Quien = { id: p.id, nombre: p.nombre, rol: p.rol, dispositivo };
    if (m.tipo === "hola") ws.send(JSON.stringify(this.foto()));
    else if (m.tipo === "ops" && Array.isArray(m.ops)) {
      if (m.ops.length && this.esDeOtraBase(m.base, quien.nombre, m.ops.length)) ws.send(JSON.stringify(this.foto()));
      else {
        const { aceptadas, rechazadas } = this.recibir(m.ops, quien);
        ws.send(JSON.stringify({ tipo: "ok", ids: aceptadas, rechazadas }));
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code, "fin"); } catch { /* ya cerrada */ }
  }
}
