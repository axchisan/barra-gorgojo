// Atajos de teclado para usar la app en el portátil (docs/18 fase 2, docs/02 «Teclado
// físico»). No cambian nada en el celular: solo actúan con un teclado de verdad, y nunca
// mientras se escribe en un campo (salvo Esc y Ctrl/⌘ + Enter).
import { useEffect, useRef } from "react";

/** Si el foco está en algo donde se escribe. */
export const escribiendo = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** Nombre normalizado de una tecla: «a», «enter», «ctrl+enter», «/», «?», «1». */
export function nombreTecla(e: KeyboardEvent): string {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  return (e.ctrlKey || e.metaKey) ? `ctrl+${k}` : k;
}

/**
 * Registra atajos mientras la pantalla está montada. `mapa`: tecla → acción (devuelve
 * `false` si no la usó, para que siga su camino). Con un campo enfocado solo pasan las que
 * empiezan con «ctrl+».
 */
export function useAtajos(mapa: Record<string, (e: KeyboardEvent) => boolean | void>, activo = true) {
  const ref = useRef(mapa);
  ref.current = mapa;
  useEffect(() => {
    if (!activo) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.isComposing) return;
      const k = nombreTecla(e);
      if (escribiendo(e.target) && !k.startsWith("ctrl+")) return;
      const accion = ref.current[k];
      if (!accion) return;
      if (accion(e) === false) return;
      e.preventDefault();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [activo]);
}

/** Quita tildes y pasa a minúsculas, para buscar productos escribiendo. */
export const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
