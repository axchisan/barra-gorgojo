// Notas de comida (2026-11-15): las notas que se escriben se aprenden como chips para ese
// tipo de plato, y la «📝 Nota larga» de la pedida.
import { expect, test } from "./prueba";
import { celular, sesionApi } from "./ayuda";

const TELEFONO = { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true };

test("comida: una nota escrita se vuelve chip para ese tipo de plato, y la nota larga va con la pedida", async ({ browser }) => {
  const p = await celular(browser, "Administrador", TELEFONO);
  const { token, base } = await sesionApi(p.context().request);
  const plato = (id: string, nombre: string, precio: number) => ({ id: `e2e-notas-${id}-${Date.now()}`, t: "producto", en: Date.now(),
    producto: { id, nombre, corto: "PICADA", categoria: "comida", precio, activo: true, fondo: "#8A4F2E", texto: "#FFFFFF", notas: ["Res", "Cerdo"] } });
  await p.context().request.post("/api/ops", { headers: { authorization: `Bearer ${token}` }, data: { base, ops: [plato("picada-notas-30", "Picadita $ 30.000", 30000), plato("picada-notas-50", "Picadita $ 50.000", 50000)] } });
  await p.locator(".segmentos.panel").getByRole("button", { name: "Comida" }).click();

  // Primera pedida: «Res» + texto propio.
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByRole("button", { name: "Picadita $ 30.000 con nota" }).click();
  await p.locator(".hoja").getByRole("button", { name: "Res", exact: true }).click();
  await p.locator(".hoja").getByLabel("Nota", { exact: true }).fill("chorizo y gallina");
  await p.locator(".hoja").getByRole("button", { name: "Agregar" }).click();
  // La nota larga de la pedida.
  await p.getByRole("button", { name: /📝 Nota/ }).click();
  await p.getByLabel("Nota de la pedida").fill("La picada sin yuca, bien tostada, y que salga con las sopas");
  await p.getByRole("button", { name: "Listo" }).click();
  await expect(p.locator(".nota-larga-vista")).toContainText("bien tostada");
  await p.locator(".pie-fijo .principal").click();

  // Otra pedida, con el otro plato de la misma familia: la nota escrita ya es un chip.
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  await p.getByRole("button", { name: "Picadita $ 50.000 con nota" }).click();
  await expect(p.locator(".hoja").getByRole("button", { name: "Res, chorizo y gallina" })).toBeVisible();
  await p.locator(".hoja .cerrar-hoja").click();
  await p.getByRole("button", { name: "Volver" }).click();

  // La nota larga quedó en la pedida.
  await p.locator(".tarjeta", { hasText: /Mesa · / }).first().click();
  await p.getByRole("button", { name: "Pedidas" }).click();
  await expect(p.locator(".ronda-tarjeta").first()).toContainText("bien tostada");
});
