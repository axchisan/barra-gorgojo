// Cerrar el día (RF-51), días anteriores (RF-52) y CSV (RF-53), por la pantalla.
import { expect, test } from "@playwright/test";
import { celular, sesionApi } from "./ayuda";

test("se cierra el día con el efectivo contado y el administrador ve el día y baja su CSV", async ({ browser }) => {
  const p = await celular(browser, "Administrador");
  // Una venta en efectivo.
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill("Venta del cierre");
  await p.locator("main > section .producto").first().click();
  await p.locator(".pie-fijo .secundario", { hasText: "Cobrar ya" }).click();
  await p.getByRole("button", { name: "Exacto" }).click();
  await p.locator(".pie-fijo .principal").click();

  await p.locator(".pestanas button", { hasText: "El día" }).click();
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

test("el día para hacer cuentas: comida pagada por Nequi, entre cajas y las cuentas con filtro", async ({ browser }) => {
  const p = await celular(browser, "Administrador", { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  const { token, base } = await sesionApi(p.context().request);
  const ops = (ops: unknown[]) => p.context().request.post("/api/ops", { headers: { authorization: `Bearer ${token}` }, data: { base, ops } });
  const en = Date.now();
  const k = `e2e-dia-${en}`;
  expect((await ops([
    { id: `${k}-p`, t: "producto", en, producto: { id: "plato-dia-e2e", nombre: "Plato del día", corto: "PLATO DÍA", categoria: "comida", precio: 30000, activo: true, fondo: "#8A4F2E", texto: "#FFFFFF" } },
    // Mixta cobrada en la cocina por Nequi: 30.000 de comida y 8.000 de barra.
    { id: `${k}-a`, t: "abrir", en, cuenta: `${k}-c1`, nombre: "Chelo del día", tipo: "grupo" },
    { id: `${k}-b`, t: "anotar", en, cuenta: `${k}-c1`, ronda: `${k}-r1`, area: "comida", lineas: [{ id: `${k}-l1`, producto: "plato-dia-e2e", cantidad: 1 }] },
    { id: `${k}-c`, t: "anotar", en, cuenta: `${k}-c1`, ronda: `${k}-r2`, area: "barra", lineas: [{ id: `${k}-l2`, producto: "rubia", cantidad: 2 }] },
    { id: `${k}-d`, t: "cobrar", en, cuenta: `${k}-c1`, pago: `${k}-pg1`, medio: "nequi", area: "comida" },
    // Solo comida cobrada en la barra en efectivo.
    { id: `${k}-e`, t: "abrir", en, cuenta: `${k}-c2`, nombre: "Patricia del día", tipo: "mesa" },
    { id: `${k}-f`, t: "anotar", en, cuenta: `${k}-c2`, ronda: `${k}-r3`, area: "comida", lineas: [{ id: `${k}-l3`, producto: "plato-dia-e2e", cantidad: 2 }] },
    { id: `${k}-g`, t: "cobrar", en, cuenta: `${k}-c2`, pago: `${k}-pg2`, medio: "efectivo", area: "barra" },
  ])).ok()).toBe(true);
  await p.reload();
  await p.locator(".pestanas button", { hasText: "El día" }).click();

  await expect(p.locator(".dia-hero-total")).toBeVisible();
  await expect(p.getByPlaceholder("Efectivo contado")).toBeInViewport(); // C10
  // Nequi: la fila dice cuánto fue de comida (al menos los 30.000 de esta cuenta).
  await expect(p.locator(".dia-tabla tr.fila-nequi")).toBeVisible();
  // Entre cajas: la barra cobró comida en efectivo.
  await expect(p.locator(".entre-cajas")).toContainText("Efectivo");
  await expect(p.locator(".entre-cajas")).toContainText("de comida");
  await p.screenshot({ path: "test-results/capturas/el-dia-telefono.png", fullPage: true });

  // Tocar «Nequi» filtra las cuentas: sale la mixta con su pago repartido.
  await p.locator(".dia-tabla tr.fila-nequi").click();
  await expect(p.getByRole("button", { name: /^Nequi$/ })).toHaveAttribute("aria-pressed", "true");
  const fila = p.locator(".renglon-dia", { hasText: "Chelo del día" });
  await expect(fila).toContainText("🍺 $ 8.000");
  await expect(fila).toContainText("🍽 $ 30.000");
  await expect(fila.locator(".pago-chip")).toContainText("Nequi $ 38.000");
  await expect(fila.locator(".pago-chip")).toContainText("(cocina)");
  await expect(p.locator(".renglon-dia", { hasText: "Patricia del día" })).toHaveCount(0);
  // Y abre la cuenta.
  await fila.click();
  await expect(p.locator(".barra-superior strong").first()).toHaveText("Chelo del día");
});

test("el día en el portátil: dos columnas", async ({ browser }) => {
  const p = await celular(browser, "Administrador", { viewport: { width: 1366, height: 800 }, hasTouch: false, isMobile: false });
  await p.locator(".pestanas button", { hasText: "El día" }).click();
  await expect(p.locator(".dia-columnas")).toBeVisible();
  const columnas = await p.locator(".dia-columnas").evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length);
  expect(columnas).toBe(2);
  await p.screenshot({ path: "test-results/capturas/el-dia-portatil.png", fullPage: true });
});
