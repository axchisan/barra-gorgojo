// Worker de la barra: archivos de la app, y la API, que atiende el Durable Object.
// Ver docs/03-arquitectura.md (ADR-01, ADR-10) y docs/04-sincronizacion-y-fuera-de-linea.md.

import { DurableObject } from "cloudflare:workers";
import { BASE_ORIGINAL } from "../dominio/base";
import { PERSONAS } from "../dominio/catalogo";
import { aplicar, esOperacion, esVigente, estadoVacio, jornada, producto as productoDe, recortar, saldo, situacion, total, type Cuenta, type Estado, type Operacion } from "../dominio/estado";
import { horaDe } from "../dominio/formato";
import { esArea, nombreArea, type Area } from "../dominio/areas";
import { csvJornada, jornadasConMovimiento, resumenJornada } from "../dominio/jornada";
import { describirConEnvio, type Evento } from "../dominio/auditoria";
import { validar } from "./esquema";
import { enviarRespaldo, esDiaDeCorreo, type ConfigCorreo } from "./correo";
import { Acceso, ADMIN, esPin, firmarSesion, igualesEnTiempoConstante, leerSesion, type Rol } from "./acceso";

interface Env extends ConfigCorreo {
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
  /**
   * Dirección propia de la app (`https://…`), si tiene. Abrir la página por otra dirección
   * (workers.dev) lleva a esta. La pone `pnpm desplegar` desde negocio/despliegue.json.
   */
  DIRECCION?: string;
  /** Llave de la importación de la migración. Sin ella, importar está apagado. */
  MIGRACION?: string;
}

const nombreBase = (env: Env) => env.BASE || BASE_ORIGINAL;
const barraDe = (env: Env) => env.BARRA.get(env.BARRA.idFromName(nombreBase(env)));

const DIA = 24 * 3600_000;
const comprimir = (texto: string) => new Response(new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
/**
 * Versión de la proyección guardada (E3). Subirla cuando un cambio en `aplicar` haga que
 * lo guardado deje de coincidir con recalcular el registro: al despertar se reconstruye.
 */
const VERSION_PROYECCION = 1;
/** Lo que el celular ve además de lo vivo (ver `esVigente`). */
const VENTANA_VIGENTE = 36 * 3600_000;
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
    // Por la dirección vieja, la página lleva a la propia (las apps instaladas allá se
    // reinstalan en la nueva). La API no se redirige: responde igual en las dos.
    const propia = env.DIRECCION ? new URL(env.DIRECCION) : null;
    if (propia && url.host !== propia.host && !url.pathname.startsWith("/api/") && req.method === "GET" && (req.headers.get("sec-fetch-mode") === "navigate" || req.headers.get("sec-fetch-dest") === "document")) {
      return Response.redirect(new URL(url.pathname + url.search, propia).toString(), 302);
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    return barraDe(env).fetch(req);
  },

  /**
   * Todos los días a las 5:30 a. m. de Colombia: copia del registro completo en R2. Los
   * lunes, además, por correo (fuera de Cloudflare; src/servidor/correo.ts).
   */
  async scheduled(_evento: ScheduledController, env: Env): Promise<void> {
    const barra = barraDe(env);
    const { texto, operaciones } = await barra.respaldo();
    const comprimido = await comprimir(texto);
    const fecha = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    await env.RESPALDOS.put(`respaldos/${fecha}.json.gz`, comprimido, {
      httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
      customMetadata: { operaciones: String(operaciones), base: nombreBase(env) },
    });
    if (esDiaDeCorreo(Date.now())) await enviarRespaldo(env, { fecha, base: nombreBase(env), operaciones, comprimido });
  },
} satisfies ExportedHandler<Env>;

// ── Durable Object ───────────────────────────────────────────────────

type Mensaje = ({ tipo: "hola"; seq?: unknown; base?: unknown } | { tipo: "ops"; ops: unknown[]; base?: unknown }) & { version?: unknown; pendientes?: unknown };
/** Lo que cada celular conectado dice de sí (E4): se guarda con su WebSocket. */
interface DeConexion { version?: string; pendientes?: number; visto?: number }

/**
 * Cómo quedó lo que tocaron unas operaciones, según el servidor (docs/13, punto 4). El
 * celular lo toma tal cual: no necesita tener la cuenta para que le llegue bien, aunque
 * sea una vieja que ya no estaba en su foto.
 */
