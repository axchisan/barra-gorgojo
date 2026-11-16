// Comida y barra en la misma app (docs/14): comida anota un plato con nota y una cerveza,
// la barra recibe el aviso y despacha, y comida cobra la cuenta en su caja.
import { expect, test } from "./prueba";
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
  // Sin horario ni restricciones de vista (las nuevas empiezan con las de empleado, docs/17).
  await api("/api/admin/personas", { accion: "horario", id, horario: null });
  await api("/api/admin/personas", { accion: "permisos", id, permisos: ["dia", "historial"] });

  // Comida: entra directo a su panel; los platos van primero.
  const cocina = await celular(browser, "Cocina");
  await expect(cocina.locator(".barra-superior strong").first()).toHaveText("Comida");
  await expect(cocina.getByRole("button", { name: /Despachar \(/ })).toHaveCount(0); // sin pendientes (la pestaña puede seguir por lo ya despachado)
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
  // El botón dice lo que va a pasar con las bebidas, y la pantalla lleva la franja de comida.
  await expect(cocina.locator(".pie-fijo .principal")).toContainText("🔔 Abrir y pedir a la barra");
  await expect(cocina.locator("main.anotar.en-comida")).toBeVisible();
  await cocina.locator(".pie-fijo .principal").click();
  await expect(cocina.locator(".aviso")).toContainText("bebidas avisadas a la barra");
  const mesa = cocina.locator(".tarjeta", { hasText: "Mesa 7" });
  await expect(mesa).toContainText("Por despachar");

  // Barra: aviso arriba, en cualquier pantalla, hasta despachar.
  const aviso = barra.locator(".aviso-despacho");
  await expect(aviso).toContainText("Mesa 7: 1 Rubia");
  await aviso.click();
  const tarjetaDespacho = barra.locator(".por-despachar .despacho", { hasText: "Mesa 7" });
  await expect(tarjetaDespacho).toContainText("la pidió Cocina");
  await tarjetaDespacho.getByRole("button", { name: "Despachado" }).click();
  await expect(barra.locator(".por-despachar")).toContainText("Nada por despachar");
  await barra.getByRole("button", { name: "Cuentas" }).click();
  await expect(aviso).toHaveCount(0);
  await expect(mesa).not.toContainText("Por despachar");

  // La barra ve la cuenta con su comida, y aunque oculte las de solo comida, esta sigue
  // porque tiene bebidas.
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

test("pedido rápido a la barra: bebidas con detalles, a una cuenta nueva, y la barra lo despacha", async ({ browser }) => {
  const barra = await celular(browser, "Administrador");
  const { token } = await sesionApi(barra.context().request);
  const api = (ruta: string, data: unknown) => barra.context().request.post(ruta, { headers: { authorization: `Bearer ${token}` }, data });
  const creada = await api("/api/admin/personas", { accion: "crear", nombre: "Apoyo e2e", rol: "operador" });
  const id = ((await creada.json()) as { persona?: { id: string } }).persona?.id;
  await api("/api/admin/personas", { accion: "areas", id, areas: ["comida"] });
  await api("/api/admin/personas", { accion: "horario", id, horario: null });

  const apoyo = await celular(browser, "Apoyo e2e");
  await apoyo.getByRole("button", { name: "Pedir a la barra" }).click();
  await apoyo.getByLabel("Detalles del pedido").fill("para el limón");
  await apoyo.keyboard.press("Enter");
  const rubia = apoyo.locator(".producto", { hasText: "RUBIA" }).first();
  await rubia.click(); await rubia.click();
  await apoyo.locator(".pie-fijo .principal").click();
  await expect(apoyo.locator(".aviso")).toContainText("Pedido enviado a la barra");
  await expect(apoyo.locator(".tarjeta", { hasText: "para el limón" })).toContainText("Por despachar");

  const aviso = barra.locator(".aviso-despacho");
  await expect(aviso).toContainText("2 Rubia · para el limón");
  await aviso.click();
  const tarjeta = barra.locator(".por-despachar .despacho", { hasText: "para el limón" });
  await expect(tarjeta.locator(".detalle-pedido")).toHaveText("📝 para el limón");
  await tarjeta.getByRole("button", { name: "Despachado" }).click();
  await expect(barra.locator(".por-despachar .despacho", { hasText: "para el limón" })).toHaveCount(0);
});

for (const [nombre, width, height] of [["tablet girada", 1097, 654], ["celular girado", 768, 301], ["celular", 360, 740]] as const) {
  test(`panel de comida · el pie cabe entero · ${nombre}`, async ({ browser }) => {
    const p = await celular(browser, "Administrador", { viewport: { width, height } });
    await p.getByRole("button", { name: /Comida/ }).first().click();
    for (const b of [p.getByRole("button", { name: "Pedir a la barra" }), p.getByRole("button", { name: "＋ Nueva cuenta" }), p.locator(".pestanas button").last()]) {
      await expect(b).toBeInViewport({ ratio: 1 });
    }
  });
}

for (const [nombre, width, height] of [["tablet girada", 1097, 654], ["celular", 360, 740], ["celular mediano", 390, 844], ["celular girado", 768, 301]] as const) {
  test(`la barra oculta las cuentas de solo comida; las que tienen bebidas siguen · ${nombre}`, async ({ browser }) => {
    const p = await celular(browser, "Administrador", { viewport: { width, height } });
    const n = Date.now() % 10000;
    const soloPlato = `Solo plato ${n}`, conBebida = `Plato y cerveza ${n}`;
    const cuenta = async (nombreCuenta: string, cerveza: boolean) => {
      await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
      await p.getByPlaceholder("Nombre", { exact: true }).fill(nombreCuenta);
      await p.getByRole("tab", { name: /Comida/ }).click();
      await p.getByRole("button", { name: /Otro valor/ }).click();
      await p.getByLabel("Valor del plato").fill("10000");
      await p.locator(".hoja").getByRole("button", { name: /Agregar/ }).click();
      if (cerveza) { await p.getByRole("tab", { name: /Bebidas/ }).click(); await p.locator("main > section .producto").first().click(); }
      await p.locator(".pie-fijo .principal").click();
    };
    await cuenta(soloPlato, false);
    await cuenta(conBebida, true);
    const boton = p.getByRole("button", { name: "Ocultar las cuentas de solo comida" });
    await expect(boton).toBeInViewport({ ratio: 1 });
    // El encabezado no crece ni se sale.
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await boton.click();
    await expect(p.locator(".tarjetas .tarjeta", { hasText: soloPlato })).toHaveCount(0);
    await expect(p.locator(".tarjetas .tarjeta", { hasText: conBebida })).toBeVisible();
    await p.screenshot({ path: "test-results/capturas/ocultar-" + nombre.replace(" ", "-") + ".png" });
    // Se recuerda al volver a abrir la app.
    await p.reload();
    await expect(p.locator(".tarjetas .tarjeta", { hasText: soloPlato })).toHaveCount(0);
    await p.getByRole("button", { name: "Mostrar las cuentas de solo comida" }).click();
    await expect(p.locator(".tarjetas .tarjeta", { hasText: soloPlato })).toBeVisible();
  });
}

test("comida cancela un pedido a la barra que aún no se despacha; la barra deja de tener el aviso", async ({ browser }) => {
  const barra = await celular(browser, "Administrador");
  // Una persona solo de comida, creada por la pantalla.
  await barra.getByRole("button", { name: /Administrador ▾/ }).click();
  await barra.getByRole("button", { name: "Personas y celulares" }).click();
  await barra.getByPlaceholder("Nombre de la persona nueva").fill("Cocina cancela");
  await barra.getByRole("button", { name: "Agregar" }).click();
  await barra.locator(".fila-persona", { hasText: "Cocina cancela" }).first().getByRole("button", { name: /▾$/ }).click();
  const permisos = barra.locator(".permisos");
  await permisos.getByRole("button", { name: /🍽 Comida/ }).click(); // agrega comida
  await expect(permisos.getByRole("button", { name: /🍽 Comida/ })).toHaveAttribute("aria-pressed", "true");
  await permisos.getByRole("button", { name: /🍺 Barra/ }).click(); // quita barra
  await permisos.getByRole("button", { name: "Siempre" }).click(); // sin horario de empleado (docs/17)
  await expect(barra.locator(".fila-persona", { hasText: "Cocina cancela" }).first()).toContainText("Comida ▾");
  await barra.goBack();

  const cocina = await celular(browser, "Cocina cancela");
  await cocina.getByRole("button", { name: "Pedir a la barra" }).click();
  await cocina.getByLabel("Detalles del pedido").fill("para cancelar");
  await cocina.keyboard.press("Enter");
  await cocina.locator(".producto", { hasText: "RUBIA" }).first().click();
  await cocina.locator(".pie-fijo .principal").click();
  await expect(barra.locator(".aviso-despacho")).toContainText("para cancelar");

  // Comida lo cancela desde «Despachar» (confirma), y a la barra se le quita el aviso.
  await cocina.getByRole("button", { name: /Despachar/ }).click();
  const tarjeta = cocina.locator(".por-despachar .despacho", { hasText: "para cancelar" });
  await tarjeta.getByRole("button", { name: "Cancelar pedido" }).click();
  await tarjeta.getByRole("button", { name: "Sí, cancelar" }).click();
  await expect(cocina.locator(".aviso")).toContainText("pedido cancelado");
  await expect(barra.locator(".aviso-despacho", { hasText: "para cancelar" })).toHaveCount(0);
});

test("el sonido de los avisos se escoge en cada aparato y se recuerda", async ({ browser }) => {
  const p = await celular(browser, "Administrador");
  await p.getByRole("button", { name: /Administrador ▾/ }).click();
  await p.getByRole("button", { name: "🔔 Sonido de los avisos" }).click();
  await expect(p.getByRole("radio", { name: /Insistente/ })).toHaveAttribute("aria-checked", "true");
  await p.getByRole("radio", { name: /Una vez/ }).click();
  await p.getByRole("radio", { name: "Ding-dong" }).click();
  await p.getByRole("button", { name: "▶ Probar sonido" }).click();
  // Avisos con la app cerrada (docs/02): en localhost no hay Service Worker, y lo dice.
  await expect(p.getByText("📲 Avisos con la app cerrada")).toBeVisible();
  await expect(p.getByText("Este navegador no recibe avisos con la app cerrada.")).toBeVisible();
  await p.reload();
  await p.getByRole("button", { name: /Administrador ▾/ }).click();
  await p.getByRole("button", { name: "🔔 Sonido de los avisos" }).click();
  await expect(p.getByRole("radio", { name: /Una vez/ })).toHaveAttribute("aria-checked", "true");
  await expect(p.getByRole("radio", { name: "Ding-dong" })).toHaveAttribute("aria-checked", "true");
});
