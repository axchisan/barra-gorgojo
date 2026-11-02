// Recorre todas las pantallas de la app y guarda, de cada una, captura y HTML.
// Sirve para comprobar que un cambio de código no cambia lo que se ve (A3) y para
// las capturas de antes y después de la fase C.
//
//   node scripts/recorrido.mjs <carpeta-de-salida> [dirección] [hora-fija-ISO]
//   TAMANO=telefono node scripts/recorrido.mjs …   # solo un tamaño
//
// Necesita la app corriendo (`pnpm dev`, clave local en .dev.vars) con la base vacía,
// una base nueva por tamaño (los nombres «Cuenta N» dependen de lo ya abierto).
// La hora se fija para que «hace N min» y las horas salgan iguales en cada pasada.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [salida, dir = "http://localhost:8787", hora = "2026-11-02T15:00:00Z"] = process.argv.slice(2);
if (!salida) {
  console.error("Uso: node scripts/recorrido.mjs <carpeta-de-salida> [dirección] [hora-fija-ISO]");
  process.exit(1);
}
const CLAVE = process.env.CLAVE ?? "prueba";
const TAMANOS = { telefono: { width: 360, height: 740 }, tablet: { width: 800, height: 1280 } };

const navegador = await chromium.launch();
let total = 0;
for (const [nombreTamano, viewport] of Object.entries(TAMANOS)) {
  if (process.env.TAMANO && process.env.TAMANO !== nombreTamano) continue;
  const carpeta = join(salida, nombreTamano);
  mkdirSync(carpeta, { recursive: true });
  const contexto = await navegador.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true });
  const p = await contexto.newPage();
  await p.clock.setFixedTime(new Date(hora));
  let n = 0;

  const alDia = async () => {
    const c = p.locator(".conexion");
    if (await c.count()) await p.locator(".conexion.ok", { hasText: "Todo al día" }).waitFor({ timeout: 10_000 });
  };
  const foto = async (nombre) => {
    await alDia();
    await p.waitForTimeout(150);
    const archivo = `${String(++n).padStart(2, "0")}-${nombre}`;
    await p.screenshot({ path: join(carpeta, `${archivo}.png`), fullPage: true });
    writeFileSync(join(carpeta, `${archivo}.html`), (await p.locator("#raiz").innerHTML()).replace(/></g, ">\n<"));
    total++;
  };
  const toca = (texto, opciones = {}) => p.getByRole("button", { name: texto, exact: true, ...opciones }).first().click();
  const producto = (i) => p.locator("main > section .producto").nth(i).click();

  // Entrada limpia
  await p.goto(dir);
  await p.evaluate(() => { localStorage.clear(); history.replaceState({ vista: { v: "inicio", pestana: "cuentas" }, d: 0 }, ""); });
  await p.reload();
  await foto("entrada");
  await toca("Administrador");
  await p.locator("input[type=password]").fill(CLAVE);
  await toca("Entrar");
  await p.locator(".inicio").waitFor();
  await foto("inicio-vacio");

  // Cuenta de grupo
  await toca("＋ Nueva cuenta");
  await foto("nueva");
  await producto(0); await producto(0); await producto(1);
  await foto("nueva-con-productos");
  await p.locator(".pie-fijo .principal").click();

  // Mesa
  await toca("＋ Nueva cuenta");
  await toca("Mesa");
  await p.locator("input.numero").fill("4");
  await producto(2);
  await foto("nueva-mesa");
  await p.locator(".pie-fijo .principal").click();

  // Cancha, por petaco
  await toca("＋ Nueva cuenta");
  await toca("Cancha");
  await toca("Cancha 1");
  await toca("Medio petaco: 15");
  await producto(0);
  await foto("nueva-cancha-petaco");
  await p.locator(".pie-fijo .principal").click();
  await foto("inicio");

  // Detalle de la cuenta de grupo
  await p.locator(".tarjeta", { hasText: "Cuenta 1" }).click();
  await foto("detalle");
  await toca("Pedidas");
  await foto("detalle-pedidas");
  await p.locator(".ficha").first().click();
  await foto("editar-linea");
  await toca("Cancelar");

  // Anotar en cuenta existente, con «Otro» y petaco mixto
  await toca("＋ Pedida");
  await foto("anotar-existente");
  await p.locator(".producto.otro").first().click();
  await foto("hoja-otro");
  await p.locator(".hoja input").first().fill("Picada");
  await toca("🍽 Comida");
  await p.locator(".hoja .producto.neutro").nth(2).click();
  await toca("Petaco mixto");
  await foto("hoja-mixto");
  for (let i = 0; i < 3; i++) await p.locator(".hoja .mas-cinco").nth(0).click();
  for (let i = 0; i < 3; i++) await p.locator(".hoja .mas-cinco").nth(1).click();
  await foto("hoja-mixto-completo");
  await toca("Agregar petaco mixto");
  await foto("anotar-con-paquetes");
  await p.locator(".pie-fijo .principal").click();
  await foto("detalle-despues");

  // Cobrar
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  await foto("cobrar");
  await p.getByRole("button", { name: "Exacto" }).click();
  await foto("cobrar-cambio");
  await p.locator(".pie-fijo .principal").click();
  await foto("inicio-tras-cobro");

  // Mesa pasada a comida
  await p.locator(".tarjeta", { hasText: "Mesa 4" }).click();
  await p.locator(".pie-fijo").getByRole("button", { name: "Cobrar", exact: true }).click();
  await foto("cobrar-mesa");
  await toca("Pasar a comida");
  await toca("Cerradas hoy (2)", { exact: false });
  await foto("inicio-cerradas");

  // Pestañas
  await p.locator(".pestanas button").nth(1).click();
  await foto("cocina");
  await p.locator(".pestanas button").nth(2).click();
  await foto("el-dia");
  await p.locator(".caja input").fill("50000");
  await foto("el-dia-cuadre");
  await p.locator(".pestanas button").nth(0).click();

  // Productos (administrador)
  await p.locator(".quien").click();
  await foto("menu-persona");
  await toca("Productos y precios");
  await foto("productos");
  await toca("Ordenar");
  await foto("productos-ordenar");
  await toca("Editar");
  await p.locator(".productos-admin .producto").first().click();
  await foto("editar-producto");
  await p.locator(".atras").click();
  await toca("＋ Nuevo producto");
  await foto("nuevo-producto");

  // Mostrar al cliente
  await p.goBack(); await p.goBack();
  await p.locator(".tarjeta", { hasText: "Cancha 1" }).click();
  await p.locator(".quien").click();
  await toca("Mostrar al cliente");
  await foto("cliente");

  await contexto.close();
}
await navegador.close();
console.log(`${total} capturas en ${salida}`);
