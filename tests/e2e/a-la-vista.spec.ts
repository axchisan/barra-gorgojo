// «Todo a la vista» (C2 de docs/12, pedido del negocio el 2026-11-02): en cada vista de
// venta, lo necesario para terminar la acción se ve completo sin deslizar, en el celular y
// la tablet del negocio, en vertical y girados. Mide, guarda captura y comprueba.

import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { celular, sesionApi } from "./ayuda";

export const APARATOS = {
  celularVertical: { width: 360, height: 746 },
  celularGirado: { width: 768, height: 301 },
  tabletVertical: { width: 686, height: 1030 },
  tabletGirada: { width: 1097, height: 654 },
} as const;
type Aparato = keyof typeof APARATOS;

const SALIDA = process.env.AUDITORIA_SALIDA;

/**
 * Qué tan a la vista está cada cosa: «sí» si está completa dentro de la pantalla y no la
 * tapa una barra fija; si no, cuánto falta.
 */
const medir = (p: Page, cosas: Record<string, string>) =>
  p.evaluate((cosas) => {
    const r: Record<string, string> = {};
    for (const [nombre, sel] of Object.entries(cosas)) {
      const els = [...document.querySelectorAll(sel)].filter((e) => (e as HTMLElement).offsetParent !== null || getComputedStyle(e).position === "fixed");
      if (!els.length) { r[nombre] = "no está"; continue; }
      const fuera = els.filter((e) => {
        const b = e.getBoundingClientRect();
        if (b.top < -1 || b.bottom > innerHeight + 1 || b.left < -1 || b.right > innerWidth + 1) return true;
        // ¿Lo tapa una barra fija? Se mira qué elemento hay en su centro.
        const x = Math.min(innerWidth - 1, Math.max(0, b.left + b.width / 2));
        const y = Math.min(innerHeight - 1, Math.max(0, b.top + b.height / 2));
        const arriba = document.elementFromPoint(x, y);
        return !!arriba && !e.contains(arriba) && !arriba.contains(e) && !!arriba.closest(".pie-fijo, .pestanas, .barra-superior, .aviso");
      });
      r[nombre] = fuera.length === 0 ? "sí" : els.length === 1 ? "no" : `${els.length - fuera.length} de ${els.length}`;
    }
    r.desliza = document.documentElement.scrollHeight > innerHeight + 2 ? "sí" : "no";
    return r;
  }, cosas);

/** Nombres de producto con alguna palabra partida en dos renglones («GASEOS-A»). */
const palabrasPartidas = (p: Page) =>
  p.evaluate(() => {
    const partidas: string[] = [];
    for (const e of document.querySelectorAll("main > section .producto .corto")) {
      const texto = e.firstChild;
      if (!texto || texto.nodeType !== Node.TEXT_NODE) continue;
      let i = 0;
      for (const palabra of (texto.textContent ?? "").split(" ")) {
        const r = document.createRange();
        r.setStart(texto, i);
        r.setEnd(texto, i + palabra.length);
        if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) partidas.push(palabra);
        i += palabra.length + 1;
      }
    }
    return partidas;
  });

const informe: Record<string, Record<string, Record<string, string>>> = {};

