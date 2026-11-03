// Nombres de los botones de producto que no parten palabras (C2): si la palabra más larga
// de un nombre no cabe en su botón, ese nombre se achica lo justo, hasta un mínimo legible.
// Los demás botones quedan con su tamaño normal.

const MINIMO_PX = 9;
const lienzo = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;

function ajustar(e: HTMLElement) {
  if (!lienzo) return;
  e.style.fontSize = "";
  const estilo = getComputedStyle(e);
  const ancho = e.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
  if (!(ancho > 0)) return;
  lienzo.font = `${estilo.fontWeight} ${estilo.fontSize} ${estilo.fontFamily}`;
  const espaciado = parseFloat(estilo.letterSpacing) || 0;
  const largo = Math.max(...(e.textContent ?? "").split(/\s+/).map((p) => lienzo.measureText(p).width + espaciado * p.length));
  if (largo <= ancho) return;
  const tamano = parseFloat(estilo.fontSize);
  e.style.fontSize = `${Math.max(MINIMO_PX, Math.floor(tamano * (ancho / largo) * 0.97 * 10) / 10)}px`;
}

let pendiente = false;
function ajustarTodos() {
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(() => {
    pendiente = false;
    document.querySelectorAll<HTMLElement>(".producto .corto").forEach(ajustar);
  });
}

/** Ajusta al pintar productos nuevos y al cambiar el tamaño de la pantalla (girar). */
export function vigilarNombres() {
  ajustarTodos();
  addEventListener("resize", ajustarTodos);
  new MutationObserver((cambios) => {
    // Solo cuando aparecen o cambian botones; los cambios de estilo propios no cuentan.
    if (cambios.some((c) => c.type === "childList" || c.type === "characterData")) ajustarTodos();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  document.fonts?.ready.then(ajustarTodos).catch(() => {});
}
