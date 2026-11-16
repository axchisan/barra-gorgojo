// Memoria del celular en IndexedDB (E2 de docs/12): lo de la versión 0.1 (localStorage)
// se trae sin perder ni duplicar; lo pendiente sobrevive a cerrar la app sin señal; y con
// varias pestañas, una sola tiene la conexión y las demás anotan a través de ella.

import { expect, test, type Page, type WebSocket } from "./prueba";
import { celular, sesionApi } from "./ayuda";

/** Lo que hay en la cola de IndexedDB, como `t:cuenta`. */
const colaGuardada = (p: Page) =>
  p.evaluate(() => new Promise<string[]>((listo, falla) => {
    const r = indexedDB.open("barra-gorgojo");
    r.onerror = () => falla(r.error);
    r.onsuccess = () => {
      const q = r.result.transaction("pendientes").objectStore("pendientes").getAll();
      q.onsuccess = () => { listo(q.result.map((f: { op: { t: string; cuenta?: string } }) => `${f.op.t}:${f.op.cuenta ?? ""}`)); r.result.close(); };
    };
  }));

const llavesViejas = (p: Page) => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("bg.")).sort());

async function abrirYAnotar(p: Page, nombre: string) {
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  await p.locator("main > section .producto").first().click();
  await p.locator(".pie-fijo .principal").click();
}
const tarjeta = (p: Page, nombre: string) => p.locator(".tarjeta", { hasText: nombre });

test("lo de la versión 0.1 en localStorage pasa a IndexedDB y llega al servidor una sola vez", async ({ browser }) => {
  const contexto = await browser.newContext();
  const { token, base } = await sesionApi(contexto.request);
  const ahora = Date.now();
  const cuenta = `vieja-ls-${ahora}`;
  const pendientes = [
    { id: `ls-abrir-${ahora}`, t: "abrir", cuenta, nombre: "Anotada en la 0.1", tipo: "grupo", persona: "Administrador", en: ahora },
    { id: `ls-anotar-${ahora}`, t: "anotar", cuenta, ronda: "r1", persona: "Administrador", en: ahora, lineas: [{ id: "l1", producto: "rubia", cantidad: 3 }] },
  ];
  await contexto.addInitScript(({ token, base, pendientes }) => {
    if (sessionStorage.getItem("preparado")) return; // solo la primera carga
    sessionStorage.setItem("preparado", "1");
    localStorage.setItem("bg.sesion", JSON.stringify({ token, persona: "Administrador", rol: "admin" }));
    localStorage.setItem("bg.base", JSON.stringify(base));
    localStorage.setItem("bg.pendientes", JSON.stringify(pendientes));
    localStorage.setItem("bg.clave", JSON.stringify("clave-vieja"));
  }, { token, base, pendientes });

  const p = await contexto.newPage();
  await p.goto("/");
  await expect(tarjeta(p, "Anotada en la 0.1")).toBeVisible();
  await expect(p.locator(".conexion")).toHaveText(/Todo al día/);
  expect(await llavesViejas(p)).toEqual(["bg.base"]); // la base se queda, por si una pestaña vieja sigue abierta
  await expect.poll(() => colaGuardada(p)).toEqual([]); // la escritura en IndexedDB es asíncrona: se espera

  // En el servidor, una vez; al recargar, nada se repite.
  await p.reload();
  await expect(p.locator(".conexion")).toHaveText(/Todo al día/);
  await expect(tarjeta(p, "Anotada en la 0.1")).toHaveCount(1);
  const foto = (await (await contexto.request.get("/api/foto", { headers: { authorization: `Bearer ${token}` } })).json()) as { estado: { cuentas: Record<string, { rondas: unknown[] }> } };
  expect(foto.estado.cuentas[cuenta].rondas).toHaveLength(1);
  await contexto.close();
});

