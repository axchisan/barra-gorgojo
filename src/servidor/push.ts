// Notificaciones push (docs/18 fase 4, diseño en docs/16 §3.1 y ADR-19 en docs/03).
//
// Web Push estándar sin servicios de terceros: el Worker cifra el mensaje (RFC 8291,
// «aes128gcm» de RFC 8188) y firma la petición con VAPID (RFC 8292), todo con WebCrypto.
// La llave VAPID es un secreto (`wrangler secret put VAPID`, una JWK privada P-256); la
// pública sale de ella y se le da al celular para suscribirse.
//
// Las suscripciones viven en una tabla del Durable Object, una por aparato (el `endpoint`
// es del navegador de ese aparato), con la persona que estaba en él al suscribirse o al
// abrir la app por última vez.

const texto = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;

export const b64url = (b: ArrayBuffer | Uint8Array) => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const deB64url = (s: string): Bytes => {
  const limpio = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(limpio + "=".repeat((4 - (limpio.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const juntar = (...partes: Uint8Array[]): Bytes => {
  const r = new Uint8Array(partes.reduce((t, p) => t + p.length, 0));
  let i = 0;
  for (const p of partes) { r.set(p, i); i += p.length; }
  return r;
};

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, largo: number): Promise<Bytes> {
  const llave = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, llave, largo * 8));
}

/** La llave VAPID, del secreto (JWK privada P-256). `null` si no está o no sirve. */
export interface Vapid { privada: CryptoKey; publica: string }

export async function leerVapid(secreto: string | undefined): Promise<Vapid | null> {
  if (!secreto) return null;
  try {
    const jwk = JSON.parse(secreto) as JsonWebKey;
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !jwk.x || !jwk.y) return null;
    const privada = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: jwk.d, x: jwk.x, y: jwk.y, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    return { privada, publica: b64url(juntar(new Uint8Array([4]), deB64url(jwk.x), deB64url(jwk.y))) };
  } catch {
    return null;
  }
}

/** Cabecera `Authorization` de VAPID para un servicio de push (su origen va en `aud`). */
export async function firmaVapid(vapid: Vapid, endpoint: string, contacto: string, ahora = Date.now()): Promise<string> {
  const cabeza = b64url(texto.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const datos = b64url(texto.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(ahora / 1000) + 12 * 3600, sub: contacto })));
  // WebCrypto firma ECDSA en el formato de JWS (r || s, 64 bytes).
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapid.privada, texto.encode(`${cabeza}.${datos}`));
  return `vapid t=${cabeza}.${datos}.${b64url(firma)}, k=${vapid.publica}`;
}

/**
 * Cifra el mensaje para una suscripción (RFC 8291 con «aes128gcm», un solo registro).
 * `p256dh` y `auth` son las llaves que dio el navegador al suscribirse, en base64url.
 */
export async function cifrar(mensaje: string, p256dh: string, auth: string, sal: Bytes = crypto.getRandomValues(new Uint8Array(16))): Promise<Bytes> {
  const delCelular = deB64url(p256dh);
  const secreto = deB64url(auth);
  const propias = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const publicaPropia = new Uint8Array((await crypto.subtle.exportKey("raw", propias.publicKey)) as ArrayBuffer);
  const llaveCelular = await crypto.subtle.importKey("raw", delCelular, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: llaveCelular }, propias.privateKey, 256));
  const ikm = await hkdf(secreto, compartido, juntar(texto.encode("WebPush: info\0"), delCelular, publicaPropia), 32);
  const cek = await hkdf(sal, ikm, texto.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sal, ikm, texto.encode("Content-Encoding: nonce\0"), 12);
  const llave = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02: delimitador del último (y único) registro.
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, llave, juntar(texto.encode(mensaje), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return juntar(sal, rs, new Uint8Array([publicaPropia.length]), publicaPropia, cifrado);
}

/** Lo que muestra la notificación. Nunca datos sensibles: va a la pantalla bloqueada. */
export interface Aviso { titulo: string; cuerpo: string; etiqueta: string; ir: string }

