// Cobrar (F2 y F3 de docs/12): sugerencias de con cuánto pagan y «Mostrar al cliente»
// sin perder lo escogido.

import { expect, test } from "./prueba";
import { sugerirPago } from "../../src/dominio/pago";
import { celular } from "./ayuda";

const soloDigitos = (s: string) => Number(s.replace(/\D/g, ""));
const miles = (n: number) => n.toLocaleString("es-CO");

test("sugiere con cuánto pagan y «Mostrar al cliente» vuelve al cobro con lo escogido", async ({ browser }) => {
  const p = await celular(browser);
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill("Cliente que mira");
  const primero = p.locator("main > section .producto").first();
  const nombre = (await primero.locator(".corto").innerText()).trim();
  for (let i = 0; i < 3; i++) await primero.click();
  await p.locator(".pie-fijo .principal").click();
  await p.locator(".tarjeta", { hasText: "Cliente que mira" }).click();
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();

  const valor = soloDigitos(await p.locator(".cobrar .total").innerText());
  const sugeridos = sugerirPago(valor);
  await expect(p.locator(".recibido .chip")).toHaveText(["Exacto", ...sugeridos.map((v) => new RegExp(`\\$\\s?${miles(v)}$`))]);

  // Nequi y vuelta a efectivo, luego el billete mayor: el cambio sale al instante.
  const billete = sugeridos[sugeridos.length - 1];
  await p.getByRole("button", { name: "Nequi" }).click();
  await p.getByRole("button", { name: "Efectivo" }).click();
  await p.locator(".recibido .chip").last().click();
  await expect(p.locator(".cobrar .cambio")).toHaveText(new RegExp(`Cambio: \\$\\s?${miles(billete - valor)}`));

  // El cliente ve productos, total, con cuánto paga y el cambio.
  await p.getByRole("button", { name: "Mostrar al cliente" }).click();
  await expect(p.locator("main.cliente h1")).toHaveText("Cliente que mira");
  await expect(p.locator("main.cliente .renglones")).toContainText(new RegExp(`3 ${nombre}`, "i"));
  await expect(p.locator("main.cliente .total-cliente")).toContainText(miles(valor));
  await expect(p.locator("main.cliente .cambio-cliente")).toContainText(miles(billete - valor));

  // Tocar vuelve al cobro con el medio y el billete escogidos.
  await p.locator("main.cliente").click();
  await expect(p.locator(".cobrar > .opciones .chip.activo")).toHaveText("Efectivo");
  await expect(p.locator(".recibido .chip.activo")).toHaveText(new RegExp(miles(billete)));
  await expect(p.locator(".cobrar .cambio")).toContainText(miles(billete - valor));

  // El gesto «atrás» también cierra la vista del cliente sin salir del cobro, aunque se
  // haya abierto y cerrado antes (el «atrás» de cerrar tocando no debe tragarse este).
  await p.getByRole("button", { name: "Mostrar al cliente" }).click();
  await expect(p.locator("main.cliente")).toBeVisible();
  await p.goBack();
  await expect(p.locator("main.cobrar")).toBeVisible();
  await expect(p.locator(".recibido .chip.activo")).toHaveText(new RegExp(miles(billete)));

  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".aviso")).toContainText("Cliente que mira: cobrada");
});
