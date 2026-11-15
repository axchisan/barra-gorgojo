// Canchas: una pedida suelta se anota como «adicional» en vez de chico, o se cambia después.
import { expect, test } from "@playwright/test";
import { celular } from "./ayuda";

test("en la cancha se anota un adicional sin que cuente como chico", async ({ browser }) => {
  const p = await celular(browser);
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByRole("button", { name: "Cancha", exact: true }).click();
  await p.getByRole("button", { name: "Cancha 2" }).click();
  const primero = p.locator("main > section .producto").first();
  await primero.click(); await primero.click(); // el chico: 2 Rubia
  await p.locator(".pie-fijo .principal").click();
  await p.locator(".tarjeta", { hasText: "Cancha 2" }).click();
  await p.getByRole("button", { name: "＋ Chico" }).click();
  await p.locator("main > section .producto").first().click();
  await p.getByRole("button", { name: "Adicional", exact: true }).click();
  const anotar = p.locator(".pie-fijo .principal");
  await expect(anotar).toContainText("Anotar adicional");
  for (const b of [p.getByRole("button", { name: "Chico", exact: true }), p.getByRole("button", { name: "Adicional", exact: true }), anotar]) await expect(b).toBeInViewport({ ratio: 1 });
  await p.screenshot({ path: "test-results/capturas/adicional.png" });
  await anotar.click(); // vuelve al detalle de la cuenta
  await expect(p.locator(".cabeza-total .meta")).toContainText("1 chico · 1 adicional");
  await p.getByRole("button", { name: "Chicos" }).click();
  await expect(p.locator(".ronda-tarjeta header strong", { hasText: "Adicional 1" })).toBeVisible();
  // Se distinguen de lejos: etiqueta de color y borde.
  await expect(p.locator(".ronda-tarjeta.adicional .tipo-ronda-etiqueta.adicional")).toContainText("ADICIONAL 1");
  await expect(p.locator(".ronda-tarjeta.chico .tipo-ronda-etiqueta.chico")).toContainText("CHICO 1");
  await p.screenshot({ path: "test-results/capturas/chico-adicional.png" });
  // «Repetir» trae el chico, no el adicional.
  await p.getByRole("button", { name: "＋ Chico" }).click();
  await expect(p.locator(".repetir")).toContainText("Repetir chico: 2 Rubia");
  await p.getByRole("button", { name: "Volver" }).click();
  await p.getByRole("button", { name: "Chicos" }).click();
  // Se cambia después con un toque.
  await p.locator(".ronda-tarjeta", { hasText: "Adicional 1" }).getByRole("button", { name: "Pasar a chico" }).click();
  await expect(p.locator(".cabeza-total .meta")).toContainText("2 chicos");
});

test("una pedida anulada del todo queda plegada y no cuenta", async ({ browser }) => {
  const p = await celular(browser);
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByRole("button", { name: "Cancha", exact: true }).click();
  await p.getByRole("button", { name: "Cancha Pequeña" }).click();
  await p.locator("main > section .producto").first().click();
  await p.locator(".pie-fijo .principal").click();
  await p.locator(".tarjeta", { hasText: "Cancha Pequeña" }).click();
  await p.getByRole("button", { name: "＋ Chico" }).click();
  await p.locator("main > section .producto").first().click();
  await p.getByRole("button", { name: "Adicional", exact: true }).click();
  await p.locator(".pie-fijo .principal").click();
  await p.getByRole("button", { name: "Deshacer" }).click(); // anula lo recién anotado
  await expect(p.locator(".cabeza-total .meta")).toContainText("1 chico");
  await expect(p.locator(".cabeza-total .meta")).not.toContainText("adicional");
  await p.getByRole("button", { name: "Chicos" }).click();
  await expect(p.locator(".ronda-tarjeta")).toHaveCount(1);
  await p.getByRole("button", { name: "▸ Pedidas anuladas (1)" }).click();
  await expect(p.locator(".ronda-tarjeta.anulada")).toContainText("Anulada");
});
