// Acceso por persona (fase D), por la pantalla: vincular con el código del administrador,
// crear y escribir el PIN, y lo que cada rol puede hacer.

import { expect, test } from "@playwright/test";
import { celular, entrarComo, teclearPin, PIN } from "./ayuda";

test("el administrador vincula un celular con un código; la persona crea su PIN y él lo ve", async ({ browser }) => {
  const admin = await celular(browser, "Administrador");
  await admin.locator(".quien").click();
  await admin.getByRole("button", { name: "Personas y celulares" }).click();
  await admin.getByRole("button", { name: "Vincular un celular" }).click();
  const codigo = (await admin.locator(".codigo-vincular strong").innerText()).replace(/\D/g, "");
  expect(codigo).toMatch(/^\d{6}$/);

  // El celular nuevo escribe ese código.
  const nuevo = await (await browser.newContext()).newPage();
  await nuevo.goto("/");
  await nuevo.getByLabel("Código de 6 números").fill(codigo);
  await nuevo.getByLabel("Nombre de este celular (opcional)").fill("Celular de Beto");
  await nuevo.getByRole("button", { name: "Vincular celular" }).click();
  // El administrador no está en la lista: entra por «Soy el administrador».
  await expect(nuevo.getByRole("button", { name: "Administrador", exact: true })).toHaveCount(0);
  await nuevo.getByRole("button", { name: "Beto", exact: true }).click();
  await expect(nuevo.locator(".teclado-pin h2")).toHaveText("Beto: cree su PIN");
  await teclearPin(nuevo);
  await expect(nuevo.locator(".conexion")).toHaveText(/Todo al día/);

  // El administrador ve el celular nuevo y el PIN de Beto.
  await admin.reload();
  await expect(admin.locator(".fila-persona", { hasText: "Celular de Beto" })).toBeVisible();
  const fila = admin.locator(".fila-persona", { hasText: /^Beto/ });
  await fila.getByRole("button", { name: "PIN ••••" }).click();
  await expect(fila.getByRole("button", { name: PIN })).toBeVisible();
  // El código ya se usó: no sirve para otro celular.
  const otro = await (await browser.newContext()).newPage();
  await otro.goto("/");
  await otro.getByLabel("Código de 6 números").fill(codigo);
  await otro.getByRole("button", { name: "Vincular celular" }).click();
  await expect(otro.getByRole("alert")).toContainText("El código no sirve");
});

test("un PIN equivocado no entra y dice cuántos intentos quedan", async ({ browser }) => {
  const p = await celular(browser, "Ana"); // Ana crea su PIN aquí
  await p.locator(".quien").click();
  await p.getByRole("button", { name: "Cambiar de persona" }).click();
  await p.getByRole("button", { name: "Ana", exact: true }).click();
  for (const d of "9999") await p.locator(".teclas .tecla", { hasText: new RegExp(`^${d}$`) }).click();
  await expect(p.getByRole("alert")).toContainText("Quedan 4 intentos");
  await p.getByRole("button", { name: "Volver" }).click();
  await entrarComo(p, "Ana");
});

test("un operador no ve «Anular cuenta» en una cuenta con productos; el administrador anula con motivo", async ({ browser }) => {
  const ana = await celular(browser, "Ana");
  await ana.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await ana.getByPlaceholder("Nombre", { exact: true }).fill("Con productos");
  await ana.locator("main > section .producto").first().click();
  await ana.locator(".pie-fijo .principal").click();
  await ana.locator(".tarjeta", { hasText: "Con productos" }).click();
  await ana.getByRole("button", { name: "Más opciones" }).click();
  await expect(ana.getByRole("button", { name: "Anular cuenta" })).toHaveCount(0);

  const admin = await celular(browser, "Administrador");
  await admin.locator(".tarjeta", { hasText: "Con productos" }).click();
  await admin.getByRole("button", { name: "Más opciones" }).click();
  await admin.getByRole("button", { name: "Anular cuenta" }).click();
  const anular = admin.locator(".anular-fila").getByRole("button", { name: "Anular cuenta" });
  await expect(anular).toBeDisabled();
  await admin.getByPlaceholder(/Motivo/).fill("Cuenta repetida");
  await anular.click();
  await expect(admin.locator(".aviso")).toContainText("Con productos: anulada");
  // El celular de Ana también la ve anulada (desaparece de las abiertas).
  await ana.goBack();
  await expect(ana.locator(".tarjeta", { hasText: "Con productos" })).toHaveCount(0);
});
