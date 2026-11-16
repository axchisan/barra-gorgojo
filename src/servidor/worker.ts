// Worker de la barra: archivos de la app, y la API, que atiende el Durable Object.
// Ver docs/03-arquitectura.md (ADR-01, ADR-10) y docs/04-sincronizacion-y-fuera-de-linea.md.

import { DurableObject } from "cloudflare:workers";
import { BASE_ORIGINAL } from "../dominio/base";
import { PERSONAS } from "../dominio/catalogo";
import { aplicar, catalogo, enCuadricula, esModoPrecio, esOperacion, modoPorDefecto, precioPara, preciosParaModo, esVigente, estadoVacio, jornada, pagadoPorLinea, producto as productoDe, puedeEditarLinea, recortar, saldo, situacion, total, type Cuenta, type Estado, type Operacion } from "../dominio/estado";
import { horaDe } from "../dominio/formato";
import { esArea, nombreArea, type Area } from "../dominio/areas";
import { saldoDeudor } from "../dominio/deudas";
import { csvJornada, jornadasConMovimiento, resumenJornada } from "../dominio/jornada";
import { describirConEnvio, type Evento } from "../dominio/auditoria";
import { validar } from "./esquema";
import { enviarRespaldo, esDiaDeCorreo, type ConfigCorreo } from "./correo";
import { Acceso, ADMIN, esPin, firmarSesion, igualesEnTiempoConstante, leerSesion, type Rol } from "./acceso";
import { dentroDeHorario, describirHorario, finDeFranja, mensajeFueraDeHorario, type Horario } from "../dominio/horario";
import { esCompleta, limitarCambios, limitarEstado, cuentaDeHoy, type Vista } from "../dominio/vista";
import { solicitudesVigentes, TOPE_LINEAS, TOPE_UNIDADES, TOPE_VALOR, valorSolicitud, type LineaSolicitud } from "../dominio/solicitudes";
import { Lugares } from "./qr";
import { endpointValido, enviar, leerVapid, Suscripciones, type Aviso, type Vapid } from "./push";

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
  /** Llave VAPID de las notificaciones push (JWK privada P-256). Secreto: `wrangler secret put VAPID`. Sin ella, push está apagado. */
  VAPID?: string;
  /** Solo en las pruebas: acepta suscripciones a un servicio de push falso en 127.0.0.1. */
  PUSH_LOCAL?: string;
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
    // La página del cliente que pide con el QR (docs/20): /m/<código> sirve cliente.html.
    if (url.pathname.startsWith("/m/") && req.method === "GET") return env.ASSETS.fetch(new Request(new URL("/cliente", url), req));
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
  deudas?: Estado["deudas"];
  solicitudes?: Estado["solicitudes"];
}
/** Las operaciones que pueden cambiar las deudas (docs/15). */
const TOCA_DEUDAS = new Set<Operacion["t"]>(["cobrar", "deshacer_pago", "reabrir", "deuda_cargo", "deuda_pago", "deuda_anular"]);
/** Las que cambian los pedidos de los clientes por QR (docs/20). */
const TOCA_SOLICITUDES = new Set<Operacion["t"]>(["solicitud", "aceptar_solicitud", "rechazar_solicitud"]);
/** Hasta cuántas operaciones atrás se mandan novedades al reconectar; más, la foto completa. */
const MAX_NOVEDADES = 500;
/** `deudas`: administra deudas (anotar a mano, anular): el administrador o con el permiso. */
interface Quien {
  id: string; nombre: string; rol: Rol; dispositivo: string; areas: Area[]; deudas: boolean;
  /** Qué ve (docs/17): el día de ventas y lo de otros días. */
  vista: Vista;
  /** Su horario de acceso (docs/17); `null`: sin restricción. */
  horario: Horario | null;
  /** Está fuera de su horario ahora: solo puede enviar lo que anotó dentro de él. */
  fuera: boolean;
}
/**
 * Después de terminar su franja, lo anotado hasta este rato después todavía se acepta: un
 * celular sin señal que lo envía tarde no pierde nada (regla 3).
 */
const GRACIA_HORARIO = 15 * 60_000;
/** Lo que el celular sabe de quien lo usa: se manda al entrar y con cada foto. */
const yoDe = (q: Pick<Quien, "rol" | "areas" | "deudas" | "vista" | "horario">, ahora = Date.now()) => ({
  rol: q.rol, areas: q.areas, deudas: q.deudas, dia: q.vista.dia, historial: q.vista.historial,
  ...(q.horario ? { horario: describirHorario(q.horario, jornada(ahora)), fin: finDeFranja(q.horario, ahora) } : {}),
});
interface Rechazo { id: string; motivo: string }

/** La base a la que el celular dice mandar sus operaciones. Sin decirlo: la original. */
const baseDelEnvio = (b: unknown) => (typeof b === "string" && b ? b : BASE_ORIGINAL);

export class Barra extends DurableObject<Env> {
  private estado: Estado = estadoVacio();
  private seq = 0;
  private acceso: Acceso;
  private lugares: Lugares;
  private suscripciones: Suscripciones;
  private vapid?: Promise<Vapid | null>;
  /** Origen por el que llegan los pedidos: contacto de VAPID si no hay dirección propia. */
  private origen?: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.acceso = new Acceso(ctx.storage.sql, env.PINES ?? "");
    this.lugares = new Lugares(ctx.storage.sql);
    this.suscripciones = new Suscripciones(ctx.storage.sql);
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
      this.lugares.preparar();
      this.suscripciones.preparar();
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

