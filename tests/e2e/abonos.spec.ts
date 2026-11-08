// Abonos por la pantalla: pagar una pedida, dividir entre varios y cobrar el resto.
import { expect, test, type Page } from "@playwright/test";
import { APARATOS, celular } from "./ayuda";

const soloDigitos = (s: string) => Number(s.replace(/\D/g, ""));
const tarjeta = (p: Page, nombre: string) => p.locator(".tarjeta", { hasText: nombre });

async function cuentaConDosPedidas(p: Page, nombre: string) {
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  const primero = p.locator("main > section .producto").first();
  await primero.click(); await primero.click();
  await p.locator(".pie-fijo .principal").click();
  await tarjeta(p, nombre).click();
  await p.getByRole("button", { name: /＋ Pedida/ }).click();
  await p.locator("main > section .producto").nth(1).click();
  await p.locator(".pie-fijo .principal").click();
}

test("un grupo paga por partes: una pedida, la mitad de lo que falta y el resto", async ({ browser }) => {
  const p = await celular(browser);
  const nombre = `Grupo que divide ${Date.now() % 10000}`;
  await cuentaConDosPedidas(p, nombre);
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  const total = soloDigitos(await p.locator(".cobrar .total").innerText());

  // 1. Alguien paga la pedida 1 (dos del primer producto).
  await p.getByRole("button", { name: "Productos" }).click();
  await p.locator(".abono-ronda-cabeza", { hasText: "Pedida 1" }).click();
  const boton = p.locator(".pie-fijo .principal");
  await expect(boton).toHaveText(/^Abonar /);
  const pedida1 = soloDigitos(await boton.innerText());
  await p.getByRole("button", { name: "Exacto" }).click();
  await p.getByPlaceholder("¿Quién paga? (opcional)").fill("Juan");
  await p.keyboard.press("Enter"); // ✓ del teclado: lo baja y vuelve el botón
  await boton.click();
  await expect(p.locator(".aviso")).toContainText("abono de Juan");
  await expect(p.locator(".cobrar .abonado")).toContainText("Juan");
  // En el siguiente abono, «Juan» sale para tocarlo sin escribir.
  await p.getByRole("button", { name: "Valor" }).click();
  await expect(p.locator(".quien-paga .chip", { hasText: "Juan" })).toBeVisible();
  await p.getByRole("button", { name: "Todo" }).click();
  await expect(p.locator(".cobrar .total")).toHaveText(new RegExp((total - pedida1).toLocaleString("es-CO")));
  await expect(p.locator(".cobrar .abonado")).toContainText(pedida1.toLocaleString("es-CO"));

  // 2. Otro paga la mitad de lo que falta por Nequi.
  const falta = total - pedida1;
  await p.getByRole("button", { name: "Valor" }).click();
  await p.getByRole("button", { name: /^Entre 2/ }).click();
  const mitad = Math.ceil(falta / 2 / 100) * 100;
  await p.getByRole("button", { name: "Nequi" }).click();
  await expect(boton).toHaveText(new RegExp(`Abonar .*${mitad.toLocaleString("es-CO")}`));
  await boton.click();
  await expect(p.locator(".cobrar .total")).toHaveText(new RegExp((falta - mitad).toLocaleString("es-CO")));

  // 3. El último paga el resto: queda cobrada.
  await p.getByRole("button", { name: "Efectivo" }).click();
  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".aviso")).toContainText(`${nombre}: cobrada`);
  await expect(tarjeta(p, nombre)).toHaveCount(0);
  await p.getByRole("button", { name: /Cerradas hoy/ }).click();
  await p.locator(".tarjeta.cerrada", { hasText: nombre }).click();
  await expect(p.locator(".estado.cobrada")).toContainText("nequi");
});

test("el detalle muestra los abonos y lo pagado; «Deshacer» deshace solo ese abono", async ({ browser }) => {
  const p = await celular(browser);
  const nombre = `Con abono ${Date.now() % 10000}`;
  await cuentaConDosPedidas(p, nombre);
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  const total = soloDigitos(await p.locator(".cobrar .total").innerText());
  await p.getByRole("button", { name: "Productos" }).click();
  await p.locator(".abono-ronda-cabeza", { hasText: "Pedida 2" }).click();
  await p.getByRole("button", { name: "Nequi" }).click();
  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".aviso")).toContainText("abono");

  await p.goBack();
  await expect(p.locator(".estado.abonada")).toContainText("falta");
  await expect(p.locator(".abono-fila")).toHaveCount(1);
  await p.getByRole("button", { name: "Pedidas" }).click();
  await expect(p.locator(".ficha.pagada")).toHaveCount(1);

  await p.locator(".abono-fila").getByRole("button", { name: "Deshacer" }).click();
  await expect(p.locator(".abono-fila")).toHaveCount(0);
  await expect(p.locator(".cabeza-total .total")).toHaveText(new RegExp(total.toLocaleString("es-CO")));
  // Se cobra todo: no queda una cuenta abierta que les cambie las medidas a otras pruebas.
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".aviso")).toContainText(`${nombre}: cobrada`);
});

// Capturas de los modos de abono en los tamaños reales (solo con AUDITORIA_SALIDA).
for (const [aparato, viewport] of Object.entries(APARATOS)) {
  test(`abonos a la vista · ${aparato}`, async ({ browser }) => {
    const salida = process.env.AUDITORIA_SALIDA;
    test.skip(!salida, "solo para capturas");
    const p = await celular(browser, "Administrador", { viewport, hasTouch: true, isMobile: true });
    const nombre = `Abonos ${aparato}`;
    await cuentaConDosPedidas(p, nombre);
    await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
    await p.getByRole("button", { name: "Productos" }).click();
    await p.locator(".abono-ronda-cabeza", { hasText: "Pedida 1" }).click();
    await p.screenshot({ path: `${salida}/${aparato}-productos.png` });
    await p.getByRole("button", { name: "Valor" }).click();
    await p.getByRole("button", { name: /^Entre 3/ }).click();
    await p.screenshot({ path: `${salida}/${aparato}-valor.png` });
    await p.context().close();
  });
}
