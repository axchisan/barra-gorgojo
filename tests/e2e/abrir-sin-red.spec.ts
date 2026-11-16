// La app abre aunque la red se quede colgada (Wi-Fi «conectado sin internet»): el Service
// Worker espera la red un momento y si no responde abre la copia (docs/13, punto 1; RNF-04).
// En localhost la app no registra el Service Worker: aquí se entra por 127.0.0.1.

import { expect, test } from "./prueba";

const DIR = "http://127.0.0.1:8788/";

test("con la red colgada la app abre desde la copia en menos de 3 s", async ({ browser }) => {
  const contexto = await browser.newContext({ serviceWorkers: "allow" });
  const p = await contexto.newPage();
  await p.goto(DIR);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); // ya controlada por el Service Worker
  await expect.poll(() => p.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(p.locator("#raiz > *").first()).toBeVisible();

  // La página no responde nunca (ni falla): así se ve una red sin internet de verdad.
  await contexto.route(DIR, () => { /* colgada */ });
  const inicio = Date.now();
  await p.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });
  await expect(p.locator("#raiz > *").first()).toBeVisible({ timeout: 5_000 });
  expect(Date.now() - inicio).toBeLessThan(3_000);
  await contexto.close();
});
