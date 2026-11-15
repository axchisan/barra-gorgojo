// Editar una pedida ya anotada por la pantalla: agregar productos y cambiar uno por otro;
// queda en la auditoría como edición (2026-11-15).
import { expect, test } from "@playwright/test";
import { celular } from "./ayuda";

test("en el detalle se agrega a una pedida y se cambia un producto por otro; la auditoría lo muestra como edición", async ({ browser }) => {
  const p = await celular(browser);
  const nombre = `Para editar ${Date.now() % 10000}`;
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  await p.locator("main > section .producto", { hasText: "RUBIA" }).click();
  await p.locator("main > section .producto", { hasText: "RUBIA" }).click();
  await p.locator(".pie-fijo .principal").click();
  await p.locator(".tarjeta", { hasText: nombre }).click();
  await p.getByRole("button", { name: "Pedidas" }).click();

  // Agregar a la pedida 1.
  await p.getByRole("button", { name: "Agregar a la pedida 1" }).click();
  const hoja = p.locator(".elegir-productos");
  await hoja.locator(".producto", { hasText: "ROJA" }).click();
  await hoja.locator(".producto", { hasText: "ROJA" }).click();
  await hoja.getByRole("button", { name: /^Agregar 2/ }).click();
  await expect(p.locator(".aviso")).toContainText("Agregado a la pedida 1");
  const pedida = p.locator(".ronda-tarjeta", { hasText: "Pedida 1" });
  await expect(pedida.locator(".ficha", { hasText: "Roja" })).toContainText("＋");
  await expect(p.locator(".ronda-tarjeta")).toHaveCount(1); // no es una pedida nueva

  // Cambiar las 2 Rubia por Light.
  await pedida.locator(".ficha", { hasText: "Rubia" }).click();
  await p.getByRole("button", { name: "⇄ Cambiar por otro producto" }).click();
  await p.locator(".elegir-productos .producto", { hasText: "LIGHT" }).click();
  await expect(p.locator(".aviso")).toContainText("Cambiado: 2 Rubia → Light");
  await expect(pedida.locator(".ficha.anulada", { hasText: "Rubia" })).toContainText("→ Light");
  await expect(pedida.locator(".ficha:not(.anulada)", { hasText: "Light" })).toContainText("2");
  await p.screenshot({ path: "test-results/capturas/editar-pedida.png" });

  // Auditoría: dos ediciones de la pedida 1.
  await p.getByRole("button", { name: "Volver" }).click();
  await p.getByRole("button", { name: /Administrador ▾/ }).click();
  await p.getByRole("button", { name: "Auditoría" }).click();
  await expect(p.getByText(/Editó la pedida 1: agregó 2 Roja/)).toBeVisible();
  await expect(p.getByText(/Editó la pedida 1: cambió 2 Rubia por Light/)).toBeVisible();

  // Se cobra: no deja cuentas abiertas que les cambien las medidas a otras pruebas.
  await p.getByRole("button", { name: "Volver" }).click();
  await p.locator(".tarjeta", { hasText: nombre }).click();
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".aviso")).toContainText(`${nombre}: cobrada`);
});
