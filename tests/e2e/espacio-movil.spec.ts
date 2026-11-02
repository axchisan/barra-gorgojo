// Aprovechamiento del espacio en teléfono (fase C de docs/12; criterios en
// negocio/docs/11). Siembra un catálogo inventado del mismo tamaño que el real
// (7 cervezas, 8 gaseosas, 4 otros, con nombres largos) y 11 cuentas, y mide en cinco
// tamaños. Las metas se miden a 360 × 740; en tablet, que nada empeore.

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const TAMANOS = {
  pequeno: { width: 360, height: 740 },
  mediano: { width: 390, height: 844 },
  grande: { width: 412, height: 915 },
  tabletVertical: { width: 800, height: 1280 },
  tabletHorizontal: { width: 1280, height: 800 },
  // Los aparatos del negocio (2026-11-02): tablet HONOR, app instalada y en Chrome.
  tabletAppHorizontal: { width: 1097, height: 654 },
  tabletChromeHorizontal: { width: 1097, height: 558 },
  tabletAppVertical: { width: 686, height: 1030 },
  // Celular girado.
  telefonoHorizontal: { width: 740, height: 360 },
  telefonoHorizontalGrande: { width: 915, height: 412 },
} as const;
type Tamano = keyof typeof TAMANOS;

let n = 0;
// Ids fijos: si Playwright repite beforeAll (tras un fallo), el servidor no duplica nada.
const id = (p: string) => `esp-${p}-${String(++n).padStart(4, "0")}`;
const producto = (pid: string, nombre: string, corto: string, categoria: string, precio: number, fondo: string) =>
  ({ id: id("p"), t: "producto", en: Date.now(), producto: { id: pid, nombre, corto, categoria, precio, activo: true, fondo, texto: "#FFFFFF" } });

/** Siembra una vez por corrida (el servidor e2e arranca con base nueva). */
async function sembrar(request: APIRequestContext) {
  const r = await request.post("/api/entrar", { data: { persona: "Administrador", clave: "prueba" } });
  const { token, base } = (await r.json()) as { token: string; base: string };
  const ops = async (lista: unknown[]) => {
    const res = await request.post("/api/ops", { headers: { authorization: `Bearer ${token}` }, data: { base, ops: lista } });
    expect(res.status(), "siembra aceptada").toBe(200);
  };
  // Siempre todo, con los mismos ids: si se repite, el servidor no duplica nada.
  {
    await ops([
      producto("doble-malta", "Doble malta especial", "DOBLE MALTA", "cerveza", 4500, "#5B3A1E"),
      producto("naranja-1l", "Naranja 1 L", "NARANJA 1L", "gaseosa", 6000, "#F5A04A"),
      producto("agua-con-gas", "Agua con gas", "AGUA CON GAS", "gaseosa", 3500, "#1F4E8C"),
      producto("te-frio", "Té frío", "TÉ FRÍO", "gaseosa", 3000, "#3A2C1E"),
      producto("malta", "Malta", "MALTA", "gaseosa", 3000, "#7A1F1C"),
      producto("cigarrillo-suave", "Cigarrillo suave", "SUAVE", "cigarrillo", 800, "#6B5744"),
    ]);
  }
  const cuentas: [string, string, Record<string, unknown>, [string, number][]][] = [
    ["Grupo de Juan", "grupo", {}, [["rubia", 6], ["light", 2]]],
    ["Don Pedro", "persona", {}, [["negra", 3]]],
    ["Mesa 4", "mesa", { mesa: 4 }, [["gaseosa", 2], ["agua", 1]]],
    ["Cancha 1", "cancha", { cancha: "1" }, [["rubia", 15], ["roja", 15]]],
    ["Cancha 2 · los de rojo con nombre largo", "cancha", { cancha: "2" }, [["lager", 4]]],
    ["Los del camión", "grupo", {}, [["importada", 2]]],
    ["Señora del kiosko", "persona", {}, [["jugo", 1]]],
    ["Mesa 7", "mesa", { mesa: 7 }, [["gaseosa-litro", 1]]],
    ["Cuenta 9", "grupo", {}, [["rubia", 2]]],
    ["Profesor", "persona", {}, [["light", 1]]],
    ["Cancha pequeña", "cancha", { cancha: "pequena" }, [["negra", 2]]],
  ];
  const lista: unknown[] = [];
  for (const [nombre, tipo, extra, lineas] of cuentas) {
    const cuenta = id("c");
    lista.push({ id: id("a"), t: "abrir", cuenta, nombre, tipo, ...extra, en: Date.now() });
    lista.push({ id: id("r"), t: "anotar", cuenta, ronda: id("rd"), en: Date.now(), lineas: lineas.map(([producto, cantidad], i) => ({ id: `${cuenta}-${i}`, producto, cantidad })) });
  }
  // Una cobrada en efectivo, para que «El día» tenga cifras.
  const cobrada = id("c");
  lista.push({ id: id("a"), t: "abrir", cuenta: cobrada, nombre: "Ya pagó", tipo: "grupo", en: Date.now() });
  lista.push({ id: id("r"), t: "anotar", cuenta: cobrada, ronda: id("rd"), en: Date.now(), lineas: [{ id: `${cobrada}-0`, producto: "rubia", cantidad: 3 }] });
  lista.push({ id: id("p"), t: "cobrar", cuenta: cobrada, pago: id("pg"), medio: "efectivo", en: Date.now() });
  await ops(lista);
}

