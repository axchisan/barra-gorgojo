// Pedidos de los clientes por QR, de punta a punta (docs/20): el cliente pide desde la
// mesa, al personal le llega con aviso, lo acepta en parte y el cliente ve qué no había.
import { expect, test } from "./prueba";
import { celular, sesionApi } from "./ayuda";

test("un cliente pide por QR, la barra acepta una parte y el cliente ve la confirmación", async ({ browser }) => {
  const barra = await celular(browser);
  const { token } = await sesionApi(barra.context().request);
  const qr = (data: unknown) => barra.context().request.post("/api/admin/qr", { headers: { authorization: `Bearer ${token}` }, data });
  const lugar = ((await (await qr({ accion: "crear", tipo: "mesa", numero: 12 })).json()) as { lugar: { token: string } }).lugar;
  await qr({ accion: "encender", encendido: true });

  // El cliente, en su celular (sin vincular, sin PIN).
  const contexto = await browser.newContext();
  const cliente = await contexto.newPage();
  await cliente.goto(`/m/${lugar.token}`);
  await expect(cliente.locator(".cabeza-cliente")).toContainText("Mesa 12");
  const fila = (nombre: string) => cliente.locator(".carta li", { hasText: nombre }).first();
  await fila("Rubia").getByRole("button", { name: /más/ }).click();
  await fila("Rubia").getByRole("button", { name: /más/ }).click();
  await fila("Jugo").getByRole("button", { name: /más/ }).click(); // el jugo: sin sabores (otra prueba le pone sabores a la gaseosa)
  await cliente.getByPlaceholder(/Su nombre/).fill("los de rojo");
  await cliente.locator(".pedir").click();
  await expect(cliente.locator(".estado-cliente.pendiente")).toBeVisible();

  // La barra: aviso «📱 Pedido por QR» → quita la gaseosa → «Se acabó» → acepta 1 de 2.
  const aviso = barra.locator(".aviso-qr");
  await expect(aviso).toContainText("Mesa 12", { timeout: 10_000 });
  await aviso.click();
  const tarjeta = barra.locator(".solicitud", { hasText: "Mesa 12" });
  await expect(tarjeta).toContainText("los de rojo");
  await tarjeta.getByRole("button", { name: /Jugo/ }).click();
  await tarjeta.getByRole("button", { name: "Se acabó" }).click();
  await tarjeta.getByRole("button", { name: "Aceptar 1 de 2" }).click();
  await expect(barra.locator(".solicitud", { hasText: "Mesa 12" })).toHaveCount(0);

  // El cliente ve la confirmación y lo que no había.
  await expect(cliente.locator(".estado-cliente.aceptado")).toContainText("Confirmado", { timeout: 15_000 });
  await expect(cliente.locator(".estado-cliente.aceptado")).toContainText("Jugo");
  await expect(cliente.locator(".estado-cliente.aceptado")).toContainText("Se acabó");

  // En la barra quedó la cuenta «Mesa 12 · los de rojo» con las 2 Rubia.
  await barra.getByRole("button", { name: "Volver" }).click();
  await expect(barra.locator(".tarjeta", { hasText: "Mesa 12" })).toContainText("8.000");

  // Deja el servidor como estaba: los pedidos por QR, apagados.
  await qr({ accion: "encender", encendido: false });
});
