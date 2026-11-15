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

  // Domicilio con dirección y hora de entrega (el domicilio no se «aparta»: tiene su hora).
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByRole("button", { name: "Domicilio", exact: true }).click();
  await p.getByLabel("Nombre del cliente (opcional)").fill("Doña Rosa");
  await p.getByLabel("Dirección del domicilio (opcional)").fill("Vereda El Carmen");
  await p.getByLabel("Hora de entrega (opcional)").fill("23:59");
  await expect(p.getByRole("button", { name: /Apartar para más tarde/ })).toHaveCount(0);
  await p.locator('button[aria-label="Bebidas"]').click(); // en comida, anotar abre en «Comida»
  await p.locator("main > section .producto", { hasText: "RUBIA" }).first().click();
  await p.locator(".pie-fijo .principal").click();
  const rosa = p.locator(".tarjeta", { hasText: "Doña Rosa" });
  await expect(rosa).toContainText("🛵 Domicilio · Vereda El Carmen");
  await expect(rosa.locator(".marca-domicilio")).toContainText("11:59");
  // Se entrega (deja el servidor como estaba para las demás pruebas).
  await rosa.click();
  for (const paso of ["🍳 En preparación ›", "🛵 En camino ›", "✅ Entregado ›"]) await p.locator(".franja-domicilio").getByRole("button", { name: paso }).click();
  await p.getByRole("button", { name: "Volver" }).click();

  // Un apartado: «Juan», una cerveza para las 11:59 p. m.
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByRole("button", { name: "Persona", exact: true }).click();
  await p.getByLabel("Nombre de la persona (opcional)").fill("Juan apartado");
  await p.getByRole("button", { name: "⏰ Apartar para más tarde" }).click();
  await p.getByLabel("Hora del apartado (opcional)").fill("23:59");
  await p.locator('button[aria-label="Bebidas"]').click();
  await p.locator("main > section .producto", { hasText: "RUBIA" }).first().click();
  await p.locator(".pie-fijo .principal").click();

  // En el inicio: «⏰ Apartados» con la hora; la tarjeta lo dice.
  const lista = p.locator(".apartados-comida");
  await expect(lista).toContainText("11:59");
  await expect(lista).toContainText("Juan apartado");
  await expect(p.locator(".tarjeta", { hasText: "Juan apartado" })).toContainText("⏰ Apartado");
  await p.screenshot({ path: "test-results/capturas/apartados-inicio.png" });
  // Una bebida que comida misma lleva: «Sin avisar» y no queda por despachar.
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByLabel("Número de mesa (opcional)").fill("9");
  // El chip solo sale cuando la pedida lleva bebidas.
  await expect(p.getByRole("button", { name: "🔔 Avisar a la barra" })).toHaveCount(0);
  await p.locator('button[aria-label="Bebidas"]').click();
  await p.locator("main > section .producto", { hasText: "RUBIA" }).first().click();
  await p.getByRole("button", { name: "🔔 Avisar a la barra" }).click();
  await expect(p.getByRole("button", { name: "🔕 Sin avisar: la llevo yo" })).toHaveAttribute("aria-pressed", "false");
  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".tarjeta", { hasText: "Mesa 9" })).not.toContainText("Por despachar");

  // Entregado: sale de la lista (y «Deshacer» lo devolvería).
  await lista.locator(".apartado", { hasText: "Juan apartado" }).getByRole("button", { name: "Entregado" }).click();
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
