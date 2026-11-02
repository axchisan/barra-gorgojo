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
  // Al entrar desaparece el campo de la clave: las barras no pueden quedar escondidas.
  await expect(p.locator(".pestanas")).toBeVisible();
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
  // El campo desapareció con la hoja: el pie tiene que volver a verse.
  await expect(p.locator(".pie-fijo .principal")).toBeVisible();
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

test("en la tablet vertical, abrir el teclado no cambia el diseño; girarla sí", async ({ browser }) => {
  // Tablet de la barra en vertical, app instalada: 686 × 1030.
  const contexto = await browser.newContext({ viewport: { width: 686, height: 1030 }, hasTouch: true, isMobile: true });
  const p = await contexto.newPage();
  await p.goto("/");
  await p.getByRole("button", { name: "Administrador", exact: true }).click();
  await p.locator("input[type=password]").fill("prueba");
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p.locator(".conexion")).toHaveText(/Todo al día/);
  const clases = () => p.evaluate(() => document.documentElement.className);

  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  expect(await clases()).not.toContain("apaisada");
  await p.getByPlaceholder("Nombre", { exact: true }).focus();
  // El teclado encoge el área visible: queda más ancha que alta.
  await p.setViewportSize({ width: 686, height: 681 });
  await p.waitForTimeout(200);
  expect(await clases(), "con el teclado abierto el diseño no cambia").not.toContain("apaisada");
  await expect(p.locator(".resumen-pedida")).toBeHidden();

  // Se cierra el teclado: vuelve el tamaño y sigue igual.
  await p.keyboard.press("Enter");
  await p.setViewportSize({ width: 686, height: 1030 });
  await p.waitForTimeout(600);
  expect(await clases()).not.toContain("apaisada");

  // Girar de verdad sí cambia al diseño horizontal.
  await p.setViewportSize({ width: 1097, height: 654 });
  await p.waitForTimeout(200);
  expect(await clases()).toContain("apaisada");
  await expect(p.locator(".resumen-pedida")).toBeVisible();
  await contexto.close();
});

test("celular girado: la lista de la pedida se desliza dentro del panel y no tapa la cabecera", async ({ browser }) => {
  // El celular del negocio girado, en la app: 768 × 301.
  const contexto = await browser.newContext({ viewport: { width: 768, height: 301 }, hasTouch: true, isMobile: true });
  const p = await contexto.newPage();
  await p.goto("/");
  await p.getByRole("button", { name: "Administrador", exact: true }).click();
  await p.locator("input[type=password]").fill("prueba");
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p.locator(".conexion")).toHaveText(/Todo al día/);
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  const productos = p.locator("main > section .producto:not(.otro)");
  for (let i = 0; i < 10; i++) await productos.nth(i).click();

  const m = await p.evaluate(() => {
    const cab = document.querySelector(".barra-superior")!.getBoundingClientRect();
    const lista = document.querySelector<HTMLElement>(".resumen-pedida")!;
    const r = lista.getBoundingClientRect();
    const boton = document.querySelector(".pie-fijo .principal")!.getBoundingClientRect();
    return { cabecera: cab.height, cabAbajo: cab.bottom, listaArriba: r.top, listaAbajo: r.bottom, botonArriba: boton.top,
      seDesliza: lista.scrollHeight > lista.clientHeight && getComputedStyle(lista).overflowY === "auto", alto: innerHeight };
  });
  expect(m.cabecera, "cabecera baja en el celular girado").toBeLessThanOrEqual(44);
  expect(m.listaArriba, "la lista no se sube sobre la cabecera").toBeGreaterThanOrEqual(m.cabAbajo - 1);
  expect(m.listaAbajo, "la lista no se mete debajo de los botones").toBeLessThanOrEqual(m.botonArriba + 1);
  expect(m.seDesliza, "con muchos productos la lista se desliza").toBe(true);
  // Y deslizarla funciona.
  await p.locator(".resumen-pedida").evaluate((e) => e.scrollTo(0, e.scrollHeight));
  expect(await p.locator(".resumen-pedida").evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  await contexto.close();
});