  /** Lo vigente, recortado a lo que puede ver esta persona (docs/17). Sin vista: todo (terminal, pruebas). */
  private foto(vista?: Vista) {
    this.podar();
    const ahora = Date.now();
    const estado = recortar(this.estado, ahora);
    return { tipo: "foto" as const, base: this.base, estado: vista ? limitarEstado(estado, vista, ahora) : estado, seq: this.seq };
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
    if (meta.has("deudas")) estado.deudas = JSON.parse(meta.get("deudas")!);
    if (meta.has("solicitudes")) estado.solicitudes = JSON.parse(meta.get("solicitudes")!);
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
      this.guardarGeneral(["productos", "orden", "jornadas", "deudas", "solicitudes"]);
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
  private guardarGeneral(claves: ("productos" | "orden" | "jornadas" | "deudas" | "solicitudes")[] = []) {
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
    if (TOCA_DEUDAS.has(op.t) && this.estado.deudas) cambios.deudas = this.estado.deudas;
    if (TOCA_SOLICITUDES.has(op.t) && this.estado.solicitudes) cambios.solicitudes = solicitudesVigentes(this.estado.solicitudes, Date.now());
    return cambios;
  }

  /**
   * Lo que cambió después de `desde`, si el celular es de esta base y no se quedó muy
   * atrás; si no, null (y se le manda la foto completa).
   */
  private novedades(desde: unknown, base: unknown, vista?: Vista): { tipo: "novedades"; base: string; seq: number; cambios: Cambios } | null {
    // Quien ve menos recibe siempre la foto: lo que guardó su celular otro día (deudas de
    // otra jornada) no debe quedarse ahí como si fuera de hoy.
    if (vista && !esCompleta(vista)) return null;
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
    // Las solicitudes resueltas hace más de 36 h ya no cambian nada (aceptar y rechazar solo
    // tocan las pendientes): salen de memoria, y de la proyección la próxima vez que se escriba.
    if (this.estado.solicitudes) this.estado.solicitudes = solicitudesVigentes(this.estado.solicitudes, ahora);
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

  /**
   * Manda a todos los celulares conectados una foto o una operación con sus cambios, a
   * cada uno recortada a lo que puede ver su persona (docs/17).
   */
  private avisarATodos(mensaje: { tipo: "foto"; estado: Estado; [k: string]: unknown } | { tipo: "op"; op: Operacion; cambios: Cambios }) {
    const completo = JSON.stringify(mensaje);
    const porVista = new Map<string, string>();
    const ahora = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const persona = this.ctx.getTags(ws).find((t) => t.startsWith("p:"))?.slice(2) ?? "";
      const vista = this.acceso.vista(persona);
      let texto = completo;
      if (!esCompleta(vista)) {
        const clave = `${vista.dia}-${vista.historial}`;
        if (!porVista.has(clave)) {
          porVista.set(clave, JSON.stringify(mensaje.tipo === "foto"
            ? { ...mensaje, estado: limitarEstado(mensaje.estado, vista, ahora) }
            // De la operación, solo lo que el celular necesita para seguir el orden; el resto va en los cambios.
            : { tipo: "op", op: { id: mensaje.op.id, seq: mensaje.op.seq, t: mensaje.op.t }, cambios: limitarCambios(mensaje.cambios, vista, ahora) }));
        }
        texto = porVista.get(clave)!;
      }
      try { ws.send(texto); } catch { /* conexión muerta: se limpia sola */ }
    }
  }

  /** Corta las conexiones de un celular quitado o de una persona desactivada. */
  /** Cambió el rol o las áreas de una persona: sus celulares conectados lo saben ya. */
  private avisarYo(id: string) {
    const p = this.acceso.persona(id);
    if (!p) return;
    const ahora = Date.now();
    if (!dentroDeHorario(p.horario, ahora)) return this.sacarPorHorario(id);
    const vista = this.acceso.vista(p.id);
    const yo = yoDe({ rol: p.rol, areas: this.acceso.areasDeHoy(p.id, jornada(ahora)), deudas: this.acceso.administraDeudas(p.id), vista, horario: p.horario }, ahora);
    // Con la foto: si ahora ve menos, lo que tenía de más se reemplaza ya (docs/17).
    const texto = JSON.stringify({ ...this.foto(vista), yo });
    for (const ws of this.ctx.getWebSockets(`p:${id}`)) {
      try { ws.send(texto); } catch { /* ya cerrada */ }
    }
    this.programarFinDeHorario();
  }

  /** Terminó (o le quitaron) su horario: sus celulares salen a la entrada con el porqué. */
  private sacarPorHorario(id: string) {
    const p = this.acceso.persona(id);
    const mensaje = mensajeFueraDeHorario(p?.horario ?? null, Date.now());
    for (const ws of this.ctx.getWebSockets(`p:${id}`)) {
      try { ws.send(JSON.stringify({ tipo: "horario", mensaje })); ws.close(4003, "horario"); } catch { /* ya cerrada */ }
    }
  }

  /**
   * Pone la alarma del Durable Object en el fin de la franja más próxima de quienes están
   * conectados con horario; al sonar, saca a quien ya quedó fuera (ver `alarm`).
   */
  private programarFinDeHorario() {
    const ahora = Date.now();
    let proximo: number | null = null;
    const vistas = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const id = this.ctx.getTags(ws).find((t) => t.startsWith("p:"))?.slice(2) ?? "";
      if (!id || vistas.has(id)) continue;
      vistas.add(id);
      const fin = finDeFranja(this.acceso.persona(id)?.horario ?? null, ahora);
      if (fin && (proximo == null || fin < proximo)) proximo = fin;
    }
    if (proximo != null) void this.ctx.storage.setAlarm(proximo + 1000);
  }

