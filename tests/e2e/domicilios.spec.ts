// Domicilios en el teléfono de comida (2026-11-15): hora de entrega, estados y recordatorio.
import { expect, test } from "@playwright/test";
import { celular, sesionApi } from "./ayuda";

const TELEFONO = { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true };

test("comida: un domicilio con hora, sus estados con un toque y el aviso cuando se atrasa", async ({ browser }) => {
  const admin = await celular(browser);
  const { token, base } = await sesionApi(admin.context().request);
  const api = (data: unknown) => admin.context().request.post("/api/admin/personas", { headers: { authorization: `Bearer ${token}` }, data });
  const id = ((await (await api({ accion: "crear", nombre: "Comida domicilios", rol: "operador" })).json()) as { persona: { id: string } }).persona.id;
  await api({ accion: "areas", id, areas: ["comida"] });
  await api({ accion: "horario", id, horario: null });
  const p = await celular(browser, "Comida domicilios", TELEFONO);

  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByRole("button", { name: "Domicilio", exact: true }).click();
  await p.getByLabel("Nombre del cliente (opcional)").fill("Don Aurelio");
  await p.getByLabel("Dirección del domicilio (opcional)").fill("La vereda");
  await p.getByLabel("Hora de entrega (opcional)").fill("23:58");
  await expect(p.getByRole("button", { name: /Apartar para más tarde/ })).toHaveCount(0); // el domicilio ya tiene su hora
  await p.locator('button[aria-label="Bebidas"]').click();
  await p.locator("main > section .producto", { hasText: "RUBIA" }).first().click();
  await p.getByRole("button", { name: "🔔 Avisar a la barra" }).click(); // la lleva comida: sin pendientes en la barra
  await p.locator(".pie-fijo .principal").click();

  const lista = p.locator(".domicilios");
  const fila = lista.locator(".fila-domicilio-lista", { hasText: "Don Aurelio" });
  await expect(fila).toContainText("Para las 11:58");
  await expect(fila).toContainText("📥 Recibido");
  await fila.getByRole("button", { name: "🍳 En preparación" }).click();
  await expect(fila).toContainText("🍳 En preparación");
  await p.screenshot({ path: "test-results/capturas/domicilios.png" });

  // Se atrasa (la hora ya pasó): aviso rojo arriba.
  const foto = (await (await admin.context().request.get("/api/foto", { headers: { authorization: `Bearer ${token}` } })).json()) as { estado: { cuentas: Record<string, { id: string; nombre: string }> } };
  const cuenta = Object.values(foto.estado.cuentas).find((c) => c.nombre === "Don Aurelio")!;
  await admin.context().request.post("/api/ops", { headers: { authorization: `Bearer ${token}` }, data: { base, ops: [{ id: `e2e-dom-${Date.now()}`, t: "domicilio", cuenta: cuenta.id, entrega: Date.now() - 10 * 60_000, en: Date.now() }] } });
  await expect(p.locator(".aviso-domicilio")).toContainText("Domicilio atrasado", { timeout: 10_000 });
  await expect(fila).toHaveClass(/atrasado/);

  // En camino y entregado: sale de la lista y el aviso se quita.
  await fila.getByRole("button", { name: "🛵 En camino" }).click();
  await fila.getByRole("button", { name: "✅ Entregado" }).click();
  await expect(fila).toHaveCount(0); // (otras pruebas pueden dejar sus domicilios)
  await expect(p.locator(".aviso-domicilio")).toHaveCount(0);
});