/** Zona útil: debajo de la cabecera fija y encima del pie fijo. */
const medir = (p: Page, selector: string) =>
  p.evaluate((sel) => {
    // Barras fijas de abajo; el panel lateral de horizontal no tapa la cuadrícula.
    const fijos = [...document.querySelectorAll(".pie-fijo, .pestanas")].map((e) => e.getBoundingClientRect()).filter((r) => r.top > innerHeight * 0.4).map((r) => r.top);
    const abajo = Math.min(innerHeight, ...fijos);
    const cab = document.querySelector(".barra-superior");
    const arriba = cab ? cab.getBoundingClientRect().bottom : 0;
    const els = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
    return {
      total: els.length,
      visibles: els.filter((r) => r.top >= arriba - 1 && r.bottom <= abajo + 1).length,
      columnas: new Set(els.filter((r) => Math.abs(r.top - (els[0]?.top ?? 0)) < 2).map((r) => Math.round(r.left))).size,
      primeroArriba: els[0] ? Math.round(els[0].top) : null,
      sinScrollHorizontal: document.documentElement.scrollWidth <= innerWidth,
    };
  }, selector);

/** Renglones que ocupa el texto de cada elemento. */
const renglones = (p: Page, selector: string) =>
  p.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => {
    const rango = document.createRange();
    rango.selectNodeContents(e);
    return new Set([...rango.getClientRects()].map((r) => Math.round(r.top))).size;
  }), selector);

async function entrar(p: Page) {
  await p.goto("/");
  await p.getByRole("button", { name: "Administrador", exact: true }).click();
  await p.locator("input[type=password]").fill("prueba");
  await p.getByRole("button", { name: "Entrar" }).click();
  await expect(p.locator(".conexion")).toHaveText(/Todo al día|●/);
  await expect(p.locator(".tarjeta").first()).toBeVisible();
}

const resultados: Partial<Record<Tamano, Record<string, unknown>>> = {};