  async alarm() {
    const ahora = Date.now();
    const revisadas = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const id = this.ctx.getTags(ws).find((t) => t.startsWith("p:"))?.slice(2) ?? "";
      if (!id || revisadas.has(id)) continue;
      revisadas.add(id);
      if (!this.acceso.enHorario(id, ahora)) this.sacarPorHorario(id);
    }
    this.programarFinDeHorario();
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
    // Las solicitudes llegan solo por la ruta pública del QR, nunca de un celular del personal.
    if (op.t === "solicitud") return "Los pedidos de los clientes llegan solo por el QR.";
    if (op.t === "aceptar_solicitud" || op.t === "rechazar_solicitud") {
      const s = this.estado.solicitudes?.[op.solicitud];
      if (!s) return "Ese pedido ya no existe.";
      if (s.estado !== "pendiente") return `Ese pedido ya se ${s.estado === "aceptada" ? "aceptó" : "rechazó"}${s.resuelta ? ` (${s.resuelta.por})` : ""}.`;
      if (op.t === "rechazar_solicitud" && !(typeof op.motivo === "string" && op.motivo.trim())) return "Escriba por qué no se puede.";
    }
    const juntas = this.juntas(op) ?? this.deudas(op, quien) ?? this.ediciones(op);
    if (juntas) return juntas;
    if (quien.rol === ADMIN) {
      if (op.t === "anular_cuenta") {
        const c = this.estado.cuentas[op.cuenta];
        if (c && total(c) > 0 && !(typeof op.motivo === "string" && op.motivo.trim())) return "Para anular una cuenta con productos escriba el motivo.";
      }
      return null;
    }
    if (op.t === "producto" || op.t === "orden") return "Solo el administrador cambia productos y precios.";
    if (op.t === "cerrar_jornada" && !quien.vista.dia) return "El cierre de caja lo hace la administración.";
    // Áreas (docs/14): despachar es de la barra; anotar platos, de la comida.
    if (op.t === "despachar" && !quien.areas.includes("barra")) return "Solo la barra despacha las bebidas.";
    if (op.t === "rechazar_despacho" && !quien.areas.includes("barra")) return "Solo la barra rechaza un pedido.";
    if (op.t === "precio_ronda" && !quien.areas.includes("barra")) return "Solo la barra cambia el precio de una pedida.";
    if ((op.t === "anotar" || op.t === "agregar") && !quien.areas.includes("comida") && op.lineas.some((l) => productoDe(this.estado, l.producto)?.categoria === "comida")) return "Solo el área de comida anota platos.";
    if (op.t === "cambiar_producto") {
      const c = this.estado.cuentas[op.cuenta];
      const l = c?.lineas.find((x) => x.id === op.linea);
      if (l && !puedeEditarLinea(quien.areas, l)) return "Desde comida solo se cambian los platos y las bebidas pedidas desde comida que no se han despachado.";
      if (!quien.areas.includes("comida") && productoDe(this.estado, op.nueva?.producto)?.categoria === "comida") return "Solo el área de comida anota platos.";
    }
    if (op.t === "anular" || op.t === "cantidad" || op.t === "comida_linea" || op.t === "cambio_linea") {
      const l = this.estado.cuentas[op.cuenta]?.lineas.find((x) => x.id === op.linea);
      if (l && !puedeEditarLinea(quien.areas, l)) return "Desde comida solo se cambian los platos y las bebidas pedidas desde comida que no se han despachado.";
    }
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
  /** Editar una pedida (agregar o cambiar producto): lo que no se puede, con su porqué (regla 8). */
  private ediciones(op: Operacion): string | null {
    if (op.t === "rechazar_despacho") {
      // Lo que no se puede, con su porqué (regla 8): para todos, también el administrador.
      const c = this.estado.cuentas[op.cuenta];
      if (!c) return "Esa cuenta ya no existe.";
      if (!(typeof op.motivo === "string" && op.motivo.trim())) return "Escriba por qué no se puede despachar.";
      const cuales = Array.isArray(op.lineas) && op.lineas.length ? new Set(op.lineas) : null;
      if (!c.lineas.some((l) => l.porDespachar && !l.anulada && (!cuales || cuales.has(l.id)))) return "Ese pedido ya no está por despachar (otro aparato ya lo despachó o lo canceló).";
      return null;
    }
    if (op.t === "precio_ronda") {
      const c = this.estado.cuentas[op.cuenta];
      if (!c || c.anulada) return "Esa cuenta ya no está abierta.";
      if (c.tipo !== "cancha") return "El precio de cancha solo aplica en las canchas.";
      if (!c.rondas.some((r) => r.id === op.ronda)) return "Esa pedida ya no existe.";
      if (situacion(c) !== "abierta") return `${c.nombre} ya se cobró: reábrala para cambiarle el precio.`;
      return null;
    }
    if (op.t !== "agregar" && op.t !== "cambiar_producto") return null;
    const c = this.estado.cuentas[op.cuenta];
    if (!c || c.anulada) return "Esa cuenta ya no está abierta.";
    if (op.t === "agregar") return c.rondas.some((r) => r.id === op.ronda) ? null : "Esa pedida ya no existe.";
    const l = c.lineas.find((x) => x.id === op.linea);
    if (!l || l.anulada) return "Ese producto ya no está en la pedida.";
    if ((pagadoPorLinea(c).get(l.id) ?? 0) > 0) return `${l.nombre} ya se pagó con un abono: deshaga el abono para cambiarlo.`;
    const p = productoDe(this.estado, op.nueva?.producto ?? "");
    if (!p) return "Ese producto no existe.";
    if (p.libre) return "Para «Otro» o el mecato, anule el producto y anótelo de nuevo.";
    if (p.id === l.producto) return "Escoja un producto distinto.";
    return null;
  }

