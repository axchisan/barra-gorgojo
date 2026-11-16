// Abonos por la pantalla: pagar una pedida, dividir entre varios y cobrar el resto.
import { expect, test, type Page } from "./prueba";
import { APARATOS, celular, sesionApi } from "./ayuda";

const soloDigitos = (s: string) => Number(s.replace(/\D/g, ""));
const tarjeta = (p: Page, nombre: string) => p.locator(".tarjeta", { hasText: nombre });

async function cuentaConDosPedidas(p: Page, nombre: string) {
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByPlaceholder("Nombre", { exact: true }).fill(nombre);
  const primero = p.locator("main > section .producto").first();
  await primero.click(); await primero.click();
  await p.locator(".pie-fijo .principal").click();
  await tarjeta(p, nombre).click();
  await p.getByRole("button", { name: /＋ Pedida/ }).click();
  await p.locator("main > section .producto").nth(1).click();
  await p.locator(".pie-fijo .principal").click();
}

test("un grupo paga por partes: una pedida, la mitad de lo que falta y el resto", async ({ browser }) => {
  const p = await celular(browser);
  const nombre = `Grupo que divide ${Date.now() % 10000}`;
  await cuentaConDosPedidas(p, nombre);
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  const total = soloDigitos(await p.locator(".cobrar .total").innerText());

  // 1. Alguien paga la pedida 1 (dos del primer producto).
  await p.getByRole("button", { name: "Productos" }).click();
  await p.locator(".abono-ronda-cabeza", { hasText: "Pedida 1" }).click();
  const boton = p.locator(".pie-fijo .principal");
  await expect(boton).toHaveText(/^Abonar /);
  const pedida1 = soloDigitos(await boton.innerText());
  await p.getByRole("button", { name: "Exacto" }).click();
  await p.getByPlaceholder("¿Quién paga? (opcional)").fill("Juan");
  await p.keyboard.press("Enter"); // ✓ del teclado: lo baja y vuelve el botón
  await boton.click();
  await expect(p.locator(".aviso")).toContainText("abono de Juan");
  await expect(p.locator(".cobrar .abonado")).toContainText("Juan");
  // En el siguiente abono, «Juan» sale para tocarlo sin escribir.
  await p.getByRole("button", { name: "Valor" }).click();
  await expect(p.locator(".quien-paga .chip", { hasText: "Juan" })).toBeVisible();
  await p.getByRole("button", { name: "Todo" }).click();
  await expect(p.locator(".cobrar .total")).toHaveText(new RegExp((total - pedida1).toLocaleString("es-CO")));
  await expect(p.locator(".cobrar .abonado")).toContainText(pedida1.toLocaleString("es-CO"));

  // 2. Otro paga la mitad de lo que falta por Nequi.
  const falta = total - pedida1;
  await p.getByRole("button", { name: "Valor" }).click();
  // Dividir: con un abono hecho propone «entre 2, ya pagó 1»; aquí la mitad de lo que falta
  // es entre 2 sin contar ese abono.
  await p.getByRole("button", { name: "👥 Dividir entre varios" }).click();
  await p.getByRole("button", { name: "Uno menos ya pagó" }).click();
  await expect(p.locator(".cada-uno")).toContainText("Faltan 2");
  const mitad = Math.ceil(falta / 2 / 100) * 100;
  await p.getByRole("button", { name: "Nequi" }).click();
  await expect(boton).toHaveText(new RegExp(`Abonar .*${mitad.toLocaleString("es-CO")}`));
  await boton.click();
  await expect(p.locator(".cobrar .total")).toHaveText(new RegExp((falta - mitad).toLocaleString("es-CO")));

  // 3. El último paga el resto: queda cobrada.
  await p.getByRole("button", { name: "Efectivo" }).click();
  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".aviso")).toContainText(`${nombre}: cobrada`);
  await expect(tarjeta(p, nombre)).toHaveCount(0);
  await p.getByRole("button", { name: /Cerradas hoy/ }).click();
  await p.locator(".tarjeta.cerrada", { hasText: nombre }).click();
  await expect(p.locator(".estado.cobrada")).toContainText("nequi");
});

