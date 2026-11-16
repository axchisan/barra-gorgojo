// Teclado físico en el portátil (docs/02 «Teclado físico», docs/18 fase 2).
import { expect, test } from "./prueba";
import { celular } from "./ayuda";

const PORTATIL = { viewport: { width: 1366, height: 768 }, hasTouch: false, isMobile: false }; // sin lo táctil del perfil «Pixel 5» de las pruebas

test("en el portátil se anota y se cobra con el teclado", async ({ browser }) => {
  const p = await celular(browser, "Administrador", PORTATIL);
  // «?» muestra los atajos; Esc los cierra.
  await p.keyboard.press("?");
  await expect(p.locator(".hoja-atajos")).toBeVisible();
  await p.keyboard.press("Escape");
  await expect(p.locator(".hoja-atajos")).toHaveCount(0);

  // N: cuenta nueva; «4rub» resalta la Rubia; Enter suma 4; «lig» Enter suma 1 Light.
  await p.keyboard.press("n");
  await expect(p.locator(".anotar")).toBeVisible();
  const nombre = `Teclado ${Date.now() % 100000}`;
  await p.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  await p.keyboard.press("Escape"); // sale del campo, sin salir de la pantalla
  await expect(p.locator(".anotar")).toBeVisible();
  await p.keyboard.type("4rub");
  await expect(p.locator(".tecleado")).toContainText("4 Rubia");
  await expect(p.locator(".producto.resaltado")).toContainText("RUBIA");
  await p.keyboard.press("Enter");
  await p.keyboard.type("lig");
  await p.keyboard.press("Enter");
  await expect(p.locator(".pie-fijo .principal")).toContainText("5");
  await p.keyboard.press("Control+Enter");

  // En el inicio: «/» busca; la cuenta se abre con su número; C cobra.
  await expect(p.locator(".inicio")).toBeVisible();
  await p.keyboard.press("/");
  await expect(p.locator(".inicio input.buscar")).toBeFocused();
  await p.keyboard.type(nombre);
  await p.keyboard.press("Escape"); // sale del buscador
  await p.keyboard.press("1");
  // En el portátil, la cuenta se abre en el panel de la derecha, sin dejar la lista.
  await expect(p.locator(".dos-columnas .panel-cuenta .detalle")).toContainText(nombre);
  await expect(p.locator(".dos-columnas .col-lista .tarjeta", { hasText: nombre })).toBeVisible();
  await p.keyboard.press("c");
  await expect(p.locator(".cobrar")).toBeVisible();
  await p.keyboard.press("Escape");
  await expect(p.locator(".detalle")).toBeVisible();

  // Cobrar con el teclado: N y E escogen el medio; los números son «con cuánto paga».
  await p.keyboard.press("c");
  await p.keyboard.press("n");
  await expect(p.locator(".cobrar .medios .chip.activo")).toHaveText("Nequi");
  await p.keyboard.press("e");
  await expect(p.locator(".cobrar .medios .chip.activo")).toHaveText("Efectivo");
  await p.keyboard.type("50000");
  await expect(p.locator(".cobrar .cambio")).toContainText("Cambio");
  await p.keyboard.press("Control+Enter");
  await expect(p.locator(".cobrar")).toHaveCount(0);
  await expect(p.locator(".aviso")).toContainText("cobrada");
  // Esc cierra el panel.
  await expect(p.locator(".panel-cuenta .detalle")).toBeVisible();
  await p.keyboard.press("Escape");
  await expect(p.locator(".panel-cuenta .detalle")).toHaveCount(0);
});

test("en el celular nada cambia: escribir no abre nada sin teclado físico en uso", async ({ browser }) => {
  const p = await celular(browser, "Administrador", { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill("rub"); // escribir en un campo no busca productos
  await expect(p.locator(".tecleado")).toHaveCount(0);
  await expect(p.locator(".producto.resaltado")).toHaveCount(0);
});
