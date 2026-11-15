// Versión nueva de la app (docs/18 fase 3): el Service Worker nuevo se activa solo, pero la
// pestaña abierta sigue con el código viejo hasta recargar. La app revisa cada 30 minutos y
// al volver a ella; si hay versión nueva, lo avisa y se actualiza con un toque (nunca a la
// fuerza: podría estar anotando). Lo anotado no se pierde al recargar (respaldo síncrono).

let nueva = false;
const oyentes = new Set<() => void>();

export const versionNueva = {
  hay: () => nueva,
  suscribir: (fn: () => void) => { oyentes.add(fn); return () => { oyentes.delete(fn); }; },
};

function avisar() {
  nueva = true;
  for (const fn of oyentes) fn();
}

/** Registra el Service Worker, revisa si hay versión nueva y avisa cuando la hay. */
export function vigilarVersion() {
  if (!("serviceWorker" in navigator) || location.hostname === "localhost") return;
  // La primera vez no había quien controlara la página: ese cambio no es una versión nueva.
  let habia = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (habia) avisar();
    habia = true;
  });
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    const revisar = () => { reg.update().catch(() => {}); };
    setInterval(revisar, 30 * 60_000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") revisar(); });
  }).catch(() => {});
}
