// Acceso por persona (fase D de docs/12; ver docs/03 «Acceso y seguridad» y ADR-10).
//
// Dos llaves: el celular está **vinculado** (un código de 6 dígitos que genera el
// administrador → token de dispositivo en una cookie HttpOnly; en la base solo su hash)
// y la persona escribe su **PIN** de 4 dígitos. El PIN se guarda **cifrado** (AES-GCM con
// el secreto `PINES`), no con hash, porque el negocio quiere que el administrador pueda
// verlo. Bloqueo de 5 minutos tras 5 PIN fallidos por persona y celular.

const MIN = 60_000;
export const BLOQUEO_INTENTOS = 5;
export const BLOQUEO_MS = 5 * MIN;
export const VIGENCIA_CODIGO_MS = 10 * MIN;
export const ADMIN = "admin";
export type Rol = "admin" | "operador";

export interface Persona {
  id: string;
  nombre: string;
  rol: Rol;
  color: string;
  activa: boolean;
  tienePin: boolean;
}

const COLORES = ["#C8312A", "#2F7D3A", "#1F4E8C", "#8E44AD", "#9A6410", "#2E6B7A", "#7A1F1C", "#5B3A1E"];

// ── Utilidades de Web Crypto ──────────────────────────────────────────

const b64u = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export const aleatorio = (bytes = 32) => b64u(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256(texto: string): Promise<string> {
  return b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
}

export function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function llaveAes(secreto: string): Promise<CryptoKey> {
  const bruta = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`pines:${secreto}`));
  return crypto.subtle.importKey("raw", bruta, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function cifrar(secreto: string, texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await llaveAes(secreto), new TextEncoder().encode(texto));
  return `${b64u(iv)}.${b64u(c)}`;
}

export async function descifrar(secreto: string, cifrado: string): Promise<string> {
  const [iv, c] = cifrado.split(".");
  const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64u(iv) }, await llaveAes(secreto), deB64u(c));
  return new TextDecoder().decode(plano);
}

export const esPin = (x: unknown): x is string => typeof x === "string" && /^\d{4}$/.test(x);

/** Código de 6 dígitos, uniforme (sin sesgo de módulo). */
export function codigoSeisDigitos(): string {
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= 4_294_000_000);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

export const idDePersona = (nombre: string) =>
  nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "persona";

// ── Sesiones firmadas: persona, celular y vencimiento ─────────────────

const DURACION_SESION = 60 * 24 * 3600_000;

async function hmac(llave: string, texto: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(llave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(texto)));
}

export async function firmarSesion(firma: string, persona: string, dispositivo: string): Promise<string> {
  const cuerpo = `${persona}.${dispositivo}.${Date.now() + DURACION_SESION}`;
  return `${cuerpo}.${await hmac(firma, cuerpo)}`;
}

export async function leerSesion(firma: string, token: string | null): Promise<{ persona: string; dispositivo: string } | null> {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 4) return null;
  const [persona, dispositivo, vence, f] = partes;
  if (!(Number(vence) > Date.now())) return null;
  if (!igualesEnTiempoConstante(await hmac(firma, `${persona}.${dispositivo}.${vence}`), f)) return null;
  return { persona, dispositivo };
}

// ── La parte guardada en el Durable Object ────────────────────────────

type FilaPersona = { id: string; nombre: string; rol: Rol; color: string; activa: number; pin: string | null };

export class Acceso {
  constructor(private sql: SqlStorage, private secretoPines: string) {}

