// Pedidos a la barra y cobro por área (2026-11-15), de lo que se vio en producción:
// quien pide desde comida y también tiene la barra no oye su propio pedido, lo puede
// cancelar (no «rechazar»), y si la cuenta queda vacía se anula sola. Y en el cobro, «Solo
// barra» escoge de un toque todo lo de la barra.
import { expect, test } from "./prueba";
import { celular, sesionApi } from "./ayuda";

const TELEFONO = { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true };

test("quien pide a la barra no oye su pedido, lo cancela y la cuenta vacía se anula", async ({ browser }) => {
  const admin = await celular(browser);
  const { token } = await sesionApi(admin.context().request);
  const api = (data: unknown) => admin.context().request.post("/api/admin/personas", { headers: { authorization: `Bearer ${token}` }, data });
  const id = ((await (await api({ accion: "crear", nombre: "Barra y comida", rol: "operador" })).json()) as { persona: { id: string } }).persona.id;
  await api({ accion: "areas", id, areas: ["barra", "comida"] });
  await api({ accion: "horario", id, horario: null });
  const p = await celular(browser, "Barra y comida", TELEFONO);

  // Desde comida pide una cerveza a la barra.
  await p.getByRole("button", { name: "Comida", exact: true }).click();
  await p.getByRole("button", { name: "Pedir a la barra" }).click();
  await p.getByLabel("Detalles del pedido").fill("pedido propio");
  await p.keyboard.press("Enter");
  await p.locator(".producto", { hasText: "RUBIA" }).first().click();
  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".aviso")).toContainText("Pedido enviado a la barra");

  // A la barra (otro aparato) le llega; al que pidió, no (aunque también tenga la barra).
  await expect(admin.locator(".aviso-despacho")).toContainText("pedido propio", { timeout: 10_000 });
  await expect(p.locator(".aviso-despacho")).toHaveCount(0);

  // En «Despachar» lo ve con quién lo pidió, y lo cancela (no le sale «No se puede»).
  await p.getByRole("button", { name: /Despachar/ }).click();
  const tarjeta = p.locator(".por-despachar .despacho", { hasText: "pedido propio" });
  await expect(tarjeta).toContainText("la pidió usted");
  await expect(tarjeta.getByRole("button", { name: "🚫 No se puede" })).toHaveCount(0);
  await tarjeta.getByRole("button", { name: "Cancelar pedido" }).click();
  await tarjeta.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(p.locator(".aviso")).toContainText("la cuenta quedó vacía y se anuló");
  await expect(admin.locator(".aviso-despacho", { hasText: "pedido propio" })).toHaveCount(0, { timeout: 10_000 });

  // La cuenta no queda abierta en $ 0.
  const foto = (await (await admin.context().request.get("/api/foto", { headers: { authorization: `Bearer ${token}` } })).json()) as { estado: { cuentas: Record<string, { nombre: string; anulada: boolean; rondas: { detalle?: string }[] }> } };
  const cuenta = Object.values(foto.estado.cuentas).find((c) => c.rondas.some((r) => r.detalle === "pedido propio"));
  expect(cuenta?.anulada).toBe(true);
});

test("la barra despacha y en «Despachar» queda quién lo hizo y a qué hora", async ({ browser }) => {
  const admin = await celular(browser);
  const { token } = await sesionApi(admin.context().request);
  const api = (data: unknown) => admin.context().request.post("/api/admin/personas", { headers: { authorization: `Bearer ${token}` }, data });
  const id = ((await (await api({ accion: "crear", nombre: "Comida detalle", rol: "operador" })).json()) as { persona: { id: string } }).persona.id;
  await api({ accion: "areas", id, areas: ["comida"] });
  await api({ accion: "horario", id, horario: null });
  const p = await celular(browser, "Comida detalle", TELEFONO);

  await p.getByRole("button", { name: "Pedir a la barra" }).click();
  await p.getByLabel("Detalles del pedido").fill("mesa del detalle");
  await p.keyboard.press("Enter");
  await p.locator(".producto", { hasText: "RUBIA" }).first().click();
  await p.locator(".pie-fijo .principal").click();

  await admin.locator(".aviso-despacho", { hasText: "mesa del detalle" }).click();
  const tarjeta = admin.locator(".por-despachar .despacho", { hasText: "mesa del detalle" });
  await expect(tarjeta).toContainText("la pidió Comida detalle");
  await tarjeta.getByRole("button", { name: "Despachado" }).click();
  // Comida ve que ya se despachó, quién y a qué hora.
  await p.getByRole("button", { name: /Despachar/ }).click();
  await expect(p.locator(".despachos-recientes li", { hasText: "Rubia" }).first()).toContainText("✓ Despachado · Administrador", { timeout: 10_000 });
});

test("cobrar solo lo de la barra de un toque", async ({ browser }) => {
  const admin = await celular(browser);
  const { token, base } = await sesionApi(admin.context().request);
  const ops = (ops: unknown[]) => admin.context().request.post("/api/ops", { headers: { authorization: `Bearer ${token}` }, data: { base, ops } });
  const en = Date.now();
  const cuenta = `e2e-area-${en}`;
  expect((await ops([
    { id: `e2e-area-plato-${en}`, t: "producto", en, producto: { id: "plato-area-e2e", nombre: "Plato área", corto: "PLATO ÁREA", categoria: "comida", precio: 20000, activo: true, fondo: "#8A4F2E", texto: "#FFFFFF" } },
    { id: `${cuenta}-a`, t: "abrir", en, cuenta, nombre: "Gloria por áreas", tipo: "grupo" },
    { id: `${cuenta}-c`, t: "anotar", en, cuenta, ronda: `${cuenta}-r1`, area: "comida", lineas: [{ id: `${cuenta}-l1`, producto: "plato-area-e2e", cantidad: 1 }] },
    { id: `${cuenta}-b1`, t: "anotar", en, cuenta, ronda: `${cuenta}-r2`, area: "barra", lineas: [{ id: `${cuenta}-l2`, producto: "rubia", cantidad: 3 }] },
    { id: `${cuenta}-b2`, t: "anotar", en, cuenta, ronda: `${cuenta}-r3`, area: "barra", lineas: [{ id: `${cuenta}-l3`, producto: "light", cantidad: 1 }] },
  ])).ok()).toBe(true);

  await admin.reload();
  await admin.locator(".tarjeta", { hasText: "Gloria por áreas" }).click();
  await admin.getByRole("button", { name: /^Cobrar/ }).first().click();
  // 3 rubias (12.000) + 1 light (4.500) de dos pedidas distintas, en un toque.
  await admin.getByRole("button", { name: /Solo barra/ }).click();
  await expect(admin.getByRole("button", { name: /Solo barra/ })).toHaveAttribute("aria-pressed", "true");
  await admin.locator(".pie-fijo .principal").click();
  await expect(admin.locator(".aviso")).toContainText("abono");
  await expect(admin.locator(".cobrar .total")).toHaveText(/20\.000/);
});
