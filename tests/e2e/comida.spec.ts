// Comida y barra en la misma app (docs/14): comida anota un plato con nota y una cerveza,
// la barra recibe el aviso y despacha, y comida cobra la cuenta en su caja.
import { expect, test } from "@playwright/test";
import { celular, sesionApi } from "./ayuda";

test("comida pide una cerveza, la barra la despacha y comida cobra en su caja", async ({ browser }) => {
  const barra = await celular(browser, "Administrador");
  const { token, base } = await sesionApi(barra.context().request);
  const api = (ruta: string, data: unknown) => barra.context().request.post(ruta, { headers: { authorization: `Bearer ${token}` }, data });

  // Datos: dos platos con notas rápidas y una persona solo de comida.
  const plato = (id: string, nombre: string, precio: number, notas?: string[]) =>
    ({ id: `e2e-${id}`, t: "producto", en: Date.now(), producto: { id, nombre, corto: nombre.toUpperCase(), categoria: "comida", precio, activo: true, fondo: "#8A4F2E", texto: "#FFFFFF", ...(notas ? { notas } : {}) } });
  expect((await api("/api/ops", { base, ops: [plato("sopa-e2e", "Sopa e2e", 5000), plato("picada-e2e", "Picada e2e", 30000, ["solo carne", "más yuca"])] })).ok()).toBe(true);
  const creada = await api("/api/admin/personas", { accion: "crear", nombre: "Cocina", rol: "operador" });
  const id = ((await creada.json()) as { persona?: { id: string } }).persona?.id;
  expect(id, "persona de comida").toBeTruthy();
  expect((await api("/api/admin/personas", { accion: "areas", id, areas: ["comida"] })).ok()).toBe(true);

  // Comida: entra directo a su panel; los platos van primero.
  const cocina = await celular(browser, "Cocina");
  await expect(cocina.locator(".barra-superior strong").first()).toHaveText("Comida");
  await expect(cocina.getByRole("button", { name: "Despachar" })).toHaveCount(0);
  await cocina.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await expect(cocina.locator("main > section .seccion").first()).toHaveText("Comida");
  await cocina.getByLabel("Número de mesa").fill("7");
  await cocina.locator(".producto", { hasText: "SOPA E2E" }).click();
  await cocina.locator(".producto", { hasText: "SOPA E2E" }).click();
  // Una picada «solo carne» con dos toques más que sin nota.
  await cocina.getByRole("button", { name: "Picada e2e con nota" }).click();
  await cocina.getByRole("button", { name: "solo carne" }).click();
  await cocina.locator(".hoja").getByRole("button", { name: "Agregar" }).click();
  await expect(cocina.locator(".con-notas")).toContainText("1 Picada e2e · solo carne");
  // Plato de otro valor.
  await cocina.getByRole("button", { name: /Otro valor/ }).click();
  await cocina.getByLabel("Valor del plato").fill("12000");
  await cocina.locator(".hoja").getByRole("button", { name: /Agregar/ }).click();
  // Y una cerveza, en la pestaña de bebidas: le llega a la barra.
  await expect(cocina.locator(".producto", { hasText: "RUBIA" })).toHaveCount(0);
  await cocina.getByRole("tab", { name: /Bebidas/ }).click();
  await cocina.locator(".producto", { hasText: "RUBIA" }).first().click();
  await expect(cocina.getByRole("tab", { name: /Comida/ })).toContainText("4");
  await cocina.locator(".pie-fijo .principal").click();
  await expect(cocina.locator(".aviso")).toContainText("bebidas avisadas a la barra");
  const mesa = cocina.locator(".tarjeta", { hasText: "Mesa 7" });
  await expect(mesa).toContainText("Por despachar");

  // Barra: aviso arriba, en cualquier pantalla, hasta despachar.
  const aviso = barra.locator(".aviso-despacho");
  await expect(aviso).toContainText("Mesa 7: 1 Rubia");
  await aviso.click();
  const tarjetaDespacho = barra.locator(".por-despachar .despacho", { hasText: "Mesa 7" });
  await expect(tarjetaDespacho).toContainText("Lo pidió Cocina");
  await tarjetaDespacho.getByRole("button", { name: "Despachado" }).click();
  await expect(barra.locator(".por-despachar")).toContainText("Nada por despachar");
  await barra.getByRole("button", { name: "Cuentas" }).click();
  await expect(aviso).toHaveCount(0);
  await expect(mesa).not.toContainText("Por despachar");

  // La barra ve la cuenta con su comida.
  await barra.getByRole("button", { name: "Solo cuentas con comida" }).click();
  await expect(barra.locator(".tarjeta", { hasText: "Mesa 7" }).locator(".marca-comida")).toBeVisible();

  // Comida cobra todo (platos y cerveza) en su caja: 2·5.000 + 30.000 + 12.000 + rubia.
  await mesa.click();
  await expect(cocina.getByText("Picada e2e · solo carne")).toBeVisible();
  await cocina.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  await expect(cocina.getByRole("button", { name: "Pasar a comida" })).toHaveCount(0);
  const total = Number((await cocina.locator(".cobrar .total").innerText()).replace(/\D/g, ""));
  expect(total).toBeGreaterThan(52_000);
  await cocina.getByRole("button", { name: "Exacto" }).click();
  await cocina.locator(".pie-fijo .principal").click();
  await expect(cocina.locator(".aviso")).toContainText("Mesa 7: cobrada");

  // El día de comida: su caja tiene ese efectivo; la de la barra no.
  await cocina.getByRole("button", { name: "El día" }).click();
  await expect(cocina.locator(".caja").first()).toContainText(`caja de cocina`);
  await expect(cocina.locator(".caja").first()).toContainText(total.toLocaleString("es-CO"));
  // Doble cobro imposible: en la barra la cuenta ya no está abierta.
  await expect(barra.locator(".tarjetas .tarjeta", { hasText: "Mesa 7" })).toHaveCount(0);
});

test("el administrador crea la carta de una vez: un plato en varios precios", async ({ browser }) => {
  const p = await celular(browser, "Administrador");
  await p.getByRole("button", { name: /Administrador ▾/ }).click();
  await p.getByRole("button", { name: "Productos y precios" }).click();
  await p.getByRole("button", { name: "🍽 Crear platos" }).click();
  await p.getByLabel("Nombre del plato", { exact: true }).fill("Bandeja e2e");
  await p.getByLabel("Precios").fill("21 26");
  await p.getByLabel("Notas rápidas de esos platos").fill("sin arroz, doble");
  await p.getByRole("button", { name: "Agregar a la lista" }).click();
  await p.getByRole("button", { name: "Crear 2 platos" }).click();
  await expect(p.locator(".aviso")).toContainText("2 platos creados");
  await p.goBack();
  // En «Anotar», pestaña Comida: un botón por precio, con sus notas rápidas.
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByRole("tab", { name: /Comida/ }).click();
  await expect(p.locator(".productos.platos .producto", { hasText: "BANDEJA E2E" })).toHaveCount(2);
  await p.getByRole("button", { name: /Bandeja e2e \$\s?21\.000 con nota/ }).click();
  await expect(p.locator(".hoja").getByRole("button", { name: "sin arroz" })).toBeVisible();
});
