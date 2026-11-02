// Comportamiento del teclado en pantalla.
import type { KeyboardEvent } from "react";

const conTeclado = (e: EventTarget | null) =>
  e instanceof HTMLInputElement && !["checkbox", "color", "radio", "range"].includes(e.type);

/**
 * Marca `body.escribiendo` mientras hay un campo de texto con el foco: los estilos
 * esconden las barras fijas para que no se monten sobre el teclado. Con eventos de foco
 * (y no con `:has(:focus)`), porque en la tablet el teclado le quita el foco a la ventana
 * y `:focus` deja de cumplirse aunque se siga escribiendo.
 */
export function vigilarTeclado() {
  document.addEventListener("focusin", (e) => { if (conTeclado(e.target)) document.body.classList.add("escribiendo"); });
  const revisar = () => {
    if (conTeclado(document.activeElement) || !document.body.classList.contains("escribiendo")) return;
    document.body.classList.remove("escribiendo");
    // Si se giró el aparato mientras se escribía, la forma se pone al día.
    setTimeout(() => dispatchEvent(new Event("resize")), 400);
  };
  // Al pasar de un campo a otro llega focusout y enseguida focusin: se mira después.
  document.addEventListener("focusout", () => setTimeout(revisar, 0));
  // Si el campo con el foco desaparece (se cierra la hoja de «Otro», se entra), el
  // navegador no avisa con focusout: sin esto, las barras quedarían escondidas.
  new MutationObserver(() => { if (document.body.classList.contains("escribiendo")) revisar(); })
    .observe(document.body, { childList: true, subtree: true });
}

/**
 * Forma de la pantalla como clases en <html>: `apaisada` (horizontal, alto ≤ 820),
 * `apaisada-baja` (horizontal, alto ≤ 500), `baja` (≥ 700 de ancho y alto ≤ 820) y
 * `muy-baja` (≥ 640 de ancho y alto ≤ 500). Se calcula sin teclado y **no cambia mientras
 * se escribe**: en la tablet vertical el teclado deja el área en 686 × 681 y, con
 * `@media (orientation: landscape)`, el diseño saltaba al de horizontal en pleno uso.
 */
export function vigilarForma() {
  const aplicar = () => {
    if (document.body?.classList.contains("escribiendo")) return;
    const w = innerWidth, h = innerHeight, c = document.documentElement.classList;
    c.toggle("apaisada", w > h && w >= 640 && h <= 820);
    c.toggle("apaisada-baja", w > h && h <= 500);
    c.toggle("baja", w >= 700 && h <= 820);
    c.toggle("muy-baja", w >= 640 && h <= 500);
  };
  aplicar();
  addEventListener("resize", aplicar);
  // Al terminar de escribir, el teclado se cierra y llega un resize: ahí se recalcula.
  return aplicar;
}

/** ✓ / Enter en un campo que no envía nada: baja el teclado. */
export function cerrarConEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.currentTarget.blur();
  }
}
