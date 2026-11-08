// Canchas: una pedida suelta se anota como «adicional» en vez de chico, o se cambia después.
import { expect, test } from "@playwright/test";
import { celular } from "./ayuda";

test("en la cancha se anota un adicional sin que cuente como chico", async ({ browser }) => {
  const p = await celular(browser);
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByRole("button", { name: "Cancha", exact: true }).click();
  await p.getByRole("button", { name: "Cancha 2" }).click();
  await p.locator("main > section .producto").first().click();
  await p.locator(".pie-fijo .principal").click();
  await p.locator(".tarjeta", { hasText: "Cancha 2" }).click();
  await p.getByRole("button", { name: "＋ Chico" }).click();
  await p.locator("main > section .producto").first().click();
  await p.getByRole("button", { name: "Adicional", exact: true }).click();
  const anotar = p.locator(".pie-fijo .principal");
  await expect(anotar).toContainText("Anotar adicional");
  for (const b of [p.getByRole("button", { name: "Chico", exact: true }), p.getByRole("button", { name: "Adicional", exact: true }), anotar]) await expect(b).toBeInViewport({ ratio: 1 });
  await p.screenshot({ path: "/private/tmp/claude-501/-Users-mac-Documents-Dev-Apps-BarraGorgojo/90703138-0f5a-4f3a-93cd-6ca24f4f1d93/scratchpad/adicional.png" });
  await anotar.click(); // vuelve al detalle de la cuenta
  await expect(p.locator(".cabeza-total .meta")).toContainText("1 chico · 1 adicional");
  await p.getByRole("button", { name: "Chicos" }).click();
  await expect(p.locator(".ronda-tarjeta header strong", { hasText: "Adicional 1" })).toBeVisible();
  // Se cambia después con un toque.
  await p.locator(".ronda-tarjeta", { hasText: "Adicional 1" }).getByRole("button", { name: "Es chico" }).click();
  await expect(p.locator(".cabeza-total .meta")).toContainText("2 chicos");
});
