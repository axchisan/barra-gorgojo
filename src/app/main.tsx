import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./estilos.css";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && location.hostname !== "localhost") {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
// Pide al navegador que no borre los datos del celular por falta de espacio.
navigator.storage?.persist?.().catch(() => {});

// En la tablet de la barra la pantalla no se apaga mientras la app está abierta.
type Bloqueo = { release: () => Promise<void> };
let bloqueo: Bloqueo | null = null;
async function mantenerEncendida() {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Bloqueo> } }).wakeLock;
    if (wl && document.visibilityState === "visible" && !bloqueo) {
      bloqueo = await wl.request("screen");
      (bloqueo as unknown as EventTarget).addEventListener?.("release", () => { bloqueo = null; });
    }
  } catch { /* sin permiso o sin soporte: no pasa nada */ }
}
document.addEventListener("visibilitychange", mantenerEncendida);
document.addEventListener("pointerdown", mantenerEncendida, { once: true });
mantenerEncendida();
