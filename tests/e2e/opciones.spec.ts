// Opciones de un producto (docs/02): el administrador crea los sabores de la gaseosa de una
// vez; al anotar, un toque es la gaseosa general y mantener presionado deja escoger cuál.
import { expect, test } from "./prueba";
import { celular } from "./ayuda";

const TELEFONO = { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true };

test("sabores de la gaseosa: se crean de una vez y se escogen manteniendo presionado", async ({ browser }) => {
  const p = await celular(browser, "Administrador", TELEFONO);

  // Administración: la gaseosa general → «Varias de una vez» con las de Colombia.
  await p.getByRole("button", { name: /Administrador ▾/ }).click();
  await p.getByRole("button", { name: "Productos y precios" }).click();
  await p.locator(".producto").filter({ has: p.locator(".corto", { hasText: /^GASEOSA$/ }) }).first().click();
  await expect(p.locator(".opciones-producto")).toBeVisible();
  await p.getByRole("button", { name: "＋ Varias de una vez" }).click();
  await expect(p.getByRole("button", { name: /Colombiana/ })).toHaveAttribute("aria-pressed", "true");
  await p.getByRole("button", { name: /^Crear \d+ opciones$/ }).click();
  await expect(p.locator(".fila-opcion", { hasText: "Colombiana (personal)" })).toBeVisible();
  await expect(p.locator(".fila-opcion")).toHaveCount(11);

  // Anotar en el teléfono: un toque = la general; mantener = escoger.
  await p.evaluate(() => history.replaceState({ vista: { v: "inicio", pestana: "cuentas" }, d: 0 }, ""));
  await p.reload();
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  const gaseosa = p.locator("main > section .producto.con-opciones").first();
  await expect(gaseosa.locator(".marca-opciones")).toBeVisible();
  await gaseosa.click(); // toque: 1 gaseosa sin detalle
  await expect(p.locator(".hoja-opciones")).toHaveCount(0);
  await gaseosa.click({ delay: 700 }); // mantener presionado
  const hoja = p.locator(".hoja-opciones");
  await expect(hoja).toBeVisible();
  await hoja.locator(".producto", { hasText: "COLOMBIANA" }).click();
  await hoja.locator(".producto", { hasText: "COLOMBIANA" }).click();
  await hoja.locator(".producto", { hasText: "MANZANA" }).click();
  await expect(hoja.getByRole("button", { name: "Listo · 3" })).toBeVisible();
  await hoja.getByRole("button", { name: "Listo · 3" }).click();
  // El contador del botón general suma la general y las opciones.
  await expect(p.locator("main > section .producto-celda:has(.con-opciones) .contador").first()).toContainText("4");
  await p.locator(".pie-fijo .principal").click();
  await p.locator(".tarjeta").first().click();
  await expect(p.locator(".detalle")).toContainText("Colombiana (personal)");
  await expect(p.locator(".detalle")).toContainText("Manzana (personal)");
});

test("en el computador, el clic derecho abre las opciones", async ({ browser }) => {
  const p = await celular(browser, "Administrador", { viewport: { width: 1366, height: 768 } });
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  const gaseosa = p.locator("main > section .producto.con-opciones").first();
  await gaseosa.click({ button: "right" });
  await expect(p.locator(".hoja-opciones")).toBeVisible();
  await p.keyboard.press("Escape"); // Esc cierra la hoja (docs/02 «Teclado físico»)
  await expect(p.locator(".hoja-opciones")).toHaveCount(0);
  await gaseosa.click();
  await expect(p.locator("main > section .producto-celda:has(.con-opciones) .contador").first()).toContainText("1");
});