export interface Suscripcion { endpoint: string; p256dh: string; auth: string; dispositivo: string; persona: string }

export type Resultado = "enviado" | "vencida" | "fallo";

/** Manda un aviso a una suscripción. «vencida» (404/410): el navegador ya no la usa, se borra. */
export async function enviar(vapid: Vapid, s: Suscripcion, aviso: Aviso, contacto: string): Promise<Resultado> {
  try {
    const cuerpo = await cifrar(JSON.stringify(aviso), s.p256dh, s.auth);
    // Un aviso nuevo de lo mismo (la misma cuenta) reemplaza al que no se ha entregado.
    const topic = b64url(await crypto.subtle.digest("SHA-256", texto.encode(aviso.etiqueta))).slice(0, 32);
    const r = await fetch(s.endpoint, {
      method: "POST",
      headers: {
        authorization: await firmaVapid(vapid, s.endpoint, contacto),
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        // Un pedido de hace más de 10 minutos ya no se avisa: alguien lo vio en la app.
        ttl: "600",
        urgency: "high",
        topic,
      },
      body: cuerpo,
    });
    if (r.status === 404 || r.status === 410) return "vencida";
    if (!r.ok) console.warn(JSON.stringify({ aviso: "push-fallo", status: r.status, servicio: new URL(s.endpoint).host }));
    return r.ok ? "enviado" : "fallo";
  } catch (e) {
    console.warn(JSON.stringify({ aviso: "push-fallo", error: String(e) }));
    return "fallo";
  }
}

/** Servicios de push conocidos: el `endpoint` lo pone el navegador, pero no se le manda a cualquier dirección. */
const SERVICIOS = [/\.googleapis\.com$/, /\.mozilla\.(com|org)$/, /\.push\.apple\.com$/, /\.notify\.windows\.com$/];

export function endpointValido(endpoint: unknown, permitirLocal = false): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    if (permitirLocal && u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return true;
    return u.protocol === "https:" && SERVICIOS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** Las suscripciones, en la base del Durable Object. */
export class Suscripciones {
  constructor(private sql: SqlStorage) {}

  preparar() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS suscripciones (
      endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
      dispositivo TEXT NOT NULL, persona TEXT NOT NULL, creada INTEGER NOT NULL, ultima INTEGER NOT NULL
    )`);
  }

  /** Guarda o pone al día la suscripción de este aparato (con quien está en él ahora). */
  guardar(s: Suscripcion, ahora = Date.now()) {
    // Un aparato, una suscripción: si el navegador cambió de endpoint, la vieja sobra.
    this.sql.exec("DELETE FROM suscripciones WHERE dispositivo = ? AND endpoint <> ?", s.dispositivo, s.endpoint);
    this.sql.exec(
      `INSERT INTO suscripciones (endpoint, p256dh, auth, dispositivo, persona, creada, ultima) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, dispositivo = excluded.dispositivo, persona = excluded.persona, ultima = excluded.ultima`,
      s.endpoint, s.p256dh, s.auth, s.dispositivo, s.persona, ahora, ahora,
    );
  }

  quitar(endpoint: string) {
    this.sql.exec("DELETE FROM suscripciones WHERE endpoint = ?", endpoint);
  }

  quitarDispositivo(dispositivo: string) {
    this.sql.exec("DELETE FROM suscripciones WHERE dispositivo = ?", dispositivo);
  }

  deDispositivo(dispositivo: string): boolean {
    return this.sql.exec("SELECT 1 FROM suscripciones WHERE dispositivo = ?", dispositivo).toArray().length > 0;
  }

  todas(): Suscripcion[] {
    return this.sql.exec<{ endpoint: string; p256dh: string; auth: string; dispositivo: string; persona: string }>(
      "SELECT endpoint, p256dh, auth, dispositivo, persona FROM suscripciones",
    ).toArray().map((f) => ({ ...f }));
  }

  cuantas(): number {
    return this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM suscripciones").one().n;
  }
}
