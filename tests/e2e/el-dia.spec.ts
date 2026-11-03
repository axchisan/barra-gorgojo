// Cerrar el día (RF-51), días anteriores (RF-52) y CSV (RF-53), por la pantalla.
import { expect, test } from "@playwright/test";
import { celular } from "./ayuda";

test("se cierra el día con el efectivo contado y el administrador ve el día y baja su CSV", async ({ browser }) => {
  const p = await celular(browser, "Administrador");
  // Una venta en efectivo.
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill("Venta del cierre");
  await p.locator("main > section .producto").first().click();
  await p.locator(".pie-fijo .secundario", { hasText: "Cobrar ya" }).click();
  await p.getByRole("button", { name: "Exacto" }).click();
  await p.locator(".pie-fijo .principal").click();

  await p.locator(".pestanas button").nth(2).click();
  await expect(p.getByRole("button", { name: "Cerrar el día" })).toHaveCount(0); // sin contado no hay cierre
  await p.getByPlaceholder("Efectivo contado").fill("1");
  await p.keyboard.press("Enter");
  await p.getByRole("button", { name: "Cerrar el día" }).click();
  await expect(p.locator(".cierre-hecho")).toContainText("por Administrador: contado $ 1");
  await expect(p.locator(".cierre-hecho")).toContainText("faltaban");

  await p.getByRole("button", { name: "Días anteriores y CSV" }).click();
  const dia = p.locator(".dia-pasado").first();
  await expect(dia).toContainText("Cerrado");
  const descarga = p.waitForEvent("download");
  await dia.getByRole("button", { name: "Descargar CSV" }).click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toMatch(/^barra-\d{4}-\d{2}-\d{2}\.csv$/);
});
