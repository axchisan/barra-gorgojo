// Deuda 1 de docs/16 (regla 3): una anotación no se pierde aunque la app se recargue en el
// mismo instante en que se anota, antes de que IndexedDB termine de guardarla.
import { expect, test } from "./prueba";
import { celular, sesionApi } from "./ayuda";

test("anotar y recargar en el mismo instante: la cuenta no se pierde y llega al servidor una vez", async ({ browser }) => {
  const p = await celular(browser);
  const nombre = `Recarga ${Date.now() % 100000}`;
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre").fill(nombre);
  await p.locator("main > section .producto").first().click();
  // Lo peor: sin señal y con IndexedDB que no alcanza a escribir (el sistema mató la app, o la
  // base del navegador está bloqueada) justo al anotar; después la app se vuelve a abrir.
  await p.evaluate(() => {
    IDBDatabase.prototype.transaction = function () { throw new DOMException("bloqueada", "InvalidStateError"); };
    WebSocket.prototype.send = function () { /* sin señal */ };
    window.fetch = () => Promise.reject(new TypeError("sin señal"));
    (document.querySelector(".pie-fijo .principal") as HTMLButtonElement).click();
  });
  await p.waitForTimeout(300);
  await p.reload();
  await expect(p.locator(".tarjeta", { hasText: nombre })).toBeVisible({ timeout: 10_000 });
  await expect(p.locator(".conexion")).toHaveText(/Todo al día/, { timeout: 10_000 });
  // En el servidor, una sola vez.
  const { token } = await sesionApi(p.context().request);
  const foto = await (await p.context().request.get("/api/foto", { headers: { authorization: `Bearer ${token}` } })).json() as { estado: { cuentas: Record<string, { nombre: string; lineas: unknown[] }> } };
  const suyas = Object.values(foto.estado.cuentas).filter((c) => c.nombre === nombre);
  expect(suyas).toHaveLength(1);
  expect(suyas[0].lineas).toHaveLength(1);
  // Y el respaldo síncrono queda vacío cuando ya está en IndexedDB.
  await expect.poll(() => p.evaluate(() => localStorage.getItem("barra.respaldo-pendientes"))).toBeNull();
});
