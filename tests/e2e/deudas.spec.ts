// Deudas (docs/15) por la pantalla: pasar una cuenta a deuda, verla en «Deudas» y recibir un pago.
import { expect, test } from "@playwright/test";
import { celular } from "./ayuda";

const soloDigitos = (s: string) => Number(s.replace(/\D/g, ""));

test("una cuenta pasa a deuda, queda en el panel de deudas y se recibe un pago aparte de la caja", async ({ browser }) => {
  const p = await celular(browser);
  const nombre = `Fiada ${Date.now() % 10000}`;
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  const primero = p.locator("main > section .producto").first();
  await primero.click(); await primero.click();
  await p.locator(".pie-fijo .principal").click();
  await p.locator(".tarjeta", { hasText: nombre }).click();
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  const total = soloDigitos(await p.locator(".cobrar .total").innerText());

  await p.getByRole("button", { name: "📒 Deuda" }).click();
  const boton = p.locator(".pie-fijo .principal");
  await expect(boton).toBeDisabled(); // falta el nombre
  await p.getByLabel("A nombre de quién queda la deuda").fill("Nilson Prueba");
  await p.keyboard.press("Enter");
  await p.screenshot({ path: "/private/tmp/claude-501/-Users-mac-Documents-Dev-Apps-BarraGorgojo/90703138-0f5a-4f3a-93cd-6ca24f4f1d93/scratchpad/a-deuda.png" });
  await boton.click();
  await expect(p.locator(".aviso")).toContainText(`${nombre}: pasada a deuda de Nilson Prueba`);
  await expect(p.locator(".tarjetas .tarjeta", { hasText: nombre })).toHaveCount(0);

  // Panel de deudas.
  await p.getByRole("button", { name: /Administrador ▾/ }).click();
  await p.getByRole("button", { name: "📒 Deudas" }).click();
  const tarjeta = p.locator(".tarjeta.deudor", { hasText: "Nilson Prueba" });
  await expect(tarjeta).toContainText(total.toLocaleString("es-CO"));
  await tarjeta.click();
  await expect(p.locator(".movimiento")).toContainText(`Cuenta «${nombre}»`);
  await p.getByRole("button", { name: "Recibir pago" }).click();
  await p.getByRole("button", { name: "La mitad" }).click();
  const mitad = Math.ceil(total / 2 / 100) * 100;
  await p.locator(".hoja .principal").click();
  await expect(p.locator(".aviso")).toContainText(new RegExp(`debe \\$\\s${(total - mitad).toLocaleString("es-CO").replace(".", "\\.")}`));
  await expect(p.locator(".cabeza-total .total")).toHaveText(new RegExp((total - mitad).toLocaleString("es-CO")));
  await p.screenshot({ path: "/private/tmp/claude-501/-Users-mac-Documents-Dev-Apps-BarraGorgojo/90703138-0f5a-4f3a-93cd-6ca24f4f1d93/scratchpad/deudor.png" });

  // El día: lo fiado cuenta como venta de hoy; el pago va aparte de la caja.
  await p.goBack(); await p.goBack();
  await p.locator(".pestanas button", { hasText: "El día" }).click();
  await expect(p.locator(".cifra.deuda", { hasText: "Fiado hoy" })).toContainText(total.toLocaleString("es-CO"));
  await expect(p.locator(".cifra.deuda", { hasText: "Pagos de deudas" })).toContainText(mitad.toLocaleString("es-CO"));
});
