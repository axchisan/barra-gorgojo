// Avisos con la app cerrada (docs/18 fase 4, docs/02 «Avisos con la app cerrada»): el
// aparato se suscribe a Web Push con un toque (nunca se pide el permiso al abrir) y el
// Service Worker muestra el aviso. Este archivo solo habla con el navegador y la API.

import { sinc } from "./sincronizacion";

export type EstadoPush =
  | "no-soportado" // navegador sin push (o iPhone sin la app instalada)
  | "apagado" // el servidor no tiene llave: push no está encendido en esta barra
  | "bloqueado" // la persona negó el permiso: se cambia en los ajustes del navegador
  | "inactivo" // se puede activar
  | "activo";

const soporta = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** iPhone o iPad sin la app instalada: Safari solo da push a la app en la pantalla de inicio. */
export const esIosSinInstalar = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone);

async function api<T>(metodo: "GET" | "POST", cuerpo?: unknown): Promise<T & { error?: string }> {
  const token = sinc.sesion?.token;
  if (!token) return { error: "No hay sesión." } as T & { error?: string };
  const r = await fetch("/api/push", {
    method: metodo,
    credentials: "same-origin",
    headers: { authorization: `Bearer ${token}`, ...(cuerpo ? { "content-type": "application/json" } : {}) },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  return (await r.json().catch(() => ({ error: "Respuesta inválida." }))) as T & { error?: string };
}

const deB64url = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

/** El Service Worker de la app (en localhost no se registra: ahí no hay avisos). */
async function registro(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error("sin service worker");
  return reg;
}

/** Cómo está este aparato. Sin señal, lo que diga el navegador. */
export async function estadoPush(): Promise<EstadoPush> {
  if (!soporta() || !(await navigator.serviceWorker.getRegistration().catch(() => undefined))) return "no-soportado";
  if (Notification.permission === "denied") return "bloqueado";
  try {
    const { llave, suscrito } = await api<{ llave: string | null; suscrito: boolean }>("GET");
    if (!llave) return "apagado";
    const sub = await (await registro()).pushManager.getSubscription();
    return sub && suscrito && Notification.permission === "granted" ? "activo" : "inactivo";
  } catch {
    const sub = await (await registro()).pushManager.getSubscription().catch(() => null);
    return sub ? "activo" : "inactivo";
  }
}

/** Pide el permiso (debe ser con un toque) y suscribe este aparato. Devuelve un error o null. */
export async function activarPush(): Promise<string | null> {
  if (!soporta()) return esIosSinInstalar() ? "En iPhone primero instale la app: Compartir → «Agregar a inicio»." : "Este navegador no recibe avisos.";
  try {
    const { llave, error } = await api<{ llave: string | null }>("GET");
    if (error) return error;
    if (!llave) return "Los avisos no están encendidos en esta barra.";
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") return "Sin permiso no llegan los avisos. Se puede dar en los ajustes del navegador.";
    const reg = await registro();
    let sub = await reg.pushManager.getSubscription();
    // Una suscripción hecha con otra llave (otro entorno o llave nueva) no sirve.
    const actual = sub?.options.applicationServerKey;
    if (sub && actual && btoa(String.fromCharCode(...new Uint8Array(actual))) !== btoa(String.fromCharCode(...deB64url(llave)))) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64url(llave) });
    return await guardar(sub);
  } catch {
    return "No se pudo activar. Revise la señal e intente otra vez.";
  }
}

async function guardar(sub: PushSubscription): Promise<string | null> {
  const j = sub.toJSON();
  const r = await api<{ ok?: boolean }>("POST", { accion: "suscribir", endpoint: j.endpoint, keys: j.keys });
  return r.error ?? null;
}

export async function desactivarPush(): Promise<string | null> {
  try {
    const sub = soporta() ? await (await registro()).pushManager.getSubscription() : null;
    await sub?.unsubscribe();
    const r = await api<{ ok?: boolean }>("POST", { accion: "quitar" });
    return r.error ?? null;
  } catch {
    return "Sin señal. Intente otra vez.";
  }
}

export async function probarPush(): Promise<string | null> {
  try {
    const r = await api<{ ok?: boolean }>("POST", { accion: "probar" });
    return r.error ?? null;
  } catch {
    return "Sin señal. Intente otra vez.";
  }
}

/**
 * Al entrar: si este aparato ya recibe avisos, le dice al servidor quién está ahora en él
 * (los avisos son por persona y área). No pide permiso ni suscribe a nadie.
 */
export async function ponerAlDiaPush() {
  if (!soporta() || Notification.permission !== "granted") return;
  try {
    const sub = await (await registro()).pushManager.getSubscription();
    if (sub) await guardar(sub);
  } catch { /* sin señal: la próxima vez */ }
}