for (const [aparato, viewport] of Object.entries(APARATOS) as [Aparato, (typeof APARATOS)[Aparato]][]) {
  test(`todo a la vista · ${aparato} ${viewport.width}×${viewport.height}`, async ({ browser }) => {
    // Datos: una cuenta con varias pedidas y comida, para que las vistas tengan contenido.
    const p = await celular(browser, "Administrador", { viewport, hasTouch: true, isMobile: true });
    const { token, base } = await sesionApi(p.context().request);
    const cuenta = `vista-${aparato}`;
    const linea = (producto: string, cantidad: number, i: number) => ({ id: `${cuenta}-${i}`, producto, cantidad });
    // Catálogo del tamaño del real (7 cervezas, 8 gaseosas, 4 otros), con nombres largos.
    const extra = (pid: string, nombre: string, corto: string, categoria: string, precio: number, fondo: string) =>
      ({ id: `vista-prod-${pid}`, t: "producto", en: Date.now(), producto: { id: pid, nombre, corto, categoria, precio, activo: true, fondo, texto: "#FFFFFF" } });
    await p.context().request.post("/api/ops", { headers: { authorization: `Bearer ${token}` }, data: { base, ops: [
      extra("doble-malta", "Doble malta especial", "DOBLE MALTA", "cerveza", 4500, "#5B3A1E"),
      extra("naranja-1l", "Naranja 1 L", "NARANJA 1L", "gaseosa", 6000, "#F5A04A"),
      extra("agua-con-gas", "Agua con gas", "AGUA CON GAS", "gaseosa", 3500, "#1F4E8C"),
      extra("te-frio", "Té frío", "TÉ FRÍO", "gaseosa", 3000, "#3A2C1E"),
      extra("malta", "Malta", "MALTA", "gaseosa", 3000, "#7A1F1C"),
      extra("cigarrillo-suave", "Cigarrillo suave", "SUAVE", "cigarrillo", 800, "#6B5744"),
    ] } });
    await p.context().request.post("/api/ops", { headers: { authorization: `Bearer ${token}` }, data: { base, ops: [
      { id: `${cuenta}-a`, t: "abrir", cuenta, nombre: `Grupo ${aparato}`, tipo: "grupo", en: Date.now() },
      { id: `${cuenta}-r1`, t: "anotar", cuenta, ronda: `${cuenta}-r1`, en: Date.now(), lineas: [linea("rubia", 6, 1), linea("light", 2, 2), linea("gaseosa", 3, 3)] },
      { id: `${cuenta}-r2`, t: "anotar", cuenta, ronda: `${cuenta}-r2`, en: Date.now(), lineas: [linea("negra", 4, 4), { id: `${cuenta}-5`, producto: "otro", cantidad: 1, precio: 45000, nombre: "Almuerzo", comida: true }] },
    ] } });
    await p.reload();
    await expect(p.locator(".tarjeta", { hasText: `Grupo ${aparato}` })).toBeVisible();
    const m: Record<string, Record<string, string>> = {};
    const foto = async (n: string) => {
      if (!SALIDA) return;
      mkdirSync(`${SALIDA}/${aparato}`, { recursive: true });
      await p.screenshot({ path: `${SALIDA}/${aparato}/${n}.png` });
    };

    m.inicio = await medir(p, { cuenta: ".tarjeta", nuevaCuenta: ".pie-fijo .principal", pestanas: ".pestanas button" });
    await foto("1-inicio");

    await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
    m.nuevaCuenta = await medir(p, { tipo: ".segmentos.tipos button", productos: "main > section .producto", abrir: ".pie-fijo .principal", cobrarYa: ".pie-fijo .secundario" });
    // Hasta 8 letras nunca se parten (los nombres reales más largos: CORONITA, POSTOBÓN,
    // KENTUCKY). Más largas, en el celular girado no caben legibles: se sugiere abreviar.
    const partidas = await palabrasPartidas(p);
    m.nuevaCuenta.palabrasPartidas = partidas.filter((x) => x.length <= 8).join(", ") || "ninguna";
    m.nuevaCuenta.abreviar = [...new Set(partidas.filter((x) => x.length > 8))].join(", ") || "nada";
    await foto("2-nueva");
    await p.locator(".producto.otro").first().click();
    m.hojaOtro = await medir(p, { nombre: ".fila-otro input", barraComida: ".fila-otro .segmentos button", valores: ".valores .producto", otroValor: ".hoja form input", agregar: ".hoja form button", cerrar: ".cerrar-hoja" });
    await foto("3-otro");
    await p.getByRole("button", { name: "Cerrar" }).click();
    await p.getByRole("button", { name: "Petaco mixto" }).click();
    m.hojaMixto = await medir(p, { cervezas: ".hoja .producto", masCinco: ".hoja .mas-cinco", agregar: ".hoja .fila-botones .principal", cerrar: ".cerrar-hoja" });
    await foto("4-mixto");
    await p.getByRole("button", { name: "Cerrar" }).click();
    await p.goBack();

    await p.locator(".tarjeta", { hasText: `Grupo ${aparato}` }).click();
    m.detalle = await medir(p, { total: ".cabeza-total .total", productos: ".prod-tarjeta", pedida: ".pie-fijo .secundario", cobrar: ".pie-fijo .principal" });
    await foto("5-detalle");
    await p.getByRole("button", { name: "Pedidas" }).click();
    await p.locator(".ficha").first().click();
    m.editarLinea = await medir(p, { cantidad: ".editar-fila .cantidad button", guardar: ".editar-fila .principal", anular: ".editar-fila .peligro" });
    await foto("6-editar-linea");
    await p.getByRole("button", { name: "Cancelar" }).click();

    await p.getByRole("button", { name: /＋ Pedida/ }).click();
    m.anotar = await medir(p, { repetir: ".repetir", petacos: ".segmentos.petacos button", productos: "main > section .producto", anotar: ".pie-fijo .principal" });
    await foto("7-anotar");
    await p.goBack();

    await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
    m.cobrar = await medir(p, { total: ".cobrar .total", medios: ".cobrar > .opciones .chip", billetes: ".recibido .chip", otroValor: ".recibido input", cobrar: ".pie-fijo .principal" });
    await foto("8-cobrar");
    await p.goBack(); await p.goBack();

    await p.locator(".pestanas button").nth(2).click();
    m.elDia = await medir(p, { vendido: ".cifra.grande", efectivoContado: ".dia .caja input" });
    await foto("9-el-dia");

    informe[aparato] = m;
    // Exigencias: cada cosa medida completa en pantalla; ninguna palabra corta partida.
    const fallas = Object.entries(m).flatMap(([vista, r]) => Object.entries(r)
      .filter(([k, x]) => !["desliza", "abreviar"].includes(k) && (k === "palabrasPartidas" ? x !== "ninguna" : x !== "sí"))
      .map(([k, x]) => `${vista}.${k}: ${x}`));
    expect.soft(fallas, `${aparato}: lo que no queda a la vista`).toEqual([]);
    console.log(`\n${aparato}\n${Object.entries(m).map(([v, r]) => `  ${v.padEnd(12)} ${Object.entries(r).map(([k, x]) => `${k}:${x}`).join("  ")}`).join("\n")}`);
    if (SALIDA) writeFileSync(`${SALIDA}/${aparato}/medidas.json`, JSON.stringify(m, null, 1));
    await p.context().close();
  });
}
