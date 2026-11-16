// Revisión del teléfono vertical (docs/19, hallazgos H2 a H4): 360 × 740, como se usa en el local.
import { expect, test } from "./prueba";
import { celular } from "./ayuda";

const TELEFONO = { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true };

test("teléfono vertical: cabecera con nombre corto, dividir con billetes a la vista y cuentas deslizables con pista", async ({ browser }) => {
  const p = await celular(browser, "Administrador", TELEFONO);

  // H2: con los dos paneles, el nombre va corto y cabe entero.
  const quien = p.locator(".barra-superior .quien");
  await expect(quien.locator(".corto")).toBeVisible();
  await expect(quien.locator(".corto")).toHaveText("Admin.");
  expect(await quien.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);

  // Una cuenta para cobrar.
  // Con nombre propio: en la suite completa hay cuentas de otras pruebas (con abonos, más alto el cobro).
  const nombre = `Teléfono ${Date.now() % 100000}`;
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  const prod = p.locator("main > section .producto").first();
  for (let i = 0; i < 4; i++) await prod.click();
  await p.locator(".pie-fijo .principal").click();
  await p.locator(".tarjeta", { hasText: nombre }).click();
  await p.getByRole("button", { name: "Cobrar" }).click();

  // H3: al dividir, «Exacto» queda a la vista, encima del botón fijo, sin bajar.
  await p.getByRole("button", { name: "Valor" }).click();
  await p.getByRole("button", { name: "👥 Dividir entre varios" }).click();
  const exacto = p.getByRole("button", { name: "Exacto" });
  await expect(exacto).toBeInViewport({ ratio: 1 });
  const fondoExacto = await exacto.evaluate((e) => e.getBoundingClientRect().bottom);
  const topePie = await p.locator(".pie-fijo").evaluate((e) => e.getBoundingClientRect().top);
  expect(fondoExacto).toBeLessThanOrEqual(topePie);

  // H4: la fila de cuentas de «Pedir a la barra» tiene el degradado que avisa que se desliza.
  await p.evaluate(() => history.replaceState({ vista: { v: "inicio", pestana: "cuentas" }, d: 0 }, ""));
  await p.reload();
  await p.locator(".segmentos.panel").getByRole("button", { name: "Comida" }).click();
  await p.getByRole("button", { name: "Pedir a la barra" }).click();
  const mascara = await p.locator(".chips.destinos").evaluate((e) => getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage);
  expect(mascara).toContain("linear-gradient");
});
