// Lo que hace un celular nuevo, como en la vida real: vincularse con un código de 6 dígitos
// y entrar con el nombre y el PIN (fase D). El servidor e2e usa «prueba» como llave de
// instalación (scripts/servidor-e2e.mjs).

import { expect, type APIRequestContext, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";

export const LLAVE = "prueba";
export const PIN = "1234";

/** Un código de vinculación, sacado con la llave de instalación. */
export async function codigo(request: APIRequestContext): Promise<string> {
  const r = await request.post("/api/instalacion/codigo", { headers: { "x-llave": LLAVE } });
  expect(r.ok(), "código de vinculación").toBe(true);
  return ((await r.json()) as { codigo: string }).codigo;
}

/** Escribe el PIN en el teclado de la app (crea el PIN si la persona no tiene). */
export async function teclearPin(p: Page) {
  const titulo = p.locator(".teclado-pin h2");
  await expect(titulo).toBeVisible();
  const crear = /cree su PIN/.test(await titulo.innerText());
  const escribir = async () => { for (const d of PIN) await p.locator(".teclas .tecla", { hasText: new RegExp(`^${d}$`) }).click(); };
  await escribir();
  if (crear) {
    await expect(titulo).toHaveText("Repita el PIN");
    await escribir();
  }
}

/** Vincula el celular por la pantalla y entra como `persona`. */
export async function vincularYEntrar(p: Page, persona = "Administrador") {
  await p.goto("/");
  await expect(p.getByText("pídale al administrador un código")).toBeVisible();
  await p.getByLabel("Código de 6 números").fill(await codigo(p.context().request));
  await p.getByRole("button", { name: "Vincular celular" }).click();
  await entrarComo(p, persona);
}

/** En un celular ya vinculado: escoge la persona y escribe su PIN. */
export async function entrarComo(p: Page, persona: string) {
  await expect(p.getByText("¿Quién va a anotar?")).toBeVisible();
  if (persona === "Administrador") await p.getByRole("button", { name: "Soy el administrador" }).click();
  await p.getByRole("button", { name: persona, exact: true }).click();
  await teclearPin(p);
  await expect(p.locator(".conexion")).toHaveText(/Todo al día/);
}

/** Un celular nuevo, vinculado y con la persona adentro. */
export async function celular(browser: Browser, persona = "Administrador", opciones: BrowserContextOptions = {}): Promise<Page> {
  const contexto = await browser.newContext(opciones);
  const p = await contexto.newPage();
  await vincularYEntrar(p, persona);
  return p;
}

/**
 * Para sembrar datos por la API: vincula `request` (guarda la cookie) y entra con el PIN.
 * Devuelve la sesión y la base.
 */
export async function sesionApi(request: APIRequestContext, persona = "administrador"): Promise<{ token: string; base: string }> {
  const v = await request.post("/api/vincular", { data: { codigo: await codigo(request), nombre: "Pruebas" } });
  expect(v.ok(), "vincular por la API").toBe(true);
  let r = await request.post("/api/entrar", { data: { persona, pin: PIN } });
  if (r.status() === 409) r = await request.post("/api/entrar", { data: { persona, pin: "", pinNuevo: PIN } });
  expect(r.ok(), "entrar por la API").toBe(true);
  return (await r.json()) as { token: string; base: string };
}
