// Auditoría y celulares conectados (E4 de docs/12), por la pantalla.
import { expect, test } from "@playwright/test";
import { celular } from "./ayuda";

test("el administrador ve el día en la auditoría, con lo delicado resaltado, y los celulares conectados", async ({ browser }) => {
  const admin = await celular(browser, "Administrador");
  const ana = await celular(browser, "Ana");
  const nombre = `Auditada ${Date.now() % 10000}`;

  // Ana abre y anota; el administrador anula la cuenta con motivo.
  await ana.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await ana.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  await ana.locator("main > section .producto").first().click();
  await ana.locator(".pie-fijo .principal").click();
  await admin.locator(".tarjeta", { hasText: nombre }).click({ timeout: 15_000 });
  await admin.getByRole("button", { name: "Más opciones" }).click();
  await admin.getByRole("button", { name: "Anular cuenta" }).click();
  await admin.getByPlaceholder(/Motivo/).fill("prueba de auditoría");
  await admin.locator(".anular-fila").getByRole("button", { name: "Anular cuenta" }).click();
  await expect(admin.locator(".aviso")).toContainText("anulada");

  await admin.locator(".quien").click();
  await admin.getByRole("button", { name: "Auditoría" }).click();
  const evento = (texto: RegExp) => admin.locator(".evento", { hasText: texto }).filter({ hasText: nombre });
  await expect(evento(/Anuló la cuenta .*motivo: prueba de auditoría/)).toHaveClass(/revisar/);
  await expect(evento(/Anotó 1 /).filter({ hasText: "Ana" })).toBeVisible();
  if (process.env.AUDITORIA_SALIDA) await admin.screenshot({ path: `${process.env.AUDITORIA_SALIDA}/auditoria.png` });
  await admin.getByRole("button", { name: /^Para revisar/ }).click();
  await expect(admin.locator(".evento").filter({ hasText: /Anotó/ }).filter({ hasText: nombre })).toHaveCount(0);
  await expect(evento(/Anuló la cuenta/)).toBeVisible();

  // Celulares conectados.
  await admin.goBack();
  await admin.locator(".quien").click();
  await admin.getByRole("button", { name: "Personas y celulares" }).click();
  await expect(admin.locator(".conexion-celular.en-linea").filter({ hasText: "Ana" }).first()).toBeVisible();
  if (process.env.AUDITORIA_SALIDA) await admin.screenshot({ path: `${process.env.AUDITORIA_SALIDA}/celulares.png`, fullPage: true });

  // Un operador no tiene la entrada.
  await ana.locator(".quien").click();
  await expect(ana.getByRole("button", { name: "Auditoría" })).toHaveCount(0);
});