interface Cambios {
  cuentas?: Record<string, Cuenta>;
  productos?: Estado["productos"];
  orden?: Estado["orden"];
  jornadas?: Estado["jornadas"];
}
/** Hasta cuántas operaciones atrás se mandan novedades al reconectar; más, la foto completa. */
const MAX_NOVEDADES = 500;
interface Quien { id: string; nombre: string; rol: Rol; dispositivo: string; areas: Area[] }
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
      // Proyección (E3, docs/13 punto 3): cada cuenta como quedó, los días en que tuvo
      // movimiento y lo general (catálogo, orden, cierres, seq). Se escribe en la misma
      // transacción que la operación; al despertar se cargan solo las cuentas vigentes en
      // vez de recalcular todo el registro.
      sql.exec(`CREATE TABLE IF NOT EXISTS cuentas (
        id TEXT PRIMARY KEY, datos TEXT NOT NULL, ultima INTEGER NOT NULL, viva INTEGER NOT NULL
      )`);
      sql.exec("CREATE INDEX IF NOT EXISTS cuentas_vigentes ON cuentas (viva, ultima)");
      sql.exec("CREATE TABLE IF NOT EXISTS cuenta_jornadas (fecha TEXT NOT NULL, cuenta TEXT NOT NULL, PRIMARY KEY (fecha, cuenta))");
      sql.exec("CREATE TABLE IF NOT EXISTS proyeccion (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)");
      // Auditoría (E4): las operaciones de un día por su hora, sin recorrer el registro.
      sql.exec("CREATE INDEX IF NOT EXISTS operaciones_en ON operaciones (json_extract(datos, '$.en'))");
      this.acceso.preparar(PERSONAS);
      this.cargar();
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
    this.podar();
    return { tipo: "foto" as const, base: this.base, estado: recortar(this.estado, Date.now()), seq: this.seq };
  }

  // ── Proyección (E3) ──────────────────────────────────────────────────

  /**
   * Al despertar: lo general y las cuentas vigentes, desde la proyección. Si la proyección
   * no corresponde al registro (otra versión, o un `seq` distinto), se reconstruye.
   */
  private cargar() {
    const sql = this.ctx.storage.sql;
    const meta = new Map(sql.exec<{ clave: string; valor: string }>("SELECT clave, valor FROM proyeccion").toArray().map((f) => [f.clave, f.valor]));
    const ultimo = sql.exec<{ s: number }>("SELECT COALESCE(MAX(seq), 0) AS s FROM operaciones").one().s;
    if (Number(meta.get("version")) !== VERSION_PROYECCION || Number(meta.get("seq")) !== ultimo) return this.reconstruir();
    const estado = estadoVacio();
    estado.productos = JSON.parse(meta.get("productos") ?? "{}");
    if (meta.has("orden")) estado.orden = JSON.parse(meta.get("orden")!);
    if (meta.has("jornadas")) estado.jornadas = JSON.parse(meta.get("jornadas")!);
    for (const f of sql.exec<{ datos: string }>("SELECT datos FROM cuentas WHERE viva = 1 OR ultima >= ?", Date.now() - VENTANA_VIGENTE)) {
      const c = JSON.parse(f.datos) as Cuenta;
      estado.cuentas[c.id] = c;
    }
    this.estado = estado;
    this.seq = ultimo;
  }

  /** Recalcula todo el registro y vuelve a escribir la proyección. Una sola vez, no en cada despertar. */
  private reconstruir() {
    this.rearmar();
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      sql.exec("DELETE FROM cuentas");
      sql.exec("DELETE FROM cuenta_jornadas");
      sql.exec("DELETE FROM proyeccion");
      for (const c of Object.values(this.estado.cuentas)) this.guardarCuenta(c);
      this.guardarGeneral(["productos", "orden", "jornadas"]);
    });
    console.log(JSON.stringify({ aviso: "proyeccion-reconstruida", seq: this.seq, cuentas: Object.keys(this.estado.cuentas).length }));
  }

  /** Días en que una cuenta tuvo algo: abrirla, pedidas y cobros. */
  private static diasDe(c: Cuenta): Set<string> {
    const dias = new Set([jornada(c.abiertaEn)]);
    for (const r of c.rondas) dias.add(jornada(r.en));
    for (const p of c.pagos) dias.add(jornada(p.en));
    return dias;
  }

  private guardarCuenta(c: Cuenta) {
    const sql = this.ctx.storage.sql;
    // «Viva»: abierta con valor, o pasada a comida sin cobrar (lo que no se recorta por tiempo).
    const viva = esVigente(c, Number.MAX_SAFE_INTEGER) ? 1 : 0;
    sql.exec(
      "INSERT INTO cuentas (id, datos, ultima, viva) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET datos = excluded.datos, ultima = excluded.ultima, viva = excluded.viva",
      c.id, JSON.stringify(c), c.ultima, viva,
    );
    for (const fecha of Barra.diasDe(c)) sql.exec("INSERT OR IGNORE INTO cuenta_jornadas (fecha, cuenta) VALUES (?, ?)", fecha, c.id);
  }

  /** Lo general de la proyección: siempre la versión y el seq; lo demás, lo que cambió. */
  private guardarGeneral(claves: ("productos" | "orden" | "jornadas")[] = []) {
    const sql = this.ctx.storage.sql;
    const poner = (clave: string, valor: string) =>
      sql.exec("INSERT INTO proyeccion (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor", clave, valor);
    poner("version", String(VERSION_PROYECCION));
    poner("seq", String(this.seq));
    for (const k of claves) {
      const v = this.estado[k];
      if (v === undefined) sql.exec("DELETE FROM proyeccion WHERE clave = ?", k);
      else poner(k, JSON.stringify(v));
    }
  }

  /** Trae a memoria una cuenta que ya no estaba (vieja, fuera de la ventana). */
  private traerCuenta(id: string) {
    if (this.estado.cuentas[id]) return;
    const f = this.ctx.storage.sql.exec<{ datos: string }>("SELECT datos FROM cuentas WHERE id = ?", id).toArray()[0];
    if (f) this.estado.cuentas[id] = JSON.parse(f.datos) as Cuenta;
  }

  /**
   * Las cuentas con movimiento en un día, como están ahora (de memoria si están, si no de
   * la proyección), en orden de apertura: el mismo orden que tenían en el estado completo.
   */
  private cuentasDe(fecha: string): Cuenta[] {
    return this.ctx.storage.sql
      .exec<{ id: string; datos: string }>("SELECT c.id, c.datos FROM cuenta_jornadas j JOIN cuentas c ON c.id = j.cuenta WHERE j.fecha = ?", fecha)
      .toArray()
      .map((f) => this.estado.cuentas[f.id] ?? (JSON.parse(f.datos) as Cuenta))
      .sort((a, b) => a.abiertaEn - b.abiertaEn || (a.id < b.id ? -1 : 1));
  }

  /** Lo que una operación necesita en memoria para aplicarse igual que con el registro completo. */
  private traerPara(op: Operacion) {
    if ("cuenta" in op) this.traerCuenta(op.cuenta);
    if (op.t === "juntar" || op.t === "separar") this.traerCuenta(op.desde);
    // El efectivo esperado de un cierre suma todas las cuentas de ese día.
    if (op.t === "cerrar_jornada" && /^\d{4}-\d{2}-\d{2}$/.test(op.fecha)) {
      for (const c of this.cuentasDe(op.fecha)) this.estado.cuentas[c.id] ??= c;
    }
  }

  /**
   * Dos celulares cobraron la misma cuenta sin verse (docs/04, tabla de conflictos): el
   * segundo no cobra nada y se le dice quién la cobró, para devolver la plata si la
   * recibieron los dos. Un reintento del mismo cobro no es esto (se confirma antes).
   */
  private yaCobrada(op: Operacion): string | null {
    if (op.t !== "cobrar") return null;
    const c = this.estado.cuentas[op.cuenta];
    if (!c || c.pagos.some((p) => p.id === op.pago) || saldo(c) > 0) return null;
    const u = [...c.pagos].reverse().find((p) => !p.deshecho);
    if (!u) return null; // sin cobros: es una cuenta vacía, no un doble cobro
    const como = u.medio === "efectivo" ? "en efectivo" : u.medio === "comida" ? "pasándola a comida" : `por ${u.medio === "nequi" ? "Nequi" : "Breve"}`;
    return `${c.nombre} ya la cobró ${u.persona} a las ${horaDe(u.en)} ${como}. Si recibió plata, devuélvala.`;
  }

  /** Agrega a `cambios` cómo quedó lo que tocó una operación ya aplicada. */
  private cambiosDe(op: Operacion, cambios: Cambios = {}): Cambios {
    if ("cuenta" in op) {
      for (const id of op.t === "juntar" || op.t === "separar" ? [op.cuenta, op.desde] : [op.cuenta]) {
        this.traerCuenta(id);
        const c = this.estado.cuentas[id];
        if (c) (cambios.cuentas ??= {})[c.id] = c;
      }
    }
    if (op.t === "producto") cambios.productos = this.estado.productos ?? {};
    if (op.t === "orden") cambios.orden = this.estado.orden ?? [];
    if (op.t === "cerrar_jornada") cambios.jornadas = this.estado.jornadas ?? {};
    return cambios;
  }

  /**
   * Lo que cambió después de `desde`, si el celular es de esta base y no se quedó muy
   * atrás; si no, null (y se le manda la foto completa).
   */
  private novedades(desde: unknown, base: unknown): { tipo: "novedades"; base: string; seq: number; cambios: Cambios } | null {
    if (typeof desde !== "number" || !Number.isInteger(desde) || desde <= 0 || desde > this.seq) return null;
    if (baseDelEnvio(base) !== this.base || this.seq - desde > MAX_NOVEDADES) return null;
    const cambios: Cambios = {};
    for (const f of this.ctx.storage.sql.exec<{ datos: string }>("SELECT datos FROM operaciones WHERE seq > ? ORDER BY seq", desde)) {
      this.cambiosDe(JSON.parse(f.datos) as Operacion, cambios);
    }
    return { tipo: "novedades", base: this.base, seq: this.seq, cambios };
  }

  /** Una cuenta como está ahora, sin dejarla en memoria si no estaba. */
  private cuentaGuardada(id: string): Cuenta | undefined {
    if (this.estado.cuentas[id]) return this.estado.cuentas[id];
    const f = this.ctx.storage.sql.exec<{ datos: string }>("SELECT datos FROM cuentas WHERE id = ?", id).toArray()[0];
    return f ? (JSON.parse(f.datos) as Cuenta) : undefined;
  }

  /**
   * Auditoría de un día (RF-74, E4): cada operación en una frase, de la más reciente a la
   * más vieja, y lo que se rechazó ese día.
   */
  private auditoria(fecha: string) {
    const inicio = Date.parse(`${fecha}T10:00:00Z`); // 5:00 a. m. en Colombia (ver `jornada`)
    const sql = this.ctx.storage.sql;
    const filas = sql.exec<{ seq: number; persona: string; datos: string }>(
      "SELECT seq, persona, datos FROM operaciones WHERE json_extract(datos, '$.en') >= ? AND json_extract(datos, '$.en') < ? ORDER BY seq DESC LIMIT 3000",
      inicio, inicio + DIA,
    ).toArray();
    const cuentas = new Map<string, Cuenta | undefined>();
    const cuentaDe = (id: string) => { if (!cuentas.has(id)) cuentas.set(id, this.cuentaGuardada(id)); return cuentas.get(id); };
    const eventos: Evento[] = filas.map((f) => {
      const op = JSON.parse(f.datos) as Operacion;
      const c = "cuenta" in op ? cuentaDe(op.cuenta) : undefined;
      const { texto, atencion } = describirConEnvio(op, c, this.estado);
      return { seq: f.seq, en: op.en, persona: f.persona, t: op.t, ...("cuenta" in op ? { cuenta: op.cuenta, cuentaNombre: c?.nombre } : {}), texto, atencion };
    });
    const rechazadas = sql.exec<{ id: string; persona: string; motivo: string; en: number; datos: string }>(
      "SELECT id, persona, motivo, en, datos FROM rechazadas WHERE en >= ? AND en < ? ORDER BY en DESC LIMIT 500", inicio, inicio + DIA,
    ).toArray().map((r) => {
      let t = "";
      try { t = String((JSON.parse(r.datos) as { t?: unknown }).t ?? ""); } catch { /* recortado */ }
      return { id: r.id, persona: r.persona, motivo: r.motivo, en: r.en, t };
    });
    return { fecha, eventos, rechazadas, limitado: filas.length === 3000 };
  }

  /** Saca de memoria lo que ya no es vigente: está guardado y se trae si hace falta. */
  private podar() {
    const ahora = Date.now();
    for (const [id, c] of Object.entries(this.estado.cuentas)) if (!esVigente(c, ahora)) delete this.estado.cuentas[id];
  }

  /** Rearma el estado aplicando el registro guardado, en orden (solo para reconstruir). */
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
  /** Cambió el rol o las áreas de una persona: sus celulares conectados lo saben ya. */
  private avisarYo(id: string) {
    const p = this.acceso.persona(id);
    if (!p) return;
    const yo = { rol: p.rol, areas: this.acceso.areasDeHoy(p.id, jornada(Date.now())) };
    for (const ws of this.ctx.getWebSockets(`p:${id}`)) {
      try { ws.send(JSON.stringify({ tipo: "yo", yo })); } catch { /* ya cerrada */ }
    }
  }

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
    this.reconstruir();
    const cuentas = Object.values(this.estado.cuentas);
    this.avisarATodos(this.foto());
    return json({ base: this.base, seq: this.seq, cuentas: cuentas.length, total: cuentas.reduce((t, c) => t + c.lineas.reduce((s, l) => s + (l.anulada ? 0 : l.precio * l.cantidad), 0), 0) });
  }

  /**
   * Lo que el rol de la persona no permite. El servidor lo revisa en cada operación:
   * esconder un botón no es seguridad (docs/03 «Acceso y seguridad»).
   */
  private permiso(op: Operacion, quien: Quien, ahora: number): string | null {
    const juntas = this.juntas(op);
    if (juntas) return juntas;
    if (quien.rol === ADMIN) {
      if (op.t === "anular_cuenta") {
        const c = this.estado.cuentas[op.cuenta];
        if (c && total(c) > 0 && !(typeof op.motivo === "string" && op.motivo.trim())) return "Para anular una cuenta con productos escriba el motivo.";
      }
      return null;
    }
    if (op.t === "producto" || op.t === "orden") return "Solo el administrador cambia productos y precios.";
    // Áreas (docs/14): despachar es de la barra; anotar platos, de la comida.
    if (op.t === "despachar" && !quien.areas.includes("barra")) return "Solo la barra despacha las bebidas.";
    if (op.t === "anotar" && !quien.areas.includes("comida") && op.lineas.some((l) => productoDe(this.estado, l.producto)?.categoria === "comida")) return "Solo el área de comida anota platos.";
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
      } else {
        // Abierta con abonos: reabrir deshace todos; solo si son de quien reabre y recientes.
        const ajenos = c.pagos.filter((p) => !p.deshecho && !(p.persona === quien.nombre && ahora - p.en < VENTANA_DESHACER));
        if (ajenos.length) return "Solo el administrador deshace abonos de otros o de hace rato.";
      }
    }
    if (op.t === "deshacer_pago" && c) {
      // Deshacer un abono: quien lo cobró, unos minutos; si no, el administrador.
      const p = c.pagos.find((x) => x.id === op.pago);
      if (p && !p.deshecho && !(p.persona === quien.nombre && ahora - p.en < VENTANA_DESHACER)) return "Solo el administrador deshace un abono de otro o de hace rato.";
    }
    return null;
  }

  /**
   * Juntar y separar cuentas (docs/04 «Juntar cuentas»), para todos: lo que no se puede
   * hacer se rechaza con el porqué en vez de no hacer nada en silencio (regla 8).
   */
  private juntas(op: Operacion): string | null {
    const c = "cuenta" in op ? this.estado.cuentas[op.cuenta] : undefined;
    if (op.t === "cobrar" && c && situacion(c) === "juntada") return `${c.nombre} se juntó con ${c.juntadaA!.nombre}: cóbrela allá.`;
    if (op.t !== "juntar" && op.t !== "separar") return null;
    const o = this.estado.cuentas[op.desde];
    if (!c || !o) return "Esa cuenta ya no existe.";
    if (op.t === "juntar") {
      if (o.id === c.id) return "Escoja otra cuenta.";
      if (situacion(o) === "juntada") return `${o.nombre} ya se juntó con ${o.juntadaA!.nombre}.`;
      if (situacion(c) !== "abierta") return `${c.nombre} ya no está abierta.`;
      if (situacion(o) !== "abierta") return `${o.nombre} ya no está abierta.`;
      if (!o.lineas.length) return `${o.nombre} no tiene productos.`;
      return null;
    }
    const j = c.juntadas?.find((x) => x.cuenta === o.id);
    if (!j || o.juntadaA?.cuenta !== c.id) return `${o.nombre} ya no está junto con ${c.nombre}.`;
    if (c.pagos.slice(j.pagos).some((p) => !p.deshecho)) return `Después de juntarlas ya se cobró algo de ${c.nombre}: no se pueden separar.`;
    return null;
  }

  /** Recibe operaciones de un celular. Idempotente por `id`. */
  /**
   * Quién anotó cada operación, probado: la sesión firmada que el celular guardó con ella
   * al anotarla (`firma`), si es válida y de este mismo celular. Así lo anotado sin señal
   * queda a nombre de quien lo anotó aunque lo envíe otra persona después, y nadie puede
   * atribuirle algo a otro solo poniendo su nombre. Se resuelve antes de `recibir`, que no
   * debe esperar nada a mitad de camino (el orden de las operaciones lo da este objeto).
   */
  private async autores(ops: unknown[], quien: Quien): Promise<Map<string, string>> {
    const autores = new Map<string, string>();
    const vistas = new Map<string, string | null>();
    for (const crudo of ops.slice(0, 200)) {
      const o = crudo as { id?: unknown; firma?: unknown };
      if (typeof o?.id !== "string" || typeof o.firma !== "string" || o.firma.length > 400) continue;
      if (!vistas.has(o.firma)) {
        const s = await leerSesion(this.env.FIRMA, o.firma);
        vistas.set(o.firma, s && s.dispositivo === quien.dispositivo ? this.acceso.persona(s.persona)?.nombre ?? null : null);
      }
      const nombre = vistas.get(o.firma);
      if (nombre && nombre !== quien.nombre) autores.set(o.id, nombre);
    }
    return autores;
  }

  private recibir(ops: unknown[], quien: Quien, autores = new Map<string, string>()): { aceptadas: string[]; rechazadas: Rechazo[] } {
    const aceptadas: string[] = [];
    const rechazadas: Rechazo[] = [];
    const ahora = Date.now();
    const rechazar = (id: string, t: unknown, crudo: unknown, motivo: string) => {
      this.ctx.storage.sql.exec("INSERT INTO rechazadas (id, persona, dispositivo, datos, motivo, en) VALUES (?, ?, ?, ?, ?, ?)",
        id, quien.nombre, quien.dispositivo, JSON.stringify(crudo).slice(0, 10_000), motivo, ahora);
      console.warn(JSON.stringify({ aviso: "operacion-rechazada", id, t, persona: quien.nombre, motivo }));
      rechazadas.push({ id, motivo });
    };
    for (const crudo of ops.slice(0, 200)) {
      const idCrudo = crudo && typeof crudo === "object" && typeof (crudo as { id?: unknown }).id === "string" ? (crudo as { id: string }).id : null;
      if (!idCrudo || idCrudo.length > 64) {
        console.warn(JSON.stringify({ aviso: "operacion-sin-id", persona: quien.nombre }));
        continue; // sin id el celular no puede saber cuál fue
      }
      // Primero el reintento: lo ya aceptado se confirma aunque hoy no pasara la validación.
      const ya = this.ctx.storage.sql.exec("SELECT seq FROM operaciones WHERE id = ?", idCrudo).toArray();
      if (ya.length > 0) {
        aceptadas.push(idCrudo);
        continue;
      }
      const v = validar(crudo);
      if ("motivo" in v) { rechazar(idCrudo, (crudo as { t?: unknown }).t, crudo, v.motivo); continue; }
      // Quién la hizo: quien envía (la sesión), salvo que la operación traiga la sesión
      // firmada de otra persona de este celular (ver `autores`). Los permisos se revisan
      // siempre con quien envía. La firma no se guarda.
      const autor = autores.get(idCrudo) ?? quien.nombre;
      const { firma: _f, ...limpia } = v.op;
      const op = { ...limpia, persona: autor, ...(autor !== quien.nombre ? { enviadaPor: quien.nombre } : {}), en: Math.min(ahora, Math.max(ahora - DIA, v.op.en)) } as Operacion;
      delete op.seq;
      // El área de lo anotado o cobrado: la que diga, si la tiene hoy; si no dice, su principal.
      if (op.t === "anotar" || op.t === "cobrar" || op.t === "cerrar_jornada") {
        const pedida = (op as { area?: unknown }).area;
        if (esArea(pedida) && !quien.areas.includes(pedida)) { rechazar(op.id, op.t, crudo, `Hoy no tiene acceso a ${nombreArea(pedida).toLowerCase()}.`); continue; }
        if (op.t !== "cerrar_jornada" || esArea(pedida)) (op as { area?: Area }).area = esArea(pedida) ? pedida : quien.areas[0];
      }
      this.traerPara(op);
      const motivo = this.permiso(op, quien, ahora) ?? this.yaCobrada(op);
      if (motivo) { rechazar(op.id, op.t, crudo, motivo); continue; }
      // El precio fijado solo lo pone el servidor: lo que mande el celular se descarta.
      if (op.t === "anotar") op.lineas = op.lineas.map(({ precioFijado: _, ...l }) => l);
      try {
        aplicar(this.estado, op);
      } catch (e) {
        // Una regla que falla a medias pudo dejar el estado tocado: se rearma del registro.
        console.error(JSON.stringify({ aviso: "aplicar-fallo", id: op.id, t: op.t, error: String(e) }));
        this.cargar();
        rechazar(op.id, op.t, crudo, "No se pudo anotar. Avise al administrador.");
        continue;
      }
      // Queda escrito el precio con que se cobró cada línea, para que recalcular el
      // registro nunca cambie lo ya anotado aunque después cambie el catálogo.
      if (op.t === "anotar") {
        const cobradas = new Map((this.estado.cuentas[op.cuenta]?.lineas ?? []).filter((l) => l.ronda === op.ronda).map((l) => [l.id, l.precio]));
        op.lineas = op.lineas.map((l) => (cobradas.has(l.id) ? { ...l, precioFijado: cobradas.get(l.id) } : l));
      }
      // La operación y la proyección, juntas: o quedan las dos o ninguna.
      this.ctx.storage.transactionSync(() => {
        const { seq } = this.ctx.storage.sql
          .exec<{ seq: number }>(
            "INSERT INTO operaciones (id, persona, datos, recibida_en) VALUES (?, ?, ?, ?) RETURNING seq",
            op.id, quien.nombre, JSON.stringify(op), ahora,
          )
          .one();
        op.seq = seq;
        this.seq = seq;
        const c = "cuenta" in op ? this.estado.cuentas[op.cuenta] : undefined;
        if (c) this.guardarCuenta(c);
        if (op.t === "juntar" || op.t === "separar") { const o = this.estado.cuentas[op.desde]; if (o) this.guardarCuenta(o); }
        this.guardarGeneral(op.t === "producto" ? ["productos"] : op.t === "orden" ? ["orden"] : op.t === "cerrar_jornada" ? ["jornadas"] : []);
      });
      aceptadas.push(op.id);
      this.avisarATodos({ tipo: "op", op, cambios: this.cambiosDe(op) });
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
    return { id: p.id, nombre: p.nombre, rol: p.rol, dispositivo: disp.id, areas: this.acceso.areasDeHoy(p.id, jornada(Date.now())) };
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
      const { ops, base, seq } = await cuerpo<{ ops?: unknown[]; base?: unknown; seq?: unknown }>();
      const lista = Array.isArray(ops) ? ops : [];
      if (lista.length && this.esDeOtraBase(base, q.nombre, lista.length)) return json({ error: "base", ok: [], rechazadas: [], ...this.foto() }, 409);
      const { aceptadas, rechazadas } = this.recibir(lista, q, await this.autores(lista, q));
      // Con `seq`, solo lo nuevo (el respaldo HTTP pregunta cada 5 s); sin él, la foto.
      return json({ ok: aceptadas, rechazadas, ...(this.novedades(seq, base) ?? this.foto()), yo: { rol: q.rol, areas: q.areas } });
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
      const b = await cuerpo<{ accion?: string; id?: string; nombre?: string; rol?: string; pin?: string | null; activa?: boolean; areas?: unknown[]; area?: unknown; fecha?: unknown; dar?: boolean }>();
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
      if (b.accion === "rol") {
        const e = this.acceso.ponerRol(p.id, b.rol === ADMIN ? ADMIN : "operador");
        if (!e) this.avisarYo(p.id);
        return e ? json({ error: e }, 400) : json({ ok: true });
      }
      if (b.accion === "areas") {
        const e = this.acceso.ponerAreas(p.id, Array.isArray(b.areas) ? b.areas : []);
        if (!e) this.avisarYo(p.id);
        return e ? json({ error: e }, 400) : json({ ok: true });
      }
      if (b.accion === "dia") {
        if (!esArea(b.area) || typeof b.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.fecha)) return json({ error: "Escoja el área y el día." }, 400);
        this.acceso.accesoDia(p.id, b.area, b.fecha, b.dar !== false, q.nombre);
        this.avisarYo(p.id);
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
    if (ruta === "/api/admin/dispositivos" && req.method === "GET") {
      // Conectados ahora: cada WebSocket abierto con su persona, versión y pendientes (E4).
      const conexiones = this.ctx.getWebSockets().map((ws) => {
        const etiquetas = this.ctx.getTags(ws);
        const a = (ws.deserializeAttachment() ?? {}) as DeConexion;
        return { dispositivo: etiquetas.find((t) => t.startsWith("d:"))?.slice(2) ?? "", persona: etiquetas[0] ?? "", ...a };
      });
      return json({ dispositivos: this.acceso.dispositivos(), este: q.dispositivo, conexiones });
    }
    if (ruta === "/api/admin/dispositivos" && req.method === "POST") {
      const { revocar } = await cuerpo<{ revocar?: string }>();
      if (!revocar) return json({ error: "Falta el celular." }, 400);
      if (revocar === q.dispositivo) return json({ error: "No puede quitar el celular que está usando." }, 400);
      this.acceso.revocar(revocar);
      this.cortar(`d:${revocar}`);
      return json({ ok: true });
    }
    if (ruta === "/api/admin/jornadas" && req.method === "GET") {
      // Días anteriores (RF-52): de la proyección, día por día (el celular no los guarda).
      const fechas = this.ctx.storage.sql.exec<{ fecha: string }>("SELECT DISTINCT fecha FROM cuenta_jornadas ORDER BY fecha DESC LIMIT 200").toArray().map((f) => f.fecha);
      const dias = [];
      for (const fecha of fechas) {
        const cuentas = this.cuentasDe(fecha);
        if (!jornadasConMovimiento(cuentas).includes(fecha)) continue; // solo abrió, sin pedidas ni cobros
        const { porProducto: _, ...r } = resumenJornada(cuentas, fecha);
        dias.push({ ...r, cierres: this.estado.jornadas?.[fecha] ?? [] });
        if (dias.length === 120) break;
      }
      return json({ dias });
    }
    if (ruta === "/api/admin/jornadas/csv" && req.method === "GET") {
      const fecha = url.searchParams.get("fecha") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: "Falta la fecha." }, 400);
      // Con BOM: así Excel reconoce las tildes.
      return new Response(`\uFEFF${csvJornada(this.cuentasDe(fecha), fecha)}`, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="barra-${fecha}.csv"`, "cache-control": "no-store" },
      });
    }
    if (ruta === "/api/admin/auditoria" && req.method === "GET") {
      const fecha = url.searchParams.get("fecha") ?? jornada(Date.now());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return json({ error: "Fecha inválida." }, 400);
      return json(this.auditoria(fecha));
    }
    if (ruta === "/api/admin/rechazadas" && req.method === "GET") {
      return json({ rechazadas: this.ctx.storage.sql.exec("SELECT id, persona, dispositivo, motivo, en, datos FROM rechazadas ORDER BY en DESC LIMIT 200").toArray() });
    }
    if (ruta === "/api/admin/respaldo/correo" && req.method === "POST") {
      // Mandar ya la copia por correo (la misma de los lunes).
      const { texto, operaciones } = this.respaldo();
      const fecha = jornada(Date.now());
      const r = await enviarRespaldo(this.env, { fecha, base: this.base, operaciones, comprimido: await comprimir(texto) });
      return json(r === "enviado" ? { ok: true, operaciones } : { error: r === "sin-configurar" ? "El correo de respaldos no está configurado." : "No se pudo enviar; ver los logs." }, r === "enviado" ? 200 : 503);
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
    return json({ token: await firmarSesion(this.env.FIRMA, p.id, disp.id), persona: p.nombre, rol: p.rol, base: this.base, areas: this.acceso.areasDeHoy(p.id, jornada(Date.now())) });
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
    const quien: Quien = { id: p.id, nombre: p.nombre, rol: p.rol, dispositivo, areas: this.acceso.areasDeHoy(p.id, jornada(Date.now())) };
    // Versión y pendientes que reporta el celular, para «Personas y celulares».
    const antes = (ws.deserializeAttachment() ?? {}) as DeConexion;
    ws.serializeAttachment({
      version: typeof m.version === "string" ? m.version.slice(0, 40) : antes.version,
      pendientes: typeof m.pendientes === "number" && Number.isInteger(m.pendientes) && m.pendientes >= 0 ? m.pendientes : antes.pendientes,
      visto: Date.now(),
    } satisfies DeConexion);
    if (m.tipo === "hola") ws.send(JSON.stringify({ ...(this.novedades(m.seq, m.base) ?? this.foto()), yo: { rol: quien.rol, areas: quien.areas } }));
    else if (m.tipo === "ops" && Array.isArray(m.ops)) {
      if (m.ops.length && this.esDeOtraBase(m.base, quien.nombre, m.ops.length)) ws.send(JSON.stringify(this.foto()));
      else {
        const { aceptadas, rechazadas } = this.recibir(m.ops, quien, await this.autores(m.ops, quien));
        ws.send(JSON.stringify({ tipo: "ok", ids: aceptadas, rechazadas }));
        // Lo que reportó el celular incluía este lote: ya no le falta enviarlo.
        const a = (ws.deserializeAttachment() ?? {}) as DeConexion;
        if (typeof a.pendientes === "number") ws.serializeAttachment({ ...a, pendientes: Math.max(0, a.pendientes - aceptadas.length - rechazadas.length) } satisfies DeConexion);
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code, "fin"); } catch { /* ya cerrada */ }
  }
}