test("lo anotado sin señal queda en IndexedDB, sobrevive a cerrar la app y sale al volver", async ({ browser }) => {
  const p = await celular(browser);
  const otro = await celular(browser, "Apoyo");
  await p.context().setOffline(true);
  await abrirYAnotar(p, "Cerrada sin señal");
  await expect.poll(() => colaGuardada(p)).toEqual([expect.stringMatching(/^abrir:/), expect.stringMatching(/^anotar:/)]);
  await p.close();

  await p.context().setOffline(false);
  const p2 = await p.context().newPage();
  await p2.goto("/");
  await expect(tarjeta(p2, "Cerrada sin señal")).toBeVisible();
  await expect(tarjeta(otro, "Cerrada sin señal")).toBeVisible({ timeout: 15_000 });
  await expect(p2.locator(".conexion")).toHaveText(/Todo al día/);
  expect(await colaGuardada(p2)).toEqual([]);
  await expect(tarjeta(otro, "Cerrada sin señal")).toHaveCount(1);
});

test("con dos pestañas, una sola tiene la conexión; la otra anota por ella y la releva al cerrarse", async ({ browser }) => {
  const a = await celular(browser);
  const otro = await celular(browser, "Apoyo");
  const abiertos = new Map<Page, Set<WebSocket>>();
  const vigilar = (p: Page) => {
    abiertos.set(p, new Set());
    p.on("websocket", (ws) => {
      if (!ws.url().includes("/api/ws")) return;
      abiertos.get(p)!.add(ws);
      ws.on("close", () => abiertos.get(p)!.delete(ws));
    });
  };
  vigilar(a);
  const b = await a.context().newPage();
  vigilar(b);
  await b.goto("/");
  // La segunda pestaña entra sola: la sesión está en la memoria compartida.
  await expect(b.locator(".conexion")).toHaveText(/Todo al día/);
  await b.waitForTimeout(1500);
  expect(abiertos.get(b)!.size, "la pestaña nueva no abre otra conexión").toBe(0);

  // Lo que anota la pestaña sin conexión sale por la otra y se ve en todas.
  await abrirYAnotar(b, "Desde la otra pestaña");
  await expect(tarjeta(otro, "Desde la otra pestaña")).toBeVisible({ timeout: 15_000 });
  await expect(tarjeta(a, "Desde la otra pestaña")).toBeVisible();
  await expect(b.locator(".conexion")).toHaveText(/Todo al día/);

  // Lo que llega del servidor también se ve en la pestaña sin conexión.
  await abrirYAnotar(otro, "Desde otro celular");
  await expect(tarjeta(b, "Desde otro celular")).toBeVisible({ timeout: 15_000 });

  // Al cerrar la pestaña con la conexión, la otra la toma.
  await a.close();
  await expect.poll(() => abiertos.get(b)!.size, { timeout: 15_000 }).toBe(1);
  await abrirYAnotar(b, "Después del relevo");
  await expect(tarjeta(otro, "Después del relevo")).toBeVisible({ timeout: 15_000 });
});

test("al volver a abrir la app pide solo lo nuevo (novedades), no la foto completa", async ({ browser }) => {
  const a = await celular(browser);
  const b = await celular(browser, "Apoyo");
  await abrirYAnotar(a, "Antes de cerrar");
  await expect(tarjeta(b, "Antes de cerrar")).toBeVisible({ timeout: 15_000 });
  await expect(b.locator(".conexion")).toHaveText(/Todo al día/);
  const contexto = b.context();
  await b.close();

  // Mientras la app está cerrada, el otro celular anota.
  await abrirYAnotar(a, "Con la app cerrada");
  await abrirYAnotar(a, "También cerrada");

  const b2 = await contexto.newPage();
  const recibidos: string[] = [];
  b2.on("websocket", (ws) => ws.on("framereceived", (f) => { const t = String(f.payload); if (t.startsWith("{")) recibidos.push(JSON.parse(t).tipo); }));
  b2.on("response", async (r) => { if (r.url().endsWith("/api/ops")) recibidos.push(((await r.json().catch(() => ({}))) as { tipo?: string }).tipo ?? "foto"); });
  await b2.goto("/");
  await expect(tarjeta(b2, "Con la app cerrada")).toBeVisible({ timeout: 15_000 });
  await expect(tarjeta(b2, "También cerrada")).toBeVisible();
  await expect(tarjeta(b2, "Antes de cerrar")).toBeVisible();
  await expect(b2.locator(".conexion")).toHaveText(/Todo al día/);
  expect(recibidos).toContain("novedades");
  expect(recibidos).not.toContain("foto");
});
