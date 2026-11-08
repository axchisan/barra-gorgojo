// Navegación con el botón «atrás» del celular: cada pantalla es una entrada del historial.
import { useEffect, useRef, useState } from "react";

export type Vista =
  | { v: "inicio"; pestana: "cuentas" | "cocina" | "despacho" | "dia" }
  | { v: "anotar"; cuenta?: string; repetir?: boolean }
  | { v: "cuenta"; id: string }
  | { v: "cobrar"; id: string }
  | { v: "productos" }
  | { v: "producto"; id?: string }
  | { v: "personas" }
  | { v: "mipin" }
  | { v: "dias" }
  | { v: "auditoria" };

export const INICIO: Vista = { v: "inicio", pestana: "cuentas" };

export function useNavegacion() {
  const [vista, setVista] = useState<Vista>(() => (history.state?.vista as Vista) ?? INICIO);
  useEffect(() => {
    if (!history.state?.vista) history.replaceState({ vista: INICIO, d: 0 }, "");
    const alVolver = (e: PopStateEvent) => setVista((e.state?.vista as Vista) ?? INICIO);
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, []);
  const profundidad = (): number => history.state?.d ?? 0;
  const ir = (v: Vista, reemplazar = false) => {
    if (reemplazar) history.replaceState({ vista: v, d: profundidad() }, "");
    // Desde una hoja o un menú abierto (ver useAtrasCierra), la pantalla nueva ocupa su lugar.
    else if (history.state?.capa) history.replaceState({ vista: v, d: profundidad() + 1 }, "");
    else history.pushState({ vista: v, d: profundidad() + 1 }, "");
    setVista(v);
    window.scrollTo(0, 0);
  };
  const volver = () => history.back();
  /** Vuelve a la raíz del historial, para que «atrás» no muestre pantallas viejas. */
  const aInicio = () => {
    const d = profundidad();
    if (d > 0) history.go(-d);
    else ir(INICIO, true);
  };
  return { vista, ir, volver, aInicio };
}
export type Nav = ReturnType<typeof useNavegacion>;

// ── Hojas y menús: el gesto «atrás» los cierra ──────────────────────────
// En Android, «atrás» primero baja el teclado (lo hace el sistema); el siguiente «atrás»
// debe cerrar la hoja o el menú abierto, no sacar a la persona de la pantalla.

let ignorarAtras = 0;
let ultimaCapa = 0;
// El «atrás» que hace una capa al cerrarse desde la pantalla no debe cerrar otra. Un solo
// escuchador, registrado antes que los de las capas, decide para cada evento si se ignora
// y gasta el contador aunque no haya otra capa abierta (si no, el siguiente «atrás» real
// se perdía y la capa quedaba abierta).
let ignorandoAhora = false;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    ignorandoAhora = ignorarAtras > 0;
    if (ignorandoAhora) ignorarAtras--;
  });
}

export function useAtrasCierra(abierta: boolean, cerrar: () => void) {
  const cerrarRef = useRef(cerrar);
  cerrarRef.current = cerrar;
  useEffect(() => {
    if (!abierta) return;
    const capa = ++ultimaCapa;
    history.pushState({ ...history.state, capa }, "");
    const alVolver = () => {
      if (ignorandoAhora) return;
      if (history.state?.capa !== capa) cerrarRef.current();
    };
    window.addEventListener("popstate", alVolver);
    return () => {
      window.removeEventListener("popstate", alVolver);
      // Cerrada desde la pantalla: se quita su entrada del historial, si sigue arriba.
      if (history.state?.capa === capa) { ignorarAtras++; history.back(); }
    };
  }, [abierta]);
}
