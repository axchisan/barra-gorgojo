// Levanta el Worker real (workerd + Durable Object con SQLite) para probarlo por HTTP y
// WebSocket, igual que lo usa un celular. Ver ADR-09 en docs/03.
//
// Se usa `unstable_startWorker` de Wrangler y no `@cloudflare/vitest-pool-workers`
// porque este todavía exige Vitest 4.

import { unstable_startWorker } from "wrangler";

export const CLAVE = "clave-de-prueba";

export interface Servidor {
  dir: URL;
  entrar(persona: string, clave?: string): Promise<Response>;
  token(persona: string): Promise<string>;
  ops(token: string, ops: unknown[]): Promise<{ ok: string[]; seq: number; estado: any }>;
  foto(token: string): Promise<{ seq: number; estado: any }>;
  /** Abre un WebSocket como un celular y junta lo que llega. */
  conectar(token: string): Promise<{ mensajes: any[]; cerrar(): void }>;
  apagar(): Promise<void>;
}

/**
 * @param catalogo archivo que hace de `#negocio` (por defecto, el de ejemplo)
 * @param persistir carpeta para la base; sin ella, todo vive en memoria
 */
export async function arrancar({ catalogo = "./negocio.ejemplo/catalogo.ts", persistir }: { catalogo?: string; persistir?: string } = {}): Promise<Servidor> {
  const w = await unstable_startWorker({
    config: "wrangler.jsonc",
    build: { alias: { "#negocio": catalogo } },
    bindings: {
      CLAVE: { type: "plain_text", value: CLAVE },
      FIRMA: { type: "plain_text", value: "firma-de-prueba-larga-y-aleatoria" },
    },
    dev: { persist: persistir ?? false, server: { port: 0 }, inspector: false, watch: false, logLevel: "error" },
  });
  const dir = await w.url;
  const pedir = async (ruta: string, init: RequestInit = {}) => {
    const r = await fetch(new URL(ruta, dir), init);
    return r;
  };
  const conToken = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

  const s: Servidor = {
    dir,
    entrar: (persona, clave = CLAVE) =>
      pedir("/api/entrar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona, clave }) }),
    async token(persona) {
      const r = await s.entrar(persona);
      if (!r.ok) throw new Error(`No pudo entrar ${persona}: ${r.status}`);
      return ((await r.json()) as { token: string }).token;
    },
    async ops(token, ops) {
      const r = await pedir("/api/ops", { method: "POST", headers: conToken(token), body: JSON.stringify({ ops }) });
      if (!r.ok) throw new Error(`ops: ${r.status}`);
      return r.json() as never;
    },
    async foto(token) {
      const r = await pedir("/api/foto", { headers: conToken(token) });
      if (!r.ok) throw new Error(`foto: ${r.status}`);
      return r.json() as never;
    },
    conectar(token) {
      const url = new URL(`/api/ws?t=${encodeURIComponent(token)}`, dir);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(url);
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
