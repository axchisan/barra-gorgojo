// Apartados, domicilios y mesa sin número en el teléfono de comida (2026-11-15).
import { expect, test } from "@playwright/test";
import { celular, sesionApi } from "./ayuda";

const TELEFONO = { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true };

test("comida en el teléfono: mesa sin número, domicilio y una picada apartada para más tarde", async ({ browser }) => {
  const admin = await celular(browser);
  const { token } = await sesionApi(admin.context().request);
  const api = (data: unknown) => admin.context().request.post("/api/admin/personas", { headers: { authorization: `Bearer ${token}` }, data });
  const id = ((await (await api({ accion: "crear", nombre: "Comida apartados", rol: "operador" })).json()) as { persona: { id: string } }).persona.id;
  await api({ accion: "areas", id, areas: ["comida"] });
  await api({ accion: "horario", id, horario: null });
  const p = await celular(browser, "Comida apartados", TELEFONO);

  // Mesa sin número: se anota igual.
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await expect(p.getByRole("button", { name: "Mesa", exact: true })).toHaveAttribute("aria-pressed", "true");
  await p.locator('button[aria-label="Bebidas"]').click(); // en comida, anotar abre en «Comida»
  await p.locator("main > section .producto", { hasText: "RUBIA" }).first().click();
  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".tarjeta", { hasText: /Mesa · / }).first()).toBeVisible();

  // Domicilio con dirección, apartado para las 11:59 p. m.
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByRole("button", { name: "Domicilio", exact: true }).click();
  await p.getByLabel("Nombre del cliente (opcional)").fill("Doña Rosa");
  await p.getByLabel("Dirección del domicilio (opcional)").fill("Vereda El Carmen");
  await p.getByRole("button", { name: "⏰ Apartar para más tarde" }).click();
  await p.getByLabel("Hora del apartado (opcional)").fill("23:59");
  for (const b of [p.getByRole("button", { name: "Domicilio", exact: true }), p.getByRole("button", { name: "⏰ Apartado" })]) await expect(b).toBeInViewport();
  await p.screenshot({ path: "test-results/capturas/domicilio-apartado.png" });
  await p.locator('button[aria-label="Bebidas"]').click(); // en comida, anotar abre en «Comida»
  await p.locator("main > section .producto", { hasText: "RUBIA" }).first().click();
  await p.locator(".pie-fijo .principal").click();

  // En el inicio: «⏰ Apartados» con la hora; la tarjeta dice 🛵 y la dirección.
  const lista = p.locator(".apartados-comida");
  await expect(lista).toContainText("11:59");
  await expect(lista).toContainText("🛵 Doña Rosa · Vereda El Carmen");
  await expect(p.locator(".tarjeta", { hasText: "Doña Rosa" })).toContainText("⏰ Apartado");
  await p.screenshot({ path: "test-results/capturas/apartados-inicio.png" });
  // Una bebida que comida misma lleva: «Sin avisar» y no queda por despachar.
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByLabel("Número de mesa (opcional)").fill("9");
  await p.getByRole("button", { name: "🔔 Avisar a la barra" }).click();
  await expect(p.getByRole("button", { name: "🔕 Sin avisar: la llevo yo" })).toHaveAttribute("aria-pressed", "false");
  await p.locator('button[aria-label="Bebidas"]').click();
  await p.locator("main > section .producto", { hasText: "RUBIA" }).first().click();
  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".tarjeta", { hasText: "Mesa 9" })).not.toContainText("Por despachar");

  // Entregado: sale de la lista (y «Deshacer» lo devolvería).
  await lista.locator(".apartado", { hasText: "Doña Rosa" }).getByRole("button", { name: "Entregado" }).click();
  await expect(p.locator(".apartados-comida")).toHaveCount(0);

  // Deja el servidor como estaba: lo que quedó por despachar se despacha (por la API), y se
  // comprueba en el servidor (el aviso de despacho le quita espacio a las demás pruebas).
  const porDespachar = async () => {
    const f = (await (await admin.context().request.get("/api/foto", { headers: { authorization: `Bearer ${token}` } })).json()) as { base: string; estado: { cuentas: Record<string, { id: string; lineas: { porDespachar?: boolean; anulada?: unknown }[] }> } };
    return { base: f.base, cuentas: Object.values(f.estado.cuentas).filter((c) => c.lineas.some((l) => l.porDespachar && !l.anulada)).map((c) => c.id) };
  };
  const { base, cuentas } = await porDespachar();
  await admin.context().request.post("/api/ops", { headers: { authorization: `Bearer ${token}` }, data: { base, ops: cuentas.map((cuenta, i) => ({ id: `e2e-despacho-${Date.now()}-${i}`, t: "despachar", cuenta, en: Date.now() })) } });
  expect((await porDespachar()).cuentas).toEqual([]);
});
