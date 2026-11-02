// Un celular con anotaciones pendientes de otra base (la vieja, después de migrar) no
// las envía: las aparta, avisa, y el administrador las descarga. Ver negocio/docs/10.

import { expect, test } from "@playwright/test";

test("los pendientes de otra base se apartan, se avisan y nunca llegan al servidor", async ({ browser, request }) => {
  const r = await request.post("/api/entrar", { data: { persona: "Administrador", clave: "prueba" } });
  const { token, base } = (await r.json()) as { token: string; base: string };
  expect(base).toBeTruthy();

  const ahora = Date.now();
  const pendientes = [
    { id: `vieja-abrir-${ahora}`, t: "abrir", cuenta: `vieja-${ahora}`, nombre: "Cuenta de la base vieja", tipo: "grupo", persona: "Administrador", en: ahora },
    { id: `vieja-anotar-${ahora}`, t: "anotar", cuenta: `vieja-${ahora}`, ronda: "r1", persona: "Administrador", en: ahora, lineas: [{ id: "l1", producto: "rubia", cantidad: 2 }] },
  ];
  const contexto = await browser.newContext();
  await contexto.addInitScript(({ token, pendientes }) => {
    if (localStorage.getItem("bg.preparado")) return; // solo la primera carga
    localStorage.setItem("bg.preparado", "1");
    localStorage.setItem("bg.sesion", JSON.stringify({ token, persona: "Administrador" }));
    localStorage.setItem("bg.base", JSON.stringify("base-vieja"));
    localStorage.setItem("bg.pendientes", JSON.stringify(pendientes));
  }, { token, pendientes });

  const p = await contexto.newPage();
  await p.goto("/");
  await expect(p.locator(".apartados")).toContainText("2 anotaciones de antes del cambio de base");
  await expect(p.locator(".conexion")).toHaveText(/Todo al día/);
  await expect(p.locator(".tarjeta", { hasText: "Cuenta de la base vieja" })).toHaveCount(0);

  // El servidor no las recibió.
  const foto = (await (await request.get("/api/foto", { headers: { authorization: `Bearer ${token}` } })).json()) as { estado: { cuentas: Record<string, unknown> } };
  expect(foto.estado.cuentas[`vieja-${ahora}`]).toBeUndefined();

  // Siguen apartadas al recargar; el administrador las descarga y las olvida.
  await p.reload();
  await expect(p.locator(".apartados")).toBeVisible();
  const descarga = p.waitForEvent("download");
  await p.getByRole("button", { name: "Descargar" }).click();
  expect((await descarga).suggestedFilename()).toMatch(/^anotaciones-apartadas-.*\.json$/);
  await p.getByRole("button", { name: "Ya las revisé" }).click();
  await expect(p.locator(".apartados")).toHaveCount(0);
});
