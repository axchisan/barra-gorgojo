// Mantener presionado en el teléfono (docs/02 «Opciones de un producto»): con un toque largo
// de verdad (eventos táctiles), no debe quedar texto seleccionado ni salir el menú de copiar.
import { expect, test } from "@playwright/test";
import { celular, sesionApi } from "./ayuda";

const TELEFONO = { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true };

test("un toque largo en un producto con opciones abre la hoja sin seleccionar texto", async ({ browser }) => {
  const p = await celular(browser, "Administrador", TELEFONO);
  // Una opción para la gaseosa, por la API.
  const { token, base } = await sesionApi(p.context().request);
  await p.context().request.post("/api/ops", { headers: { authorization: `Bearer ${token}` }, data: { base, ops: [
    { id: `e2e-op-${Date.now()}`, t: "producto", en: Date.now(), producto: { id: "colombiana-e2e", nombre: "Colombiana (personal)", corto: "COLOMBIANA", categoria: "gaseosa", precio: 3000, activo: true, fondo: "#E8892B", texto: "#241206", padre: "gaseosa" } },
  ] } });
  await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
  const boton = p.locator("main > section .producto.con-opciones").first();
  await expect(boton).toBeVisible();
  const caja = (await boton.boundingBox())!;
  const x = caja.x + caja.width / 2, y = caja.y + caja.height / 2;
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await p.waitForTimeout(900);
  const seleccion = await p.evaluate(() => window.getSelection()?.toString() ?? "");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(p.locator(".hoja-opciones")).toBeVisible();
  expect(seleccion, "texto seleccionado durante el toque largo").toBe("");
  // El toque corto que sigue no cuenta como selección ni abre otra cosa.
  expect(await p.evaluate(() => getComputedStyle(document.querySelector(".producto .corto")!).webkitUserSelect || getComputedStyle(document.querySelector(".producto .corto")!).userSelect)).toBe("none");
});
