// Deudas (docs/15) por la pantalla: pasar una cuenta a deuda, verla en «Deudas» y recibir un pago.
import { expect, test } from "./prueba";
import { celular } from "./ayuda";

const soloDigitos = (s: string) => Number(s.replace(/\D/g, ""));

test("una cuenta pasa a deuda, queda en el panel de deudas y se recibe un pago aparte de la caja", async ({ browser }) => {
  const p = await celular(browser);
  const nombre = `Fiada ${Date.now() % 10000}`;
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  const primero = p.locator("main > section .producto").first();
  await primero.click(); await primero.click();
  await p.locator(".pie-fijo .principal").click();
  await p.locator(".tarjeta", { hasText: nombre }).click();
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  const total = soloDigitos(await p.locator(".cobrar .total").innerText());

  await p.getByRole("button", { name: "📒 Deuda" }).click();
  const boton = p.locator(".pie-fijo .principal");
  await expect(boton).toBeDisabled(); // falta el nombre
  await p.getByLabel("A nombre de quién queda la deuda").fill("Pedro Prueba");
  await p.keyboard.press("Enter");
  await p.screenshot({ path: "test-results/capturas/a-deuda.png" });
  await boton.click();
  await expect(p.locator(".aviso")).toContainText(`${nombre}: pasada a deuda de Pedro Prueba`);
  await expect(p.locator(".tarjetas .tarjeta", { hasText: nombre })).toHaveCount(0);

  // Panel de deudas.
  await p.getByRole("button", { name: /Administrador ▾/ }).click();
  await p.getByRole("button", { name: "📒 Deudas" }).click();
  const tarjeta = p.locator(".tarjeta.deudor", { hasText: "Pedro Prueba" });
  await expect(tarjeta).toContainText(total.toLocaleString("es-CO"));
  await tarjeta.click();
  await expect(p.locator(".movimiento")).toContainText(`Cuenta «${nombre}»`);
  // El detalle de lo fiado: qué se fió, y la cuenta con sus pedidas, cantidades, horas y quién.
  await expect(p.locator(".que-se-fio")).toContainText("Se fió lo que faltaba de la cuenta");
  await p.getByRole("button", { name: /Ver la cuenta: 1 pedida/ }).click();
  await expect(p.locator(".pedida-fiada")).toContainText("Pedida 1");
  await expect(p.locator(".pedida-fiada")).toContainText("Administrador");
  await expect(p.locator(".pedida-fiada li").first()).toContainText("2 ");
  await p.getByRole("button", { name: "Recibir pago" }).click();
  await p.getByRole("button", { name: "La mitad" }).click();
  const mitad = Math.ceil(total / 2 / 100) * 100;
  await p.locator(".hoja .principal").click();
  await expect(p.locator(".aviso")).toContainText(new RegExp(`debe \\$\\s${(total - mitad).toLocaleString("es-CO").replace(".", "\\.")}`));
  await expect(p.locator(".cabeza-total .total")).toHaveText(new RegExp((total - mitad).toLocaleString("es-CO")));
  await p.screenshot({ path: "test-results/capturas/deudor.png" });

  // El día: lo fiado cuenta como venta de hoy; el pago va aparte de la caja.
  await p.goBack(); await p.goBack();
  await p.locator(".pestanas button", { hasText: "El día" }).click();
  await expect(p.locator(".dia-tabla tr.fila-deuda")).toContainText(total.toLocaleString("es-CO"));
  await expect(p.locator(".cifra.deuda", { hasText: "Pagos de deudas" })).toContainText(mitad.toLocaleString("es-CO"));
});

test("el permiso «Administra deudas» deja anotar deudas a mano sin ser administrador", async ({ browser }) => {
  // El administrador crea a la persona por la pantalla.
  const admin = await celular(browser);
  await admin.getByRole("button", { name: /Administrador ▾/ }).click();
  await admin.getByRole("button", { name: "Personas y celulares" }).click();
  await admin.getByPlaceholder("Nombre de la persona nueva").fill("Mamá e2e");
  await admin.getByRole("button", { name: "Agregar" }).click();
  await expect(admin.locator(".fila-persona", { hasText: "Mamá e2e" })).toBeVisible();
  // Las personas nuevas empiezan con horario de empleado (docs/17): sin horario, entra cualquier día.
  await admin.locator(".fila-persona", { hasText: "Mamá e2e" }).first().getByRole("button", { name: /▾$/ }).click();
  await admin.locator(".permisos").getByRole("button", { name: "Siempre" }).click();
  await expect(admin.locator(".fila-persona", { hasText: "Mamá e2e" }).first()).not.toContainText("con horario");
  await admin.locator(".fila-persona", { hasText: "Mamá e2e" }).first().getByRole("button", { name: /▾$/ }).click();

  const mama = await celular(browser, "Mamá e2e");
  await mama.getByRole("button", { name: /Mamá e2e ▾/ }).click();
  await mama.getByRole("button", { name: "📒 Deudas" }).click();
  await expect(mama.getByRole("button", { name: "＋ Anotar deuda" })).toHaveCount(0);

  // El administrador le da el permiso en «Personas y celulares».
  await admin.locator(".fila-persona", { hasText: "Mamá e2e" }).first().getByRole("button", { name: /▾$/ }).click();
  await admin.getByLabel(/Administra deudas/).click(); // se marca cuando responde el servidor
  await expect(admin.getByLabel(/Administra deudas/)).toBeChecked();
  await expect(admin.locator(".fila-persona", { hasText: "Mamá e2e" }).first()).toContainText("deudas");

  // Le llega sin volver a entrar.
  await expect(mama.getByRole("button", { name: "＋ Anotar deuda" })).toBeVisible({ timeout: 10_000 });
  await mama.getByRole("button", { name: "＋ Anotar deuda" }).click();
  await mama.getByLabel("Quién debe").fill("Vecino e2e");
  await mama.getByLabel("Qué es la deuda").fill("almuerzos");
  await mama.getByLabel("Valor de la deuda").fill("15000");
  await mama.locator(".hoja .principal").click();
  await expect(mama.locator(".tarjeta.deudor", { hasText: "Vecino e2e" })).toContainText("15.000");
});
