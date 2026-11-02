// Comportamiento del teclado en pantalla.
import type { KeyboardEvent } from "react";

/** ✓ / Enter en un campo que no envía nada: baja el teclado. */
export function cerrarConEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.currentTarget.blur();
  }
}
