// Teclado en pantalla y gesto «atrás» (revisión en aparatos reales, 2026-11-02):
// ✓/Enter hace lo esperable, las barras fijas no se montan sobre el teclado y «atrás»
// cierra la hoja o el menú abierto en vez de sacar a la persona de la pantalla.

import { expect, test, type Browser, type Page } from "@playwright/test";

async function celular(browser: Browser): Promise<Page> {
  const contexto = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  const p = await contexto.newPage();
  await p.goto("/");
  await p.getByRole("button", { name: "Administrador", exact: true }).click();
  await p.locator("input[type=password]").fill("prueba");
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p.locator(".conexion")).toHaveText(/Todo al día/);
  return p;
}
const foco = (p: Page) => p.evaluate(() => document.activeElement?.getAttribute("placeholder") ?? document.activeElement?.tagName);

test("«atrás» cierra la hoja de «Otro» y deja a la persona en la misma pantalla", async ({ browser }) => {
  const p = await celular(browser);
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.locator(".producto.otro").click();
  await expect(p.locator(".hoja")).toBeVisible();
  await p.goBack();
  await expect(p.locator(".hoja")).toHaveCount(0);
  await expect(p.locator(".barra-superior strong")).toHaveText("Nueva cuenta");
  // Y el siguiente «atrás» sí vuelve al inicio.
  await p.goBack();
  await expect(p.locator(".inicio")).toBeVisible();
});

test("en «Otro», ✓ pasa del nombre al valor y el valor agrega; la hoja se cierra sola", async ({ browser }) => {
  const p = await celular(browser);
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.locator(".producto.otro").click();
  await p.locator(".fila-otro input").fill("Picada");
  await p.keyboard.press("Enter");
  expect(await foco(p)).toBe("Otro valor");
  await p.keyboard.type("12000");
  await p.keyboard.press("Enter");
  await expect(p.locator(".hoja")).toHaveCount(0);
  await expect(p.locator(".pie-fijo .principal")).toContainText("12.000");
  // La hoja cerrada desde la pantalla no deja una entrada de más: «atrás» vuelve al inicio.
  await p.goBack();
  await expect(p.locator(".inicio")).toBeVisible();
});

test("«atrás» cierra la hoja del petaco mixto", async ({ browser }) => {
  const p = await celular(browser);
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByRole("button", { name: "Petaco mixto" }).click();
  await expect(p.locator(".hoja")).toBeVisible();
  await p.goBack();
  await expect(p.locator(".hoja")).toHaveCount(0);
  await expect(p.locator(".barra-superior strong")).toHaveText("Nueva cuenta");
});

test("«atrás» cierra el menú; ir a otra pantalla desde el menú no deja pasos de más", async ({ browser }) => {
  const p = await celular(browser);
  await p.locator(".quien").click();
  await expect(p.locator(".menu-persona")).toBeVisible();
  await p.goBack();
  await expect(p.locator(".menu-persona")).toHaveCount(0);
  await expect(p.locator(".inicio")).toBeVisible();

  await p.locator(".quien").click();
  await p.getByRole("button", { name: "Productos y precios" }).click();
  await expect(p.locator(".productos-admin")).toBeVisible();
  await p.goBack();
  await expect(p.locator(".inicio")).toBeVisible();
  await expect(p.locator(".menu-persona")).toHaveCount(0);
});

test("mientras se escribe no hay barras fijas encima del teclado; ✓ las devuelve", async ({ browser }) => {
  const p = await celular(browser);
  await p.locator(".buscar").focus();
  await expect(p.locator(".pestanas")).toBeHidden();
  await expect(p.locator(".pie-fijo")).toBeHidden();
  await p.keyboard.press("Enter");
  expect(await foco(p)).toBe("BODY");
  await expect(p.locator(".pestanas")).toBeVisible();

  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).focus();
  await expect(p.locator(".pie-fijo")).toBeHidden();
  await p.keyboard.press("Enter");
  await expect(p.locator(".pie-fijo")).toBeVisible();
});
