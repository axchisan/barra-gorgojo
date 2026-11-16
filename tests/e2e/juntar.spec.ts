// Juntar dos cuentas para cobrarlas juntas, por la pantalla (docs/04 «Juntar cuentas»).
import { expect, test, type Page } from "./prueba";
import { celular } from "./ayuda";

const soloDigitos = (s: string) => Number(s.replace(/\D/g, ""));
async function cuenta(p: Page, nombre: string, toques: number) {
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  const primero = p.locator("main > section .producto").first();
  for (let i = 0; i < toques; i++) await primero.click();
  await p.locator(".pie-fijo .principal").click();
}

test("se junta una cuenta con otra, se cobran juntas y la de origen queda cerrada", async ({ browser }) => {
  const p = await celular(browser);
  const n = Date.now() % 10000;
  const uno = `Los de rojo ${n}`, dos = `Los de azul ${n}`;
  await cuenta(p, uno, 2);
  await cuenta(p, dos, 1);
  const valor = async (nombre: string) => soloDigitos(await p.locator(".tarjeta", { hasText: nombre }).locator(".valor").innerText());
  const suma = (await valor(uno)) + (await valor(dos));

  await p.locator(".tarjeta", { hasText: dos }).click();
  await p.getByRole("button", { name: "Más opciones" }).click();
  await p.getByRole("button", { name: "Juntar con otra cuenta" }).click();
  await p.locator(".hoja .tarjeta", { hasText: uno }).click();
  await expect(p.locator(".barra-superior strong")).toHaveText(uno);
  await expect(p.locator(".cabeza-total .total")).toHaveText(new RegExp(suma.toLocaleString("es-CO")));
  await expect(p.locator(".aviso")).toContainText(`${dos} quedó junto con ${uno}`);
  await expect(p.locator(".estado.juntas")).toContainText(dos);
  // En «Pedidas», la que vino de la otra cuenta lo dice, sutil, con quién y a qué hora (2026-11-16).
  await p.getByRole("button", { name: "Pedidas", exact: true }).click();
  await expect(p.locator(".ronda-tarjeta.juntada")).toHaveCount(1);
  await expect(p.locator(".ronda-tarjeta.juntada .marca-juntada")).toContainText(new RegExp(`Se unió de ${dos} · \\S+, \\d`));
  await expect(p.locator(".ronda-tarjeta:not(.juntada) .marca-juntada")).toHaveCount(0);
  await p.screenshot({ path: "test-results/juntada-marca.png" });

  // En la lista ya no sale la de origen; se cobra la junta y queda cerrada.
  await p.goBack();
  await expect(p.locator(".tarjetas .tarjeta", { hasText: dos })).toHaveCount(0);
  await p.locator(".tarjeta", { hasText: uno }).click();
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  await p.getByRole("button", { name: "Exacto" }).click();
  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".aviso")).toContainText(`${uno}: cobrada`);
  await p.getByRole("button", { name: /Cerradas hoy/ }).click();
  await expect(p.locator(".tarjeta.cerrada", { hasText: dos })).toContainText(`Junto con ${uno}`);
});