test.describe("espacio en teléfono", () => {
  test.beforeAll(async ({ request }) => sembrar(request));

  for (const [nombre, viewport] of Object.entries(TAMANOS) as [Tamano, (typeof TAMANOS)[Tamano]][]) {
    test(`${nombre} ${viewport.width}×${viewport.height}`, async ({ browser }) => {
      const contexto = await browser.newContext({ viewport, hasTouch: true, isMobile: viewport.width < 700, deviceScaleFactor: 2 });
      const p = await contexto.newPage();
      const m: Record<string, unknown> = {};
      await entrar(p);

      // Inicio
      const inicio = await medir(p, ".tarjetas .tarjeta");
      m.inicioColumnas = inicio.columnas;
      m.inicioVisibles = inicio.visibles;
      m.cabecera = Math.round((await p.locator(".barra-superior").boundingBox())!.height);
      expect(inicio.sinScrollHorizontal, "inicio sin desplazamiento horizontal").toBe(true);

      // Nueva cuenta
      await p.getByRole("button", { name: "＋ Nueva cuenta" }).click();
      const nueva = await medir(p, "main > section .producto");
      m.nuevaPrimero = nueva.primeroArriba;
      m.nuevaVisibles = nueva.visibles;
      m.productosColumnas = nueva.columnas;
      // Ningún nombre se sale de su botón (en la tablet real pasó con letra más ancha).
      m.nombresCaben = await p.evaluate(() => [...document.querySelectorAll("main > section .producto")].every((b) => b.scrollWidth <= b.clientWidth + 1));
      m.petacosEnUnaFila = await p.evaluate(() => new Set([...document.querySelectorAll(".petacos button")].map((b) => Math.round(b.getBoundingClientRect().top))).size === 1);
      expect(nueva.sinScrollHorizontal, "nueva cuenta sin desplazamiento horizontal").toBe(true);

      // Petaco mixto: el «+5» no tapa el nombre
      await p.getByRole("button", { name: /Mixto|Petaco mixto/ }).first().click();
      m.mixtoSinTapar = await p.evaluate(() => [...document.querySelectorAll(".hoja .producto-celda")].every((celda) => {
        const mas = celda.querySelector(".mas-cinco")?.getBoundingClientRect();
        const nombre = celda.querySelector(".corto")?.getBoundingClientRect();
        if (!mas || !nombre) return true;
        return mas.right <= nombre.left || mas.left >= nombre.right || mas.bottom <= nombre.top || mas.top >= nombre.bottom;
      }));
      await p.getByRole("button", { name: "Cerrar" }).click();
      await expect(p.locator(".hoja")).toHaveCount(0);
      await p.goBack();

      // Cuenta abierta: todas las cervezas y gaseosas sin desplazar
      await p.locator(".tarjeta", { hasText: "Grupo de Juan" }).click();
      await p.getByRole("button", { name: /＋ Pedida/ }).click();
      const secciones = await p.evaluate(() => {
        const fijos = [...document.querySelectorAll(".pie-fijo")].map((e) => e.getBoundingClientRect()).filter((r) => r.top > innerHeight * 0.4).map((r) => r.top);
        const abajo = Math.min(innerHeight, ...fijos);
        const todos = [...document.querySelectorAll("main > section .producto")].map((e) => e.getBoundingClientRect());
        const sec = [...document.querySelectorAll("main > section")].slice(0, 2);
        const prods = sec.flatMap((s) => [...s.querySelectorAll(".producto")]).map((e) => e.getBoundingClientRect());
        return { total: prods.length, visibles: prods.filter((r) => r.bottom <= abajo + 1 && r.top >= 0).length, abajo: Math.round(abajo), ultimo: Math.round(Math.max(...prods.map((r) => r.bottom))), alto: Math.round(prods[0]?.height ?? 0),
        todosVisibles: todos.filter((r) => r.bottom <= abajo + 1 && r.top >= 0).length, todos: todos.length };
      });
      m.abiertaCervezasYGaseosas = `${secciones.visibles}/${secciones.total} (último ${secciones.ultimo}, pie ${secciones.abajo}, alto ${secciones.alto})`;
      m.abiertaTodas = secciones.visibles === secciones.total;
      m.abiertaConOtro = `${secciones.todosVisibles}/${secciones.todos}`;
      m.repetirAlto = Math.round((await p.locator(".repetir").boundingBox())!.height);
      await p.goBack();
      await p.goBack();

      // Cobrar: los billetes no parten la cifra
      await p.locator(".tarjeta", { hasText: "Señora del kiosko" }).click();
      await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
      const lineas = await renglones(p, ".recibido .chip");
      m.billetesEnUnaLinea = lineas.every((x) => x === 1);
      expect(lineas.length, "hay billetes para medir").toBeGreaterThan(1);
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "cobrar sin desplazamiento horizontal").toBe(true);
      await p.goBack();
      await p.goBack();

      // El día: el cuadre de caja a la vista
      await p.locator(".pestanas button").nth(2).click();
      const dia = await medir(p, ".dia .caja input");
      m.diaCuadreVisible = dia.visibles === 1;
      expect(dia.sinScrollHorizontal, "el día sin desplazamiento horizontal").toBe(true);

      resultados[nombre] = m;
      console.log(nombre, JSON.stringify(m));

      // Metas
      expect(m.billetesEnUnaLinea, "C9: billetes en una línea").toBe(true);
      expect(m.nombresCaben, "los nombres caben en sus botones").toBe(true);
      expect(m.mixtoSinTapar, "C8: el +5 no tapa el nombre").toBe(true);
      if (nombre === "pequeno") {
        expect(m.inicioColumnas, "C1: 2 columnas de cuentas").toBe(2);
        expect(m.inicioVisibles, "C1: al menos 8 cuentas visibles").toBeGreaterThanOrEqual(8);
        expect(m.productosColumnas, "C2: 3 columnas de productos").toBe(3);
        expect(m.abiertaTodas, "C2: cervezas y gaseosas visibles en una cuenta abierta").toBe(true);
        expect(m.nuevaPrimero as number, "C3: primer producto a menos de 220 px").toBeLessThan(220);
        expect(m.nuevaVisibles, "C3: al menos 9 productos visibles").toBeGreaterThanOrEqual(9);
        expect(m.petacosEnUnaFila, "C4: selector de petacos en una fila").toBe(true);
        expect(m.repetirAlto as number, "C5: «Repetir» en una línea").toBeLessThanOrEqual(48);
        expect(m.diaCuadreVisible, "C10: «Efectivo contado» visible").toBe(true);
        expect(m.cabecera as number, "C11: cabecera de 52 px").toBeLessThanOrEqual(52);
      }
      if (nombre === "tabletVertical" || nombre === "tabletHorizontal") {
        // Que la tablet no empeore: medidas de la versión 0.1 (2026-11-02).
        const base = nombre === "tabletVertical" ? { cuentas: 3, productos: 6 } : { cuentas: 5, productos: 7 };
        expect(m.inicioColumnas as number, "tablet: columnas de cuentas").toBeGreaterThanOrEqual(base.cuentas);
        expect(m.productosColumnas as number, "tablet: columnas de productos").toBeGreaterThanOrEqual(base.productos);
        expect(m.nuevaVisibles as number, "tablet: productos visibles en nueva cuenta").toBeGreaterThanOrEqual(19);
        expect(m.abiertaTodas, "tablet: cervezas y gaseosas visibles").toBe(true);
      }
      if (nombre === "tabletAppHorizontal" || nombre === "tabletAppVertical") {
        // La tablet de la barra, en la app instalada: todo el catálogo sin desplazar.
        expect(m.abiertaConOtro, "tablet de la barra: todos los productos visibles al anotar").toBe("19/19");
        expect(m.inicioVisibles as number, "tablet de la barra: las 11 cuentas visibles").toBeGreaterThanOrEqual(11);
      }
      if (nombre === "tabletChromeHorizontal") {
        expect(m.abiertaTodas, "tablet en Chrome: cervezas y gaseosas visibles").toBe(true);
      }
      if (nombre === "telefonoHorizontal" || nombre === "telefonoHorizontalGrande") {
        // Celular girado: muy poco alto. Que se puedan anotar las cervezas sin desplazar.
        expect(m.nuevaPrimero as number, "celular girado: primer producto arriba").toBeLessThan(180);
        expect(m.cabecera as number, "celular girado: cabecera compacta").toBeLessThanOrEqual(52);
      }
      await contexto.close();
    });
  }
});
