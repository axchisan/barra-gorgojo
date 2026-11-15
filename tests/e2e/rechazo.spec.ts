// Rechazar un pedido a la barra (docs/04): comida pide, la barra dice «no se puede» con el
// motivo, y a comida le llega el aviso rojo hasta «Entendido».
import { expect, test } from "@playwright/test";
import { celular, sesionApi } from "./ayuda";

test("la barra rechaza un pedido con motivo y comida recibe el aviso", async ({ browser }) => {
  const barra = await celular(browser, "Administrador");
  const { token } = await sesionApi(barra.context().request);
  const api = (data: unknown) => barra.context().request.post("/api/admin/personas", { headers: { authorization: `Bearer ${token}` }, data });
  const id = ((await (await api({ accion: "crear", nombre: "Comida rechazo", rol: "operador" })).json()) as { persona: { id: string } }).persona.id;
  await api({ accion: "areas", id, areas: ["comida"] });
  await api({ accion: "horario", id, horario: null });

  const comida = await celular(browser, "Comida rechazo", { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  await comida.getByRole("button", { name: "Pedir a la barra" }).click();
  await comida.getByLabel("Detalles del pedido").fill("mesa del rechazo");
  await comida.keyboard.press("Enter");
  await comida.locator(".producto", { hasText: "GASEOSA" }).first().click();
  await comida.locator(".producto", { hasText: "RUBIA" }).first().click();
  await comida.locator(".pie-fijo .principal").click();
  await expect(comida.locator(".aviso")).toContainText("Pedido enviado a la barra");

  // La barra: «No se puede» → solo la gaseosa → «Se acabó».
  await barra.locator(".aviso-despacho").click();
  const tarjeta = barra.locator(".por-despachar .despacho", { hasText: "mesa del rechazo" });
  await tarjeta.getByRole("button", { name: "🚫 No se puede" }).click();
  const hoja = barra.locator(".hoja-rechazo");
  await hoja.getByRole("button", { name: /Rubia/ }).click(); // la rubia sí hay
  await hoja.getByRole("button", { name: "Se acabó" }).click();
  await hoja.getByRole("button", { name: "No se puede · avisar a comida" }).click();
  // La rubia sigue por despachar.
  await expect(tarjeta).toContainText("Rubia");
  await expect(tarjeta).not.toContainText("Gaseosa");

  // Comida: aviso rojo con el motivo, hasta «Entendido».
  const aviso = comida.locator(".aviso-rechazo");
  await expect(aviso).toContainText("La barra no pudo despachar", { timeout: 10_000 });
  await expect(aviso).toContainText("«Se acabó»");
  await aviso.getByRole("button", { name: "Entendido" }).click();
  await expect(comida.locator(".aviso-rechazo")).toHaveCount(0);
  await comida.reload();
  await expect(comida.locator(".conexion")).toHaveText(/Todo al día/);
  await expect(comida.locator(".aviso-rechazo")).toHaveCount(0); // ya visto en este aparato

  // Deja todo como estaba: la rubia se despacha (si no, el aviso de despacho le quita
  // espacio arriba a las demás pruebas, que comparten el servidor).
  await tarjeta.getByRole("button", { name: "Despachado" }).click();
  await expect(barra.locator(".aviso-despacho")).toHaveCount(0);
});
