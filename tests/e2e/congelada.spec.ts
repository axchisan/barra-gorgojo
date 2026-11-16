// Visto en la tablet del local (2026-11-15): la pestaña de Chrome escondida tenía la
// conexión, Chrome la congeló, y la app visible no recibía nada. Ahora la pestaña que se
// congela suelta la conexión y la visible la toma.
import { expect, test } from "./prueba";
import { celular } from "./ayuda";

test.setTimeout(90_000);
test("si Chrome congela la pestaña con la conexión, la otra pestaña la toma y recibe lo nuevo", async ({ browser }) => {
  const a = await celular(browser); // primera pestaña: se queda con la conexión
  const b = await a.context().newPage();
  await b.goto("/");
  await expect(b.locator(".inicio")).toBeVisible();
  // La primera se queda colgada con el candado (como la pestaña congelada de la tablet):
  // sin latidos, sin conexión, 22 s (el relevo ocurre a los ~16 s).
  await a.evaluate(() => { setTimeout(() => { const t = Date.now(); while (Date.now() - t < 22_000) { /* colgada */ } }, 0); });

  // Otro aparato anota.
  const otro = await celular(browser);
  const nombre = `Congelada ${Date.now() % 100000}`;
  await otro.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await otro.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  await otro.locator("main > section .producto").first().click();
  await otro.locator(".pie-fijo .principal").click();

  // La segunda pestaña lo recibe: al faltar el latido de la primera, le quita la conexión.
  await b.bringToFront();
  await expect(b.locator(".tarjeta", { hasText: nombre })).toBeVisible({ timeout: 40_000 });
  // Antes de terminar, la primera vuelve a responder: si no, la siguiente prueba arranca con
  // el navegador ocupado.
  await a.evaluate(() => 1);
});