  private deudas(op: Operacion, quien: Quien): string | null {
    if (op.t === "cobrar" && op.medio === "deuda" && !(typeof op.deudor === "string" && op.deudor.trim())) return "Escriba a nombre de quién queda la deuda.";
    if ((op.t === "deuda_cargo" || op.t === "deuda_anular") && !quien.deudas) return "Anotar deudas a mano o anular movimientos de deudas necesita el permiso de administrar deudas.";
    if (op.t === "deuda_pago" || op.t === "deuda_anular") {
      const d = this.estado.deudas?.[op.deudor];
      if (!d) return "Esa persona no tiene deudas.";
      if (op.t === "deuda_pago" && saldoDeudor(d) <= 0) return `${d.nombre} no debe nada.`;
      if (op.t === "deuda_anular") {
        const m = d.movimientos.find((x) => x.id === op.movimiento);
        if (!m || m.anulado) return "Ese movimiento ya no está.";
        if (m.cuenta) return `Esa deuda salió de la cuenta «${m.cuenta.nombre}»: se deshace desde el cobro de la cuenta.`;
      }
    }
    return null;
  }

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
      if (situacion(o) !== "abierta" && situacion(o) !== "cobrada") return `${o.nombre} no se puede juntar (está ${situacion(o) === "comida" ? "pasada a comida" : "anulada"}).`;
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
      // Fuera de su horario (docs/17) solo entra lo que se anotó dentro de él (o hasta un
      // rato después): lo anotado sin señal que llega tarde no se pierde (regla 3).
      if (quien.fuera) {
        const en = Math.min(ahora, Math.max(ahora - DIA, v.op.en));
        if (!dentroDeHorario(quien.horario, en) && !dentroDeHorario(quien.horario, en - GRACIA_HORARIO)) {
          rechazar(idCrudo, v.op.t, crudo, "Se anotó fuera de su horario de acceso. Avise al administrador.");
          continue;
        }
      }
      // Quién la hizo: quien envía (la sesión), salvo que la operación traiga la sesión
      // firmada de otra persona de este celular (ver `autores`). Los permisos se revisan
      // siempre con quien envía. La firma no se guarda.
      const autor = autores.get(idCrudo) ?? quien.nombre;
      const { firma: _f, ...limpia } = v.op;
      const op = { ...limpia, persona: autor, ...(autor !== quien.nombre ? { enviadaPor: quien.nombre } : {}), en: Math.min(ahora, Math.max(ahora - DIA, v.op.en)) } as Operacion;
      delete op.seq;
      // El área de lo anotado o cobrado: la que diga, si la tiene hoy; si no dice, su principal.
      if (op.t === "anotar" || op.t === "agregar" || op.t === "cobrar" || op.t === "cerrar_jornada") {
        const pedida = (op as { area?: unknown }).area;
        if (esArea(pedida) && !quien.areas.includes(pedida)) { rechazar(op.id, op.t, crudo, `Hoy no tiene acceso a ${nombreArea(pedida).toLowerCase()}.`); continue; }
        if (op.t !== "cerrar_jornada" || esArea(pedida)) (op as { area?: Area }).area = esArea(pedida) ? pedida : quien.areas[0];
      }
      this.traerPara(op);
      const motivo = this.permiso(op, quien, ahora) ?? this.yaCobrada(op);
      if (motivo) { rechazar(op.id, op.t, crudo, motivo); continue; }
      // El precio fijado solo lo pone el servidor: lo que mande el celular se descarta.
      if (op.t === "anotar" || op.t === "agregar") op.lineas = op.lineas.map(({ precioFijado: _, ...l }) => l);
      // Precio de la pedida en las canchas (docs/04 «Precio de los adicionales»): queda
      // escrito en la operación. Si el celular no lo dice (versión anterior), el de siempre
      // para su tipo: chico a precio de cancha, adicional a precio normal.
      if (op.t === "anotar" || op.t === "marcar_ronda") {
        const c = this.estado.cuentas[op.cuenta];
        if (c?.tipo === "cancha") op.precio = esModoPrecio(op.precio) ? op.precio : modoPorDefecto(op.adicional === true);
        else delete op.precio;
      }
      // Los precios nuevos de una pedida los calcula el servidor con su catálogo y los
      // guarda en la operación: recalcular el registro da siempre lo mismo (regla 0).
      if ((op.t === "marcar_ronda" || op.t === "precio_ronda")) {
        const c = this.estado.cuentas[op.cuenta];
        delete op.precios;
        if (c && esModoPrecio(op.precio) && situacion(c) === "abierta") op.precios = preciosParaModo(this.estado, c, op.ronda, op.precio);
      }
      if (op.t === "cambiar_producto" && op.nueva) { const { precioFijado: _, ...n } = op.nueva; op.nueva = n; }
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
      if (op.t === "anotar" || op.t === "agregar") {
        const cobradas = new Map((this.estado.cuentas[op.cuenta]?.lineas ?? []).filter((l) => l.ronda === op.ronda).map((l) => [l.id, l.precio]));
        op.lineas = op.lineas.map((l) => (cobradas.has(l.id) ? { ...l, precioFijado: cobradas.get(l.id) } : l));
      }
      if (op.t === "cambiar_producto" && op.nueva) {
        const nueva = this.estado.cuentas[op.cuenta]?.lineas.find((l) => l.id === op.nueva.id);
        if (nueva) op.nueva = { ...op.nueva, precioFijado: nueva.precio };
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
        this.guardarGeneral(op.t === "producto" ? ["productos"] : op.t === "orden" ? ["orden"] : op.t === "cerrar_jornada" ? ["jornadas"] : TOCA_DEUDAS.has(op.t) ? ["deudas"] : TOCA_SOLICITUDES.has(op.t) ? ["solicitudes"] : []);
      });
      aceptadas.push(op.id);
      this.avisarATodos({ tipo: "op", op, cambios: this.cambiosDe(op) });
      this.avisarDespacho(op, quien.dispositivo);
    }
    return { aceptadas, rechazadas };
  }

  // ── Notificaciones push (docs/18 fase 4, ADR-19) ─────────────────────

  private llaveVapid(): Promise<Vapid | null> {
    this.vapid ??= leerVapid(this.env.VAPID);
    return this.vapid;
  }

  /**
   * Bebidas pedidas desde comida (por despachar): aviso push a los aparatos suscritos de
   * quienes tienen barra hoy y están en su horario, menos el que lo pidió (como el timbre,
   * docs/02). El celular con la app a la vista no lo muestra: ya suena el timbre.
   */
  private avisarDespacho(op: Operacion, desde: string) {
    if (op.t !== "anotar" && op.t !== "agregar") return;
    const c = this.estado.cuentas[op.cuenta];
    if (!c) return;
    const ids = new Set(op.lineas.map((l) => l.id));
    const lineas = c.lineas.filter((l) => ids.has(l.id) && l.porDespachar && !l.anulada);
    if (!lineas.length) return;
    const detalle = lineas.map((l) => `${l.cantidad} ${l.nombre}`).join(", ");
    this.avisar({
      titulo: "🍺 Pedido para despachar",
      cuerpo: `${c.nombre}: ${detalle.length > 120 ? `${detalle.slice(0, 117)}…` : detalle}`,
      etiqueta: `despacho-${c.id}`,
      ir: "despacho",
    }, "barra", desde);
  }

  /** Quiénes reciben un aviso del área: aparato activo, persona activa, con el área hoy y en su horario. */
  private destinatarios(area: Area, excepto?: string, ahora = Date.now()) {
    const hoy = jornada(ahora);
    return this.suscripciones.todas().filter((s) => {
      if (s.dispositivo === excepto || !this.acceso.dispositivoActivo(s.dispositivo)) return false;
      const p = this.acceso.persona(s.persona);
      return !!p && p.activa && dentroDeHorario(p.horario, ahora) && this.acceso.areasDeHoy(p.id, hoy).includes(area);
    });
  }

  /** Manda el aviso sin hacer esperar a nadie: la respuesta al celular sale antes. */
  private avisar(aviso: Aviso, area: Area, excepto?: string) {
    if (!this.env.VAPID) return;
    const para = this.destinatarios(area, excepto);
    if (para.length) this.ctx.waitUntil(this.mandar(aviso, para));
  }

  private async mandar(aviso: Aviso, para: ReturnType<Barra["destinatarios"]>): Promise<number> {
    const vapid = await this.llaveVapid();
    if (!vapid) { console.warn(JSON.stringify({ aviso: "push-sin-llave" })); return 0; }
    const contacto = this.env.DIRECCION || this.origen || "https://localhost";
    const resultados = await Promise.all(para.map(async (s) => {
      const r = await enviar(vapid, s, aviso, contacto);
      if (r === "vencida") this.suscripciones.quitar(s.endpoint);
      return r;
    }));
    return resultados.filter((r) => r === "enviado").length;
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
    return this.quienEs(p.id, disp.id)!;
  }

  /** Todo lo que el servidor necesita saber de quien hace el pedido, ahora. */
  private quienEs(id: string, dispositivo: string, ahora = Date.now()): Quien | null {
    const p = this.acceso.persona(id);
    if (!p) return null;
    return {
      id: p.id, nombre: p.nombre, rol: p.rol, dispositivo, areas: this.acceso.areasDeHoy(p.id, jornada(ahora)), deudas: this.acceso.administraDeudas(p.id),
      vista: this.acceso.vista(p.id), horario: p.horario, fuera: !dentroDeHorario(p.horario, ahora),
    };
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const ruta = url.pathname;
    this.origen ??= url.origin;
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
    // Pedidos de los clientes por QR (docs/20): sin sesión, solo con el código del lugar.
    if (ruta.startsWith("/api/publico/")) return this.publico(req, url);

    // ── Con sesión ──────────────────────────────────────────────────
    const q = await this.quien(req, url);
    if (q instanceof Response) return q;
    // Fuera de su horario (docs/17): nada, salvo enviar lo que anotó dentro de él.
    if (q.fuera && ruta !== "/api/ops") return json({ error: "horario", mensaje: mensajeFueraDeHorario(q.horario, Date.now()) }, 403);

    if (ruta === "/api/ws") {
      if (req.headers.get("upgrade") !== "websocket") return json({ error: "Se esperaba WebSocket" }, 426);
      const { 0: cliente, 1: servidor } = new WebSocketPair();
      this.ctx.acceptWebSocket(servidor, [q.nombre, `p:${q.id}`, `d:${q.dispositivo}`]);
      if (q.horario) this.programarFinDeHorario();
      return new Response(null, { status: 101, webSocket: cliente });
    }
    if (ruta === "/api/ops" && req.method === "POST") {
      const { ops, base, seq } = await cuerpo<{ ops?: unknown[]; base?: unknown; seq?: unknown }>();
      const lista = Array.isArray(ops) ? ops : [];
      if (lista.length && this.esDeOtraBase(base, q.nombre, lista.length)) return json({ error: "base", ok: [], rechazadas: [], ...this.foto(q.vista) }, 409);
      const { aceptadas, rechazadas } = this.recibir(lista, q, await this.autores(lista, q));
      // Fuera de su horario: lo enviado queda (o se rechaza con su porqué), y nada más.
      if (q.fuera) return json({ ok: aceptadas, rechazadas, error: "horario", mensaje: mensajeFueraDeHorario(q.horario, Date.now()) }, 403);
      // Con `seq`, solo lo nuevo (el respaldo HTTP pregunta cada 5 s); sin él, la foto.
      return json({ ok: aceptadas, rechazadas, ...(this.novedades(seq, base, q.vista) ?? this.foto(q.vista)), yo: yoDe(q) });
    }
    if (ruta === "/api/foto") return json(this.foto(q.vista));
    if (ruta === "/api/push" && req.method === "GET") {
      // La llave pública para suscribirse (sin llave: push apagado) y si este aparato ya está.
      const vapid = await this.llaveVapid();
      return json({ llave: vapid?.publica ?? null, suscrito: this.suscripciones.deDispositivo(q.dispositivo) });
    }
    if (ruta === "/api/push" && req.method === "POST") {
      const b = await cuerpo<{ accion?: string; endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }>();
      if (b.accion === "suscribir") {
        const { p256dh, auth } = b.keys ?? {};
        if (!endpointValido(b.endpoint, this.env.PUSH_LOCAL === "1")) return json({ error: "Ese servicio de avisos no se reconoce." }, 400);
        if (typeof p256dh !== "string" || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || typeof auth !== "string" || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return json({ error: "Suscripción inválida." }, 400);
        this.suscripciones.guardar({ endpoint: b.endpoint, p256dh, auth, dispositivo: q.dispositivo, persona: q.id });
        return json({ ok: true });
      }
      if (b.accion === "quitar") {
        this.suscripciones.quitarDispositivo(q.dispositivo);
        return json({ ok: true });
      }
      if (b.accion === "probar") {
        // Un aviso de prueba a este mismo aparato, para ver que llega con la app cerrada.
        const mias = this.suscripciones.todas().filter((s) => s.dispositivo === q.dispositivo);
        if (!mias.length) return json({ error: "Este aparato no está recibiendo avisos." }, 400);
        const enviados = await this.mandar({ titulo: "🔔 Aviso de prueba", cuerpo: "Así llegan los pedidos para despachar con la app cerrada.", etiqueta: "prueba", ir: "despacho" }, mias);
        return enviados ? json({ ok: true }) : json({ error: "No se pudo enviar el aviso de prueba." }, 502);
      }
      return json({ error: "Acción desconocida." }, 400);
    }
    // Cuentas por id, aunque ya no estén en el celular (las de días anteriores): para ver
    // el detalle de lo fiado en «Deudas» (docs/15). Solo lectura, hasta 50 a la vez.
    if (ruta === "/api/cuentas" && req.method === "GET") {
      const ids = (url.searchParams.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 50);
      const cuentas: Record<string, Cuenta> = {};
      // Quien no ve lo de otros días (docs/17) solo recibe las cuentas de hoy.
      for (const id of ids) { const c = this.cuentaGuardada(id); if (c && (q.vista.historial || cuentaDeHoy(c, Date.now()))) cuentas[id] = c; }
      return json({ cuentas });
    }
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
      const b = await cuerpo<{ accion?: string; id?: string; nombre?: string; rol?: string; pin?: string | null; activa?: boolean; areas?: unknown[]; permisos?: unknown[]; area?: unknown; fecha?: unknown; dar?: boolean; horario?: unknown }>();
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
      if (b.accion === "permisos") {
        this.acceso.ponerPermisos(p.id, Array.isArray(b.permisos) ? b.permisos : []);
        this.avisarYo(p.id);
        return json({ ok: true });
      }
      if (b.accion === "horario") {
        // Horario de acceso (docs/17): `null` lo quita. Al administrador no se le pone.
        if (p.rol === ADMIN) return json({ error: "El administrador no tiene horario." }, 400);
        this.acceso.ponerHorario(p.id, b.horario ?? null);
        this.avisarYo(p.id);
        return json({ ok: true });
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
    if (ruta === "/api/admin/qr" && req.method === "GET") return json({ encendido: this.lugares.encendido(), lugares: this.lugares.listar() });
    if (ruta === "/api/admin/qr" && req.method === "POST") {
      // Lugares con código QR y el interruptor de los pedidos por QR (docs/20).
      const b = await cuerpo<{ accion?: string; tipo?: string; numero?: number; cancha?: string; token?: string; activo?: boolean; encendido?: boolean }>();
      if (b.accion === "encender") { this.lugares.encender(!!b.encendido); return json({ ok: true, encendido: this.lugares.encendido() }); }
      if (b.accion === "crear") {
        const r = this.lugares.crear(b.tipo === "cancha" ? "cancha" : "mesa", Math.floor(Number(b.numero)) || undefined, b.cancha === "1" || b.cancha === "2" || b.cancha === "pequena" ? b.cancha : undefined);
        return "error" in r ? json(r, 400) : json({ lugar: r });
      }
      if (b.accion === "rotar" && b.token) { const r = this.lugares.rotar(b.token); return "error" in r ? json(r, 404) : json({ lugar: r }); }
      if (b.accion === "activo" && b.token) { this.lugares.activar(b.token, !!b.activo); return json({ ok: true }); }
      return json({ error: "Acción desconocida." }, 400);
    }
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
      this.suscripciones.quitarDispositivo(revocar);
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

  /**
   * Ruta pública de los pedidos por QR (docs/20). Solo ve la carta (productos activos, sin
   * nada interno) y el estado de las solicitudes de su propio código; nunca cuentas ni la
   * foto. Con límites: interruptor general, código activo, pedidos por minuto y por hora,
   * líneas, unidades y valor.
   */
  private async publico(req: Request, url: URL): Promise<Response> {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type" };
    const responder = (datos: unknown, status = 200) => json(datos, status, cors);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const ruta = url.pathname;
    let token = url.searchParams.get("t") ?? "";
    let cuerpo: { t?: unknown; lineas?: unknown; cliente?: unknown; nota?: unknown } = {};
    if (req.method === "POST") {
      const texto = await req.text();
      if (texto.length > 10_000) return responder({ error: "Pedido demasiado grande." }, 413);
      try { cuerpo = JSON.parse(texto); } catch { return responder({ error: "Pedido dañado." }, 400); }
      token = typeof cuerpo.t === "string" ? cuerpo.t : "";
    }
    const lugar = this.lugares.porToken(token);
    if (!lugar || !lugar.activo) return responder({ error: "Este código no sirve. Pídale ayuda al personal." }, 404);
    const cerrado = !this.lugares.encendido();

    if (ruta === "/api/publico/lugar" && req.method === "GET") {
      const carta = catalogo(this.estado)
        .filter((p) => p.activo && !p.libre && !p.conNombre && (enCuadricula(this.estado, p) || !!p.padre))
        .map((p) => ({ id: p.id, nombre: p.nombre, corto: p.corto, categoria: p.categoria, precio: precioPara(p, lugar.tipo === "cancha" ? "cancha" : undefined), fondo: p.fondo, texto: p.texto, ...(p.padre ? { padre: p.padre } : {}) }))
        .filter((p) => (p.precio ?? 0) > 0);
      return responder({ lugar: { nombre: lugar.nombre }, cerrado, carta: cerrado ? [] : carta });
    }

    if (ruta === "/api/publico/pedido" && req.method === "GET") {
      const s = this.estado.solicitudes?.[url.searchParams.get("id") ?? ""];
      if (!s || s.lugar.token !== token) return responder({ error: "No encontramos ese pedido." }, 404);
      return responder({ estado: s.estado, lineas: s.lineas, ...(s.resuelta?.aceptadas ? { aceptadas: s.resuelta.aceptadas } : {}), ...(s.resuelta?.motivo ? { motivo: s.resuelta.motivo } : {}) });
    }

    if (ruta === "/api/publico/pedido" && req.method === "POST") {
      if (cerrado) return responder({ error: "Ahora no estamos recibiendo pedidos por aquí. Pídale al personal." }, 403);
      const crudas = Array.isArray(cuerpo.lineas) ? cuerpo.lineas.slice(0, TOPE_LINEAS + 1) : [];
      if (!crudas.length || crudas.length > TOPE_LINEAS) return responder({ error: `Escoja entre 1 y ${TOPE_LINEAS} productos.` }, 400);
      const lineas: LineaSolicitud[] = [];
      for (const x of crudas as { producto?: unknown; cantidad?: unknown; nota?: unknown }[]) {
        const p = productoDe(this.estado, String(x?.producto ?? ""));
        const cantidad = Math.floor(Number(x?.cantidad));
        const precio = p ? precioPara(p, lugar.tipo === "cancha" ? "cancha" : undefined) : null;
        if (!p || !p.activo || p.libre || p.conNombre || !precio || !(cantidad > 0) || cantidad > TOPE_UNIDADES) return responder({ error: "Hay un producto que ya no está disponible. Vuelva a abrir la carta." }, 400);
        const nota = typeof x.nota === "string" ? x.nota.trim().slice(0, 60) : "";
        lineas.push({ id: `${crypto.randomUUID()}`, producto: p.id, nombre: p.nombre, precio, cantidad, ...(nota ? { nota } : {}) });
      }
      if (valorSolicitud({ lineas }) > TOPE_VALOR) return responder({ error: "El pedido es muy grande para pedirlo por aquí. Pídale al personal." }, 400);
      const turno = this.lugares.puedePedir(token);
      if (!turno.ok) return responder({ error: `Espere un momento antes de pedir otra vez (${Math.ceil(turno.espera / 1000)} s).`, espera: turno.espera }, 429);
      const id = crypto.randomUUID();
      const op = {
        id: `qr-${id}`, t: "solicitud" as const, persona: `Cliente · ${lugar.nombre}`, en: Date.now(),
        solicitud: {
          id, en: Date.now(), lugar: { token: lugar.token, tipo: lugar.tipo, nombre: lugar.nombre, ...(lugar.numero ? { numero: lugar.numero } : {}), ...(lugar.cancha ? { cancha: lugar.cancha } : {}) }, lineas,
          ...(typeof cuerpo.cliente === "string" && cuerpo.cliente.trim() ? { cliente: cuerpo.cliente.trim().slice(0, 40) } : {}),
          ...(typeof cuerpo.nota === "string" && cuerpo.nota.trim() ? { nota: cuerpo.nota.trim().slice(0, 120) } : {}),
        },
      } satisfies Operacion;
      this.registrarDelServidor(op);
      return responder({ id });
    }
    return responder({ error: "No existe" }, 404);
  }

  /** Una operación que escribe el servidor mismo (la solicitud de un cliente): se aplica, se guarda y se reparte. */
  private registrarDelServidor(op: Operacion) {
    aplicar(this.estado, op);
    this.ctx.storage.transactionSync(() => {
      const { seq } = this.ctx.storage.sql
        .exec<{ seq: number }>("INSERT INTO operaciones (id, persona, datos, recibida_en) VALUES (?, ?, ?, ?) RETURNING seq", op.id, op.persona, JSON.stringify(op), Date.now())
        .one();
      op.seq = seq;
      this.seq = seq;
      this.guardarGeneral(["solicitudes"]);
    });
    this.avisarATodos({ tipo: "op", op, cambios: this.cambiosDe(op) });
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
    // Fuera de su horario no entra (docs/17). Se revisa antes del PIN: no gasta intentos.
    if (!dentroDeHorario(p.horario, Date.now())) return json({ error: mensajeFueraDeHorario(p.horario, Date.now()), horario: true }, 403);
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
    const q = this.quienEs(p.id, disp.id)!;
    return json({ token: await firmarSesion(this.env.FIRMA, p.id, disp.id), persona: p.nombre, base: this.base, ...yoDe(q) });
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
    const quien = this.quienEs(p.id, dispositivo)!;
    // Versión y pendientes que reporta el celular, para «Personas y celulares».
    const antes = (ws.deserializeAttachment() ?? {}) as DeConexion;
    ws.serializeAttachment({
      version: typeof m.version === "string" ? m.version.slice(0, 40) : antes.version,
      pendientes: typeof m.pendientes === "number" && Number.isInteger(m.pendientes) && m.pendientes >= 0 ? m.pendientes : antes.pendientes,
      visto: Date.now(),
    } satisfies DeConexion);
    if (quien.fuera) {
      // Terminó su horario (docs/17): recibe lo que anotó dentro de él y sale.
      if (m.tipo === "ops" && Array.isArray(m.ops) && m.ops.length && !this.esDeOtraBase(m.base, quien.nombre, m.ops.length)) {
        const { aceptadas, rechazadas } = this.recibir(m.ops, quien, await this.autores(m.ops, quien));
        ws.send(JSON.stringify({ tipo: "ok", ids: aceptadas, rechazadas }));
      }
      this.sacarPorHorario(quien.id);
      return;
    }
    if (m.tipo === "hola") ws.send(JSON.stringify({ ...(this.novedades(m.seq, m.base, quien.vista) ?? this.foto(quien.vista)), yo: yoDe(quien) }));
    else if (m.tipo === "ops" && Array.isArray(m.ops)) {
      if (m.ops.length && this.esDeOtraBase(m.base, quien.nombre, m.ops.length)) ws.send(JSON.stringify(this.foto(quien.vista)));
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
