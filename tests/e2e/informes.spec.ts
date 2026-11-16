// Informes por semana y mes (docs/02 «Informes»): con un historial de cuatro semanas
// importado (por la API solo se anota hasta un día atrás), la lista por semanas y meses,
// el informe con su comparación, un día abierto desde las barras y el CSV.
import { expect, test } from "./prueba";
import { celular, sesionApi } from "./ayuda";
import { jornada } from "../../src/dominio/estado";
import { claveDe, nombrePeriodo, otroPeriodo, sumarDias } from "../../src/dominio/informe";

const PRECIO: Record<string, number> = { rubia: 4000, light: 4500, roja: 3500, gaseosa: 3000, agua: 2500 };

/** Unas semanas de ventas inventadas (catálogo de ejemplo): más los fines de semana, comida a veces, fiado y cierres. */
function historial(hoy: string) {
  const ops: Record<string, unknown>[] = [];
  let n = 0;
  const id = () => `historia-${String(++n).padStart(5, "0")}`;
  for (let i = 27; i >= 1; i--) {
    const fecha = sumarDias(hoy, -i);
    const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    if (dia === 2) continue; // los martes no se abre
    const fuerte = dia === 0 || dia === 6;
    const base = Date.parse(`${fecha}T20:00:00Z`); // 3 p. m. en Colombia
    let efectivo = 0;
    const cuentas = fuerte ? 5 : 2 + (i % 3);
    for (let k = 0; k < cuentas; k++) {
      const cuenta = `c-${fecha}-${k}`;
      const en = base + k * 20 * 60_000;
      const lineas = [
        { id: id(), producto: ["rubia", "roja", "light"][k % 3], cantidad: 2 + ((i + k) % 6) },
        ...(k % 2 ? [{ id: id(), producto: ["gaseosa", "agua"][k % 2], cantidad: 1 }] : []),
      ];
      const comida = (k + i) % 4 === 0 ? [{ id: id(), producto: "otro", cantidad: 1 + (k % 2), precio: 15000, nombre: "Almuerzo", comida: true }] : [];
      const total = lineas.reduce((t, l) => t + PRECIO[l.producto] * l.cantidad, 0) + comida.reduce((t, l) => t + l.precio * l.cantidad, 0);
      ops.push({ id: id(), persona: "Administrador", en, t: "abrir", cuenta, nombre: `Cuenta ${k + 1}`, tipo: "grupo" });
      ops.push({ id: id(), persona: "Administrador", en: en + 1000, t: "anotar", cuenta, ronda: id(), lineas: [...lineas, ...comida] });
      const medio = k === 3 && i % 5 === 0 ? "deuda" : k % 3 === 2 ? "nequi" : "efectivo";
      if (medio === "efectivo") efectivo += total;
      ops.push({ id: id(), persona: "Administrador", en: en + 60 * 60_000, t: "cobrar", cuenta, pago: id(), medio, ...(medio === "deuda" ? { deudor: "Pedro" } : {}), ...(medio === "efectivo" ? { recibido: total } : {}) });
    }
    // Se cierra casi siempre; a veces sobra o falta, y un día se queda sin cerrar.
    if (i !== 4) ops.push({ id: id(), persona: "Administrador", en: base + 8 * 3600_000, t: "cerrar_jornada", fecha, contado: efectivo + (i === 9 ? -5000 : i === 16 ? 2000 : 0) });
  }
  return ops;
}

test("informes por semana y mes: lista, informe con comparación, un día desde las barras y el CSV", async ({ browser, request }) => {
  const hoy = jornada(Date.now());
  const { token } = await sesionApi(request);
  const r = await request.post("/api/admin/importar", {
    headers: { authorization: `Bearer ${token}`, "x-migracion": "migracion-solo-para-e2e" },
    data: { operaciones: historial(hoy) },
  });
  expect(r.ok(), await r.text()).toBe(true);
  const p = await celular(browser, "Administrador");

  await p.locator(".pestanas button", { hasText: "El día" }).click();
  await p.getByRole("button", { name: "📅 Días anteriores" }).click();
  await p.getByRole("tab", { name: "Semanas" }).click();
  const pasada = otroPeriodo("semana", claveDe("semana", hoy));
  const tarjeta = p.locator(".periodo", { hasText: nombrePeriodo("semana", pasada) });
  await expect(tarjeta).toContainText("La semana pasada");
  await expect(tarjeta.locator(".periodo-barritas i")).toHaveCount(7);
  await p.screenshot({ path: "test-results/capturas/informes-semanas.png" });
  await p.getByRole("tab", { name: "Meses" }).click();
  await expect(p.locator(".periodo").first()).toContainText(nombrePeriodo("mes", claveDe("mes", hoy)));
  await p.screenshot({ path: "test-results/capturas/informes-meses.png" });

  // El informe de la semana pasada: terminada, se compara con la anterior entera.
  await p.getByRole("tab", { name: "Semanas" }).click();
  await tarjeta.click();
  await expect(p.locator(".barra-superior strong")).toHaveText(nombrePeriodo("semana", pasada));
  await expect(p.locator(".informe-comparacion")).toContainText(/que la semana pasada \(\$/);
  await expect(p.locator(".informe-dia")).toHaveCount(7);
  await expect(p.locator(".informe-dia.sin")).toHaveCount(1); // el martes no se abrió
  await expect(p.locator(".informe-productos li").first()).toBeVisible();
  await p.screenshot({ path: "test-results/capturas/informe-semana.png", fullPage: true });

  // Anterior y siguiente; desde la semana en curso no hay siguiente.
  await p.getByRole("button", { name: "Semana siguiente" }).click();
  await expect(p.locator(".informe-pasos span")).toHaveText("esta semana");
  await expect(p.getByRole("button", { name: "Semana siguiente" })).toBeDisabled();
  await p.getByRole("button", { name: "Semana anterior" }).click();
  await expect(p.locator(".informe-pasos span")).toHaveText("la semana pasada");

  // Un día desde las barras abre ese día como «El día».
  await p.locator("button.informe-dia:not(:disabled)").first().click();
  await expect(p.locator(".dia-hero-titulo")).toHaveText("Vendido ese día");
  await p.goBack();

  // El CSV de la semana.
  const descarga = p.waitForEvent("download");
  await p.getByRole("button", { name: "Descargar el CSV de este semana" }).click();
  expect((await descarga).suggestedFilename()).toBe(`barra-semana-${pasada}.csv`);

  // El mes: con «¿Qué día se vende más?».
  await p.goBack();
  await p.getByRole("tab", { name: "Meses" }).click();
  await p.locator(".periodo").first().click();
  await expect(p.locator(".informe-semana h2")).toHaveText("¿Qué día se vende más?");
  await p.screenshot({ path: "test-results/capturas/informe-mes.png", fullPage: true });
});