test("el detalle muestra los abonos y lo pagado; «Deshacer» deshace solo ese abono", async ({ browser }) => {
  const p = await celular(browser);
  const nombre = `Con abono ${Date.now() % 10000}`;
  await cuentaConDosPedidas(p, nombre);
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  const total = soloDigitos(await p.locator(".cobrar .total").innerText());
  await p.getByRole("button", { name: "Productos" }).click();
  await p.locator(".abono-ronda-cabeza", { hasText: "Pedida 2" }).click();
  await p.getByRole("button", { name: "Nequi" }).click();
  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".aviso")).toContainText("abono");

  await p.goBack();
  await expect(p.locator(".estado.abonada")).toContainText("falta");
  await expect(p.locator(".abono-fila")).toHaveCount(1);
  // Cada producto abonado dice de qué pedida es, y se pone quién pagó desde aquí.
  await expect(p.locator(".abono-fila")).toContainText("(Pedida 2)");
  await p.locator(".abono-fila").getByRole("button", { name: "✎ ¿Quién?" }).click();
  await p.getByLabel("Quién pagó este abono").fill("Pedro");
  await p.getByRole("button", { name: "Guardar" }).click();
  await expect(p.locator(".abono-fila .pagador")).toHaveText("Pedro: ");
  await expect(p.locator(".abono-fila").getByRole("button", { name: "✎ Cambiar quién" })).toBeVisible();
  await p.getByRole("button", { name: "Pedidas" }).click();
  await expect(p.locator(".ficha.pagada")).toHaveCount(1);

  await p.locator(".abono-fila").getByRole("button", { name: "Deshacer" }).click();
  await expect(p.locator(".abono-fila")).toHaveCount(0);
  await expect(p.locator(".cabeza-total .total")).toHaveText(new RegExp(total.toLocaleString("es-CO")));
  // Se cobra todo: no queda una cuenta abierta que les cambie las medidas a otras pruebas.
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  await p.locator(".pie-fijo .principal").click();
  await expect(p.locator(".aviso")).toContainText(`${nombre}: cobrada`);
});

// Capturas de los modos de abono en los tamaños reales (solo con AUDITORIA_SALIDA).
for (const [aparato, viewport] of Object.entries(APARATOS)) {
  test(`abonos a la vista · ${aparato}`, async ({ browser }) => {
    const salida = process.env.AUDITORIA_SALIDA;
    test.skip(!salida, "solo para capturas");
    const p = await celular(browser, "Administrador", { viewport, hasTouch: true, isMobile: true });
    const nombre = `Abonos ${aparato}`;
    await cuentaConDosPedidas(p, nombre);
    await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
    await p.getByRole("button", { name: "Productos" }).click();
    await p.locator(".abono-ronda-cabeza", { hasText: "Pedida 1" }).click();
    await p.screenshot({ path: `${salida}/${aparato}-productos.png` });
    await p.getByRole("button", { name: "Valor" }).click();
    await p.getByRole("button", { name: /^Entre 3/ }).click();
    await p.screenshot({ path: `${salida}/${aparato}-valor.png` });
    await p.context().close();
  });
}

test("dividir entre 7 cuando ya abonaron 2: cada uno paga lo mismo y la división se recuerda", async ({ browser }) => {
  const p = await celular(browser);
  const nombre = `Grupo de siete ${Date.now() % 10000}`;
  await cuentaConDosPedidas(p, nombre);
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  const boton = p.locator(".pie-fijo .principal");
  // Dos abonos sueltos de 1.000.
  for (let i = 0; i < 2; i++) {
    await p.getByRole("button", { name: "Valor" }).click();
    await p.getByLabel("Valor del abono").fill("1000");
    await p.keyboard.press("Enter");
    await boton.click();
    await expect(p.locator(".aviso")).toContainText("abono");
  }
  const falta = soloDigitos(await p.locator(".cobrar .total").innerText());
  await p.getByRole("button", { name: "Valor" }).click();
  await p.getByRole("button", { name: "👥 Dividir entre varios" }).click();
  const masUno = p.getByRole("button", { name: "Una persona más" });
  for (let i = 0; i < 4; i++) await masUno.click(); // de 3 a 7
  await expect(p.locator(".dividir-cuenta .paso b").first()).toHaveText("7");
  await expect(p.locator(".cada-uno")).toContainText("Faltan 5");
  // En el teléfono no se sale de la pantalla (eso tapaba el botón de abonar).
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const parte = Math.ceil(falta / 5 / 100) * 100;
  await expect(boton).toHaveText(new RegExp(`Abonar .*${parte.toLocaleString("es-CO")}`));
  await p.screenshot({ path: "test-results/capturas/dividir.png" });
  await boton.click();
  await expect(p.locator(".aviso")).toContainText("abono");
  // Que el abono ya esté en el servidor antes de recargar (así lo trae de vuelta).
  const { token, base } = await sesionApi(p.context().request);
  await expect.poll(async () => {
    const d = (await (await p.context().request.post("/api/ops", { headers: { authorization: `Bearer ${token}` }, data: { base, ops: [] } })).json()) as { estado: { cuentas: Record<string, { nombre: string; pagos: { entre?: number }[] }> } };
    return Object.values(d.estado.cuentas).find((x) => x.nombre === nombre)?.pagos.some((x) => x.entre === 7);
  }).toBe(true);
  // El siguiente: «Valor» ya trae su parte y dice que faltan 4, aunque se recargue la app.
  await p.reload();
  await p.getByRole("button", { name: "Valor" }).click();
  await expect(p.locator(".cada-uno")).toContainText("Faltan 4");
});
