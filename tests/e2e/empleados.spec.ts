// Fase 0 de docs/18: precio de los adicionales (docs/04) y accesos de empleados (docs/17).
import { expect, test } from "./prueba";
import { celular, codigo, sesionApi, teclearPin } from "./ayuda";

test("el adicional va a precio normal; se puede cobrar a precio de cancha al anotar y cambiar después", async ({ browser }) => {
  const p = await celular(browser);
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByRole("button", { name: "Cancha", exact: true }).click();
  await p.getByRole("button", { name: "Cancha 1" }).click();
  const rubia = p.locator("main > section .producto", { hasText: "RUBIA" }).first();
  await rubia.click();
  await p.locator(".pie-fijo .principal").click(); // chico: 1 Rubia a precio de cancha
  await p.locator(".tarjeta", { hasText: "Cancha 1" }).click();
  await p.getByRole("button", { name: "＋ Chico" }).click();
  await rubia.click();
  const anotar = p.locator(".pie-fijo .principal");
  await expect(anotar).toContainText(/4\.500/);
  await expect(p.locator(".precio-ronda-anotar")).toHaveCount(0); // en un chico no sale
  await p.getByRole("button", { name: "Adicional", exact: true }).click();
  const etiqueta = p.locator(".precio-ronda-anotar");
  await expect(etiqueta).toContainText("Precio normal");
  await expect(etiqueta).toBeInViewport({ ratio: 1 });
  await expect(anotar).toContainText(/4\.000/);
  await etiqueta.click();
  await expect(etiqueta).toContainText("A precio de cancha");
  await expect(anotar).toContainText(/4\.500/);
  await etiqueta.click(); // de vuelta a normal
  await expect(anotar).toContainText(/4\.000/);
  await anotar.click();

  // Después: el chip de la pedida lo cambia, con «Deshacer».
  await p.getByRole("button", { name: "Chicos" }).click();
  const adicional = p.locator(".ronda-tarjeta.adicional");
  await expect(adicional.locator(".precio-ronda")).toHaveText("Precio normal");
  await expect(adicional.locator(".sub")).toContainText(/4\.000/);
  await adicional.locator(".precio-ronda").click();
  await expect(adicional.locator(".precio-ronda")).toHaveText("🎯 Precio cancha");
  await expect(adicional.locator(".sub")).toContainText(/4\.500/);
  await p.getByRole("button", { name: "Deshacer" }).click();
  await expect(adicional.locator(".sub")).toContainText(/4\.000/);
  await expect(p.locator(".cabeza-total")).toContainText(/8\.500/);
});

test("una empleada con horario: fuera de él no entra; adentro no ve el día ni deudas viejas; al quitarle el horario sale", async ({ browser }) => {
  const admin = await celular(browser);
  const { token } = await sesionApi(admin.context().request);
  const api = (data: unknown) => admin.context().request.post("/api/admin/personas", { headers: { authorization: `Bearer ${token}` }, data });
  const creada = await api({ accion: "crear", nombre: "Empleada e2e", rol: "operador" });
  const id = ((await creada.json()) as { persona: { id: string } }).persona.id;
  await api({ accion: "horario", id, horario: { semanal: [], especiales: [] } });

  // Fuera de su horario: la entrada dice por qué, sin entrar.
  const contexto = await browser.newContext();
  const e = await contexto.newPage();
  await e.goto("/");
  await e.getByLabel("Código de 6 números").fill(await codigo(e.context().request));
  await e.getByRole("button", { name: "Vincular celular" }).click();
  await e.getByRole("button", { name: "Empleada e2e", exact: true }).click();
  await teclearPin(e);
  await expect(e.getByText(/no tiene acceso a la app/)).toBeVisible();

  // Con horario que cubre ahora: entra, pero sin «El día» y con solo lo de hoy en Deudas.
  const siempre = { semanal: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, desde: 0, hasta: 1440 })), especiales: [] };
  await api({ accion: "horario", id, horario: siempre });
  await e.goto("/");
  await e.getByRole("button", { name: "Empleada e2e", exact: true }).click();
  await teclearPin(e);
  await expect(e.locator(".conexion")).toHaveText(/Todo al día/);
  await expect(e.getByRole("button", { name: "Cuentas", exact: true })).toBeVisible();
  await expect(e.getByRole("button", { name: "El día" })).toHaveCount(0);
  await e.getByRole("button", { name: /Empleada e2e ▾/ }).click();
  await expect(e.locator(".horario-sesion")).toContainText("Su acceso de hoy termina");
  await e.getByRole("button", { name: "📒 Deudas" }).click();
  await expect(e.getByText("Aquí solo se ve lo fiado y lo pagado hoy.")).toBeVisible();
  await expect(e.locator(".cifra.grande")).toContainText("Fiado hoy");

  // La administración le quita el horario mientras está adentro: sale sola, con el porqué.
  await api({ accion: "horario", id, horario: { semanal: [], especiales: [] } });
  await expect(e.getByText("¿Quién va a anotar?")).toBeVisible({ timeout: 10_000 });
  await expect(e.locator(".aviso-horario")).toContainText("no tiene acceso");
});