  /** Crea las tablas; si no hay personas, siembra las del negocio (la primera con rol admin). */
  preparar(semilla: readonly string[]) {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, rol TEXT NOT NULL, color TEXT NOT NULL,
      activa INTEGER NOT NULL DEFAULT 1, pin TEXT, creada INTEGER NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS dispositivos (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, creado INTEGER NOT NULL,
      por TEXT NOT NULL, ultimo_uso INTEGER, revocado INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS codigos (codigo_hash TEXT PRIMARY KEY, vence INTEGER NOT NULL, por TEXT NOT NULL, usado INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS intentos (persona TEXT NOT NULL, dispositivo TEXT NOT NULL, fallos INTEGER NOT NULL, hasta INTEGER, PRIMARY KEY (persona, dispositivo))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS intentos_vincular (ventana INTEGER PRIMARY KEY, fallos INTEGER NOT NULL)`);
    const hay = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM personas").one().n;
    if (hay > 0) return;
    semilla.forEach((nombre, i) => {
      const rol: Rol = nombre === "Administrador" ? ADMIN : "operador";
      this.sql.exec("INSERT INTO personas (id, nombre, rol, color, activa, pin, creada) VALUES (?, ?, ?, ?, 1, NULL, ?)",
        idDePersona(nombre), nombre, rol, COLORES[i % COLORES.length], Date.now());
    });
  }

  private fila(id: string): FilaPersona | undefined {
    return this.sql.exec<FilaPersona>("SELECT id, nombre, rol, color, activa, pin FROM personas WHERE id = ?", id).toArray()[0];
  }

  persona(id: string): Persona | undefined {
    const f = this.fila(id);
    return f && { id: f.id, nombre: f.nombre, rol: f.rol, color: f.color, activa: !!f.activa, tienePin: !!f.pin };
  }

  personas(): Persona[] {
    return this.sql.exec<FilaPersona>("SELECT id, nombre, rol, color, activa, pin FROM personas ORDER BY creada, nombre").toArray()
      .map((f) => ({ id: f.id, nombre: f.nombre, rol: f.rol, color: f.color, activa: !!f.activa, tienePin: !!f.pin }));
  }

  /** Para la pantalla del administrador: cada persona con su PIN. */
  async personasConPin(): Promise<(Persona & { pin: string | null })[]> {
    const filas = this.sql.exec<FilaPersona>("SELECT id, nombre, rol, color, activa, pin FROM personas ORDER BY creada, nombre").toArray();
    return Promise.all(filas.map(async (f) => ({
      id: f.id, nombre: f.nombre, rol: f.rol, color: f.color, activa: !!f.activa, tienePin: !!f.pin,
      pin: f.pin ? await descifrar(this.secretoPines, f.pin) : null,
    })));
  }

  crearPersona(nombre: string, rol: Rol): Persona | { error: string } {
    const n = nombre.trim().slice(0, 30);
    if (!n) return { error: "Escriba el nombre." };
    const id = idDePersona(n);
    if (this.fila(id)) return { error: "Ya hay una persona con ese nombre." };
    const total = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM personas").one().n;
    this.sql.exec("INSERT INTO personas (id, nombre, rol, color, activa, pin, creada) VALUES (?, ?, ?, ?, 1, NULL, ?)", id, n, rol, COLORES[total % COLORES.length], Date.now());
    return this.persona(id)!;
  }

  activar(id: string, activa: boolean) {
    this.sql.exec("UPDATE personas SET activa = ? WHERE id = ?", activa ? 1 : 0, id);
  }

  async ponerPin(id: string, pin: string | null) {
    this.sql.exec("UPDATE personas SET pin = ? WHERE id = ?", pin ? await cifrar(this.secretoPines, pin) : null, id);
    this.sql.exec("DELETE FROM intentos WHERE persona = ?", id);
  }

  /** Revisa el PIN. Cuenta los fallos por persona y celular, y bloquea 5 minutos al quinto. */
  async revisarPin(id: string, dispositivo: string, pin: string, ahora = Date.now()):
    Promise<{ ok: true } | { ok: false; motivo: "inactiva" | "sin-pin" | "bloqueada" | "mal"; quedan?: number; hasta?: number }> {
    const f = this.fila(id);
    if (!f || !f.activa) return { ok: false, motivo: "inactiva" };
    if (!f.pin) return { ok: false, motivo: "sin-pin" };
    const i = this.sql.exec<{ fallos: number; hasta: number | null }>("SELECT fallos, hasta FROM intentos WHERE persona = ? AND dispositivo = ?", id, dispositivo).toArray()[0];
    if (i?.hasta && i.hasta > ahora) return { ok: false, motivo: "bloqueada", hasta: i.hasta };
    if (esPin(pin) && igualesEnTiempoConstante(await descifrar(this.secretoPines, f.pin), pin)) {
      this.sql.exec("DELETE FROM intentos WHERE persona = ? AND dispositivo = ?", id, dispositivo);
      return { ok: true };
    }
    const fallos = (i?.hasta && i.hasta <= ahora ? 0 : i?.fallos ?? 0) + 1;
    const hasta = fallos >= BLOQUEO_INTENTOS ? ahora + BLOQUEO_MS : null;
    this.sql.exec("INSERT INTO intentos (persona, dispositivo, fallos, hasta) VALUES (?, ?, ?, ?) ON CONFLICT (persona, dispositivo) DO UPDATE SET fallos = excluded.fallos, hasta = excluded.hasta",
      id, dispositivo, hasta ? 0 : fallos, hasta);
    return hasta ? { ok: false, motivo: "bloqueada", hasta } : { ok: false, motivo: "mal", quedan: BLOQUEO_INTENTOS - fallos };
  }

  // ── Celulares ───────────────────────────────────────────────────────

  async crearCodigo(por: string, ahora = Date.now()): Promise<{ codigo: string; vence: number }> {
    this.sql.exec("DELETE FROM codigos WHERE vence < ?", ahora - VIGENCIA_CODIGO_MS);
    const codigo = codigoSeisDigitos();
    const vence = ahora + VIGENCIA_CODIGO_MS;
    this.sql.exec("INSERT OR REPLACE INTO codigos (codigo_hash, vence, por, usado) VALUES (?, ?, ?, NULL)", await sha256(codigo), vence, por);
    return { codigo, vence };
  }

  /**
   * Cambia un código vigente y sin usar por un token de dispositivo. Frena el ensayo y
   * error: más de 10 códigos equivocados en 10 minutos apagan la vinculación ese rato.
   */
  async vincular(codigo: string, nombre: string, ahora = Date.now()): Promise<{ token: string; id: string } | { error: string; status: number }> {
    const ventana = Math.floor(ahora / VIGENCIA_CODIGO_MS);
    const fallos = this.sql.exec<{ fallos: number }>("SELECT fallos FROM intentos_vincular WHERE ventana = ?", ventana).toArray()[0]?.fallos ?? 0;
    if (fallos >= 10) return { error: "Demasiados códigos equivocados. Espere unos minutos.", status: 429 };
    const h = await sha256(String(codigo).trim());
    const c = this.sql.exec<{ vence: number; usado: number | null; por: string }>("SELECT vence, usado, por FROM codigos WHERE codigo_hash = ?", h).toArray()[0];
    if (!c || c.usado || c.vence < ahora) {
      this.sql.exec("INSERT INTO intentos_vincular (ventana, fallos) VALUES (?, 1) ON CONFLICT (ventana) DO UPDATE SET fallos = fallos + 1", ventana);
      return { error: "El código no sirve. Pídale uno nuevo al administrador.", status: 400 };
    }
    this.sql.exec("UPDATE codigos SET usado = ? WHERE codigo_hash = ?", ahora, h);
    const token = aleatorio(32);
    const id = `cel-${aleatorio(6)}`;
    this.sql.exec("INSERT INTO dispositivos (id, nombre, token_hash, creado, por, ultimo_uso, revocado) VALUES (?, ?, ?, ?, ?, ?, NULL)",
      id, (nombre || "Celular").trim().slice(0, 40), await sha256(token), ahora, c.por, ahora);
    return { token, id };
  }

  /** El celular de este token, si existe y no fue quitado. */
  async dispositivo(token: string | null, ahora = Date.now()): Promise<{ id: string; nombre: string } | null> {
    if (!token) return null;
    const d = this.sql.exec<{ id: string; nombre: string; revocado: number | null; ultimo_uso: number | null }>(
      "SELECT id, nombre, revocado, ultimo_uso FROM dispositivos WHERE token_hash = ?", await sha256(token)).toArray()[0];
    if (!d || d.revocado) return null;
    if (!d.ultimo_uso || ahora - d.ultimo_uso > 60_000) this.sql.exec("UPDATE dispositivos SET ultimo_uso = ? WHERE id = ?", ahora, d.id);
    return { id: d.id, nombre: d.nombre };
  }

  /** Por id, sin token: para revisar en cada mensaje del WebSocket que no lo hayan quitado. */
  dispositivoActivo(id: string): boolean {
    return this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM dispositivos WHERE id = ? AND revocado IS NULL", id).one().n > 0;
  }

  dispositivos() {
    return this.sql.exec<{ id: string; nombre: string; creado: number; por: string; ultimo_uso: number | null; revocado: number | null }>(
      "SELECT id, nombre, creado, por, ultimo_uso, revocado FROM dispositivos ORDER BY creado").toArray();
  }

  revocar(id: string, ahora = Date.now()) {
    this.sql.exec("UPDATE dispositivos SET revocado = ? WHERE id = ? AND revocado IS NULL", ahora, id);
  }
}
