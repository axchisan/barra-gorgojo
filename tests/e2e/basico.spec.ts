// Lo mínimo de extremo a extremo (A4): entrar, abrir, anotar y cobrar; dos celulares
// que se ven al instante; anotar sin señal y que llegue al volver.
// Corre contra `pnpm e2e:servidor` (catálogo de ejemplo, base nueva). Cada celular se
// vincula con un código y entra con su PIN (tests/e2e/ayuda.ts).

import { expect, test, type Page } from "@playwright/test";
import { celular } from "./ayuda";

const soloDigitos = (s: string) => Number(s.replace(/\D/g, ""));

/** Abre una cuenta con nombre y le anota `veces` toques del primer producto. Devuelve el valor. */
async function abrirYAnotar(p: Page, nombre: string, veces: number): Promise<number> {
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  const primero = p.locator("main > section .producto").first();
  const precio = soloDigitos(await primero.locator(".precio").innerText());
  for (let i = 0; i < veces; i++) await primero.click();
  await p.locator(".pie-fijo .principal").click();
  return precio * veces;
}

const tarjeta = (p: Page, nombre: string) => p.locator(".tarjeta", { hasText: nombre });

test("entrar, abrir una cuenta, anotar y cobrar", async ({ browser }) => {
  const p = await celular(browser);
  const valor = await abrirYAnotar(p, "Grupo de prueba", 3);
  expect(valor).toBeGreaterThan(0);

  await expect(tarjeta(p, "Grupo de prueba").locator(".valor")).toHaveText(new RegExp(`\\$\\s?${valor.toLocaleString("es-CO")}`));
  await tarjeta(p, "Grupo de prueba").click();
  await expect(p.locator(".cabeza-total .total")).toContainText(valor.toLocaleString("es-CO"));

  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  await p.getByRole("button", { name: "Exacto" }).click();
  await expect(p.locator(".cambio")).toHaveText(/Cambio: \$\s?0/);
  await p.locator(".pie-fijo .principal").click();

  await expect(p.locator(".aviso")).toContainText("Grupo de prueba: cobrada");
  await expect(tarjeta(p, "Grupo de prueba")).toHaveCount(0);
  await p.getByRole("button", { name: /Cerradas hoy/ }).click();
  await expect(p.locator(".tarjeta.cerrada", { hasText: "Grupo de prueba" })).toContainText("Cobrada");
  await expect(p.locator(".conexion")).toHaveText(/Todo al día/);
});

test("dos celulares ven lo mismo al instante", async ({ browser }) => {
  const a = await celular(browser, "Administrador");
  const b = await celular(browser, "Apoyo");

  const valor = await abrirYAnotar(a, "Mesa compartida", 2);
  await expect(tarjeta(b, "Mesa compartida").locator(".valor")).toContainText(valor.toLocaleString("es-CO"), { timeout: 5_000 });

  // B anota en la misma cuenta y A lo ve.
  await tarjeta(b, "Mesa compartida").click();
  await b.getByRole("button", { name: /＋ Pedida/ }).click();
  const primero = b.locator("main > section .producto").first();
  const precio = soloDigitos(await primero.locator(".precio").innerText());
  await primero.click();
  await b.locator(".pie-fijo .principal").click();
  await expect(tarjeta(a, "Mesa compartida").locator(".valor")).toContainText((valor + precio).toLocaleString("es-CO"), { timeout: 5_000 });
});

test("lo anotado sin señal se ve enseguida y llega al servidor al volver la señal", async ({ browser }) => {
  const a = await celular(browser, "Administrador");
  const b = await celular(browser, "Apoyo");

  await a.context().setOffline(true);
  const valor = await abrirYAnotar(a, "Sin señal", 4);

  // La interfaz no espera la red: la cuenta aparece ya en el celular que anotó.
  await expect(tarjeta(a, "Sin señal").locator(".valor")).toContainText(valor.toLocaleString("es-CO"));
  await expect(a.locator(".conexion")).toContainText(/por enviar|Enviando/, { timeout: 15_000 });
  // El otro celular todavía no la tiene.
  await b.waitForTimeout(1_500);
  await expect(tarjeta(b, "Sin señal")).toHaveCount(0);

  await a.context().setOffline(false);
  await expect(tarjeta(b, "Sin señal").locator(".valor")).toContainText(valor.toLocaleString("es-CO"), { timeout: 15_000 });
  await expect(a.locator(".conexion")).toHaveText(/Todo al día/, { timeout: 15_000 });
  // Llegó una sola vez.
  await expect(tarjeta(b, "Sin señal")).toHaveCount(1);
});
