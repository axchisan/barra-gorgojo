// Levanta el Worker real (workerd + Durable Object con SQLite) para probarlo por HTTP y
// WebSocket, igual que lo usa un celular. Ver ADR-09 en docs/03.
//
// Se usa `unstable_startWorker` de Wrangler y no `@cloudflare/vitest-pool-workers`
// porque este todavía exige Vitest 4.

import { unstable_startWorker } from "wrangler";
import { BASE_ORIGINAL } from "../../src/dominio/base";

/** Llave de instalación de las pruebas: con ella se saca el código para vincular el primer celular. */
export const CLAVE = "clave-de-prueba";
/** PIN con que las pruebas crean y usan las personas. */
export const PIN = "1234";
/** El id de una persona a partir de su nombre (igual que en src/servidor/acceso.ts). */
export const idDe = (nombre: string) =>
  nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

export interface Servidor {
  dir: URL;
  /** Entra con el nombre y el PIN desde el celular de las pruebas (o el de `cookie`). */
  entrar(persona: string, pin?: string, opciones?: { pinNuevo?: string; cookie?: string }): Promise<Response>;
  /** Entra (creando el PIN si la persona no tiene) y devuelve la sesión. */
  token(persona: string, cookie?: string): Promise<string>;
  /** Vincula un celular nuevo y devuelve su cookie. */
  celular(nombre?: string): Promise<string>;
  /** Cookie del celular con que se hacen los pedidos por defecto. */
  cookie: string;
  /** WebSocket crudo con la sesión y la cookie del celular. */
  wsCrudo(token: string, cookie?: string): WebSocket;
  ops(token: string, ops: unknown[], base?: string): Promise<{ ok: string[]; seq: number; estado: any; base: string }>;
  /** Como `ops`, pero devuelve la respuesta cruda (para ver códigos de error). */
  opsCrudo(token: string, ops: unknown[], base?: string): Promise<Response>;
  foto(token: string): Promise<{ seq: number; estado: any; base: string }>;
  /** GET o POST a una ruta de la API con la sesión de `token`. */
  pedir(token: string, ruta: string, init?: RequestInit): Promise<Response>;
  /** Abre un WebSocket como un celular y junta lo que llega. */
  conectar(token: string): Promise<{ mensajes: any[]; cerrar(): void }>;
  apagar(): Promise<void>;
}

/**
 * @param catalogo archivo que hace de `#negocio` (por defecto, el de ejemplo)
 * @param persistir carpeta para la base; sin ella, todo vive en memoria
 */
export async function arrancar({ catalogo = "./negocio.ejemplo/catalogo.ts", persistir, base, migracion }: {
  catalogo?: string; persistir?: string; base?: string; migracion?: string;
} = {}): Promise<Servidor> {
  const w = await unstable_startWorker({
    config: "wrangler.jsonc",
    build: { alias: { "#negocio": catalogo } },
    bindings: {
      CLAVE: { type: "plain_text", value: CLAVE },
      PINES: { type: "plain_text", value: "llave-de-pines-de-prueba" },
      FIRMA: { type: "plain_text", value: "firma-de-prueba-larga-y-aleatoria" },
      // Siempre explícita: las pruebas no dependen de la base vigente en wrangler.jsonc.
      BASE: { type: "plain_text" as const, value: base ?? BASE_ORIGINAL },
      ...(migracion ? { MIGRACION: { type: "plain_text" as const, value: migracion } } : {}),
    },
    dev: { persist: persistir ?? false, server: { port: 0 }, inspector: false, watch: false, logLevel: "error" },
  });
  const dir = await w.url;
  const crudo = (ruta: string, init: RequestInit = {}) => fetch(new URL(ruta, dir), init);
  // Lo que hace un celular nuevo: el administrador saca un código (aquí, con la llave de
  // instalación) y el celular lo cambia por su cookie de dispositivo.
  const vincular = async (nombre = "Celular de pruebas") => {
    const c = await (await crudo("/api/instalacion/codigo", { method: "POST", headers: { "x-llave": CLAVE } })).json() as { codigo: string };
    const r = await crudo("/api/vincular", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo: c.codigo, nombre }) });
    const galleta = r.headers.get("set-cookie")?.split(";")[0];
    if (!r.ok || !galleta) throw new Error(`No se pudo vincular: ${r.status}`);
    return galleta;
  };
  const cookie = await vincular();
  const pedir = (ruta: string, init: RequestInit = {}, galleta = cookie) =>
    crudo(ruta, { ...init, headers: { cookie: galleta, ...(init.headers as Record<string, string> | undefined) } });
  const conToken = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

  const s: Servidor = {
    dir,
    cookie,
    celular: vincular,
    entrar: (persona, pin = PIN, opciones = {}) =>
      pedir("/api/entrar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona: idDe(persona), pin, pinNuevo: opciones.pinNuevo }) }, opciones.cookie),
    async token(persona, galleta) {
      let r = await s.entrar(persona, PIN, { cookie: galleta });
      if (r.status === 409) r = await s.entrar(persona, "", { pinNuevo: PIN, cookie: galleta });
      if (!r.ok) throw new Error(`No pudo entrar ${persona}: ${r.status}`);
      return ((await r.json()) as { token: string }).token;
    },
    wsCrudo(token, galleta = cookie) {
      const url = new URL(`/api/ws?t=${encodeURIComponent(token)}`, dir);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return new WebSocket(url, { headers: { cookie: galleta } } as never);
    },
    opsCrudo: (token, ops, base) => pedir("/api/ops", { method: "POST", headers: conToken(token), body: JSON.stringify({ ops, base }) }),
    async ops(token, ops, base) {
      const r = await s.opsCrudo(token, ops, base);
      if (!r.ok) throw new Error(`ops: ${r.status}`);
      return r.json() as never;
    },
    pedir: (token, ruta, init = {}) => pedir(ruta, { ...init, headers: { ...conToken(token), ...(init.headers as Record<string, string> | undefined) } }),
    async foto(token) {
      const r = await pedir("/api/foto", { headers: conToken(token) });
      if (!r.ok) throw new Error(`foto: ${r.status}`);
      return r.json() as never;
    },
    conectar(token) {
      const ws = s.wsCrudo(token);
      const mensajes: any[] = [];
      ws.addEventListener("message", (e) => mensajes.push(JSON.parse(String(e.data))));
      return new Promise((listo, falla) => {
        ws.addEventListener("open", () => listo({ mensajes, cerrar: () => ws.close() }));
        ws.addEventListener("error", () => falla(new Error("WebSocket")));
      });
    },
    apagar: () => w.dispose(),
  };
  return s;
}

let n = 0;
/** Operación con id único, como las genera un celular. */
export const op = (o: Record<string, unknown>) => ({ id: `prueba-${Date.now()}-${++n}`, en: Date.now(), persona: "quien-sea", ...o });

export const esperar = async (condicion: () => boolean, ms = 5000) => {
  const fin = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > fin) throw new Error("Se acabó la espera");
    await new Promise((r) => setTimeout(r, 20));
  }
};
