// Avisos (F4 de docs/12): arriba, sin tapar botones de venta; se van solos, se quitan
// tocándolos o deslizándolos, uno nuevo reemplaza al anterior y los rechazos del
// servidor se quedan hasta que se toquen.

import { expect, test, type Page } from "./prueba";
import { APARATOS, celular } from "./ayuda";

/** Abre una cuenta con un producto: deja el aviso «Anotado · Deshacer». */
async function anotar(p: Page, nombre: string) {
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  await p.locator("main > section .producto").first().click();
  await p.locator(".pie-fijo .principal").click();
}

/** ¿El aviso se monta sobre algo con que se vende? Solo puede quedar sobre la barra superior. */
const tapa = (p: Page) =>
  p.evaluate(() => {
    // En la posición normal, arriba: con muchas cuentas la lista puede quedar desplazada y
    // el buscador pasa por debajo de la cabecera (y del aviso), que no es tapar la venta.
    scrollTo(0, 0);
    const a = document.querySelector(".aviso")!.getBoundingClientRect();
    const venta = [...document.querySelectorAll(".pie-fijo button, .pestanas button, .tarjeta, .producto, .chip, main input")];
    return venta.filter((e) => {
      const b = e.getBoundingClientRect();
      // Con la misma tolerancia de 4 px que se le da abajo frente a la barra superior (la
      // altura del texto cambia un poco con la fuente del sistema: Roboto, SF).
      return b.width > 0 && b.left < a.right && b.right > a.left && b.top < a.bottom - 4 && b.bottom > a.top + 4;
    }).map((e) => e.textContent?.trim().slice(0, 20) || `<${e.tagName.toLowerCase()} class="${e.className}">`);
  });

test("el aviso va arriba, no tapa la venta, se quita tocándolo o deslizándolo y uno nuevo reemplaza al anterior", async ({ browser }) => {
  const p = await celular(browser);
  await anotar(p, "Aviso uno");
  const aviso = p.locator(".aviso");
  await expect(aviso).toContainText("Deshacer");
  expect(await tapa(p)).toEqual([]);

  // Tocarlo lo quita.
  await aviso.locator("span").first().click();
  await expect(aviso).toHaveCount(0);

  // Deslizarlo hacia un lado lo quita.
  await anotar(p, "Aviso dos");
  const b = (await aviso.boundingBox())!;
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await p.mouse.down();
  await p.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2, { steps: 4 });
  await p.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2, { steps: 4 });
  await p.mouse.up();
  await expect(aviso).toHaveCount(0);

  // Uno nuevo reemplaza al anterior: nunca hay dos.
  await anotar(p, "Aviso tres");
  await expect(aviso).toHaveCount(1);
  await p.locator(".tarjeta", { hasText: "Aviso tres" }).click();
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  await p.getByRole("button", { name: "Exacto" }).click();
  await p.locator(".pie-fijo .principal").click();
  await expect(aviso).toHaveCount(1);
  await expect(aviso).toContainText("Aviso tres: cobrada");

  // «Deshacer» sigue sirviendo.
  await aviso.getByRole("button", { name: "Deshacer" }).click();
  await expect(aviso).toHaveCount(0);
  await expect(p.locator(".tarjeta", { hasText: "Aviso tres" })).toBeVisible();
});

test("sin «Deshacer» se va en unos 2,5 s; con «Deshacer», en unos 6 s", async ({ browser }) => {
  const p = await celular(browser);
  await anotar(p, "Con deshacer");
  const aviso = p.locator(".aviso");
  await expect(aviso).toBeVisible();
  await p.waitForTimeout(4000);
  await expect(aviso).toBeVisible();
  await expect(aviso).toHaveCount(0, { timeout: 3000 });

  await p.locator(".pestanas button", { hasText: "El día" }).click();
  await p.getByPlaceholder("Efectivo contado").fill("0");
  await p.keyboard.press("Enter");
  await p.getByRole("button", { name: "Cerrar el día" }).click();
  await expect(aviso).toContainText("Día cerrado");
  const desde = Date.now();
  await expect(aviso).toHaveCount(0, { timeout: 4000 });
  expect(Date.now() - desde).toBeLessThan(3500);
});

test("lo que el servidor no aceptó se queda hasta tocarlo, aunque llegue otro aviso", async ({ browser }) => {
  const p = await celular(browser, "Ana");
  // Una operación de catálogo en la cola de un operador: el servidor la rechaza (fase D).
  await p.evaluate(() => {
    const op = { id: crypto.randomUUID(), t: "producto", persona: "ana", en: Date.now(), producto: { id: "colada", nombre: "Colada", corto: "COLADA", categoria: "otro", precio: 1000, activo: true, fondo: "#000000", texto: "#FFFFFF" } };
    localStorage.setItem("bg.pendientes", JSON.stringify([op]));
  });
  await p.reload();
  const aviso = p.locator(".aviso.rechazo");
  await expect(aviso).toContainText("No se hizo");
  await p.waitForTimeout(3500);
  await expect(aviso).toBeVisible();

  // Otro aviso lo reemplaza un momento; al irse, vuelve el rechazo.
  await anotar(p, "Encima del rechazo");
  await expect(p.locator(".aviso")).toContainText("Anotado");
  await p.locator(".aviso span").first().click();
  await expect(aviso).toContainText("No se hizo");

  await aviso.click();
  await expect(p.locator(".aviso")).toHaveCount(0);
});

for (const [aparato, viewport] of Object.entries(APARATOS)) {
  test(`el aviso no tapa la venta · ${aparato}`, async ({ browser }) => {
    const p = await celular(browser, "Administrador", { viewport, hasTouch: true, isMobile: true });
    await anotar(p, `Aviso ${aparato}`);
    await expect(p.locator(".aviso")).toBeVisible();
    expect(await tapa(p)).toEqual([]);
    // Cabe en la franja de la barra superior.
    const sobra = await p.evaluate(() => document.querySelector(".aviso")!.getBoundingClientRect().bottom - document.querySelector(".barra-superior")!.getBoundingClientRect().bottom);
    expect(sobra).toBeLessThanOrEqual(4);
    await p.context().close();
  });
}
