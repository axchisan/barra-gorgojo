// Conflictos de docs/04 con tres celulares de verdad (E6): uno sin señal anota en una
// cuenta que otro cobra; uno sin señal cobra una cuenta que otro ya cobró.
import { expect, test, type Page } from "./prueba";
import { celular } from "./ayuda";

const tarjeta = (p: Page, nombre: string) => p.locator(".tarjeta", { hasText: nombre });

async function abrirYAnotar(p: Page, nombre: string) {
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  await p.locator("main > section .producto").first().click();
  await p.locator(".pie-fijo .principal").click();
}
async function cobrar(p: Page, nombre: string) {
  await tarjeta(p, nombre).click();
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  await p.getByRole("button", { name: "Exacto" }).click();
  await p.locator(".pie-fijo .principal").click();
}

test("tres celulares: A anota sin señal mientras B cobra; al volver A, la cuenta se reabre con saldo en todos", async ({ browser }) => {
  const a = await celular(browser, "Ana");
  const b = await celular(browser, "Beto");
  const c = await celular(browser, "Administrador");
  const nombre = `Conflicto ${Date.now() % 10000}`;
  await abrirYAnotar(b, nombre);
  await expect(tarjeta(a, nombre)).toBeVisible({ timeout: 15_000 });
  await expect(tarjeta(c, nombre)).toBeVisible({ timeout: 15_000 });

  await a.context().setOffline(true);
  await tarjeta(a, nombre).click();
  await a.getByRole("button", { name: /＋ Pedida/ }).click();
  await a.locator("main > section .producto").first().click();
  await a.locator(".pie-fijo .principal").click();
  await a.locator(".detalle .atras").click(); // de vuelta al inicio

  await cobrar(b, nombre);
  await expect(tarjeta(c, nombre)).toHaveCount(0, { timeout: 15_000 }); // cobrada: sale de las abiertas

  await a.context().setOffline(false);
  for (const p of [a, b, c]) {
    await expect(tarjeta(p, nombre)).toBeVisible({ timeout: 20_000 });
    await expect(tarjeta(p, nombre)).toContainText("Anotaron después del cobro");
  }
  // Se cobra el saldo: no queda una cuenta abierta que les cambie las medidas a otras pruebas.
  await cobrar(b, nombre);
  await expect(tarjeta(c, nombre)).toHaveCount(0, { timeout: 15_000 });
});

test("tres celulares: A cobra sin señal una cuenta que B ya cobró; al volver, A ve quién la cobró", async ({ browser }) => {
  const a = await celular(browser, "Ana");
  const b = await celular(browser, "Beto");
  const c = await celular(browser, "Administrador");
  const nombre = `Cobro doble ${Date.now() % 10000}`;
  await abrirYAnotar(c, nombre);
  await expect(tarjeta(a, nombre)).toBeVisible({ timeout: 15_000 });
  await expect(tarjeta(b, nombre)).toBeVisible({ timeout: 15_000 });

  await a.context().setOffline(true);
  await cobrar(a, nombre);
  await cobrar(b, nombre);
  await expect(tarjeta(c, nombre)).toHaveCount(0, { timeout: 15_000 });

  await a.context().setOffline(false);
  const aviso = a.locator(".aviso.rechazo");
  await expect(aviso).toContainText(`${nombre} ya la cobró Beto`, { timeout: 20_000 });
  await expect(aviso).toContainText("devuélvala");
  // Una sola vez cobrada para todos.
  await c.getByRole("button", { name: /Cerradas hoy/ }).click();
  await expect(c.locator(".tarjeta.cerrada", { hasText: nombre })).toHaveCount(1);
});
