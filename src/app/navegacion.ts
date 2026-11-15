// Navegación con el botón «atrás» del celular: cada pantalla es una entrada del historial.
import { useEffect, useRef, useState } from "react";

export type Vista =
  | { v: "inicio"; pestana: "cuentas" | "cocina" | "despacho" | "dia" }
  | { v: "anotar"; cuenta?: string; repetir?: boolean; despacho?: boolean }
  | { v: "cuenta"; id: string }
  | { v: "cobrar"; id: string }
  | { v: "productos" }
  | { v: "producto"; id?: string }
  | { v: "platos" }
  | { v: "deudas" }
  | { v: "deudor"; id: string }
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
    if (reemplazar && history.state?.capa && abiertas.length) {
      // Reemplazar la pantalla desde una hoja abierta: primero se quitan las entradas de las
      // hojas (si no, «atrás» volvería a la pantalla que se quiso reemplazar).
      const k = abiertas.length;
      abiertas.length = 0;
      porQuitar.clear();
      ignorarAtras++;
      const alLlegar = () => {
        window.removeEventListener("popstate", alLlegar);
        history.replaceState({ vista: v, d: profundidad() }, "");
        setVista(v);
      };
      window.addEventListener("popstate", alLlegar);
      history.go(-k);
      setVista(v);
      window.scrollTo(0, 0);
      return;
    }
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

// Capas abiertas, en el orden de sus entradas del historial. Si varias se cierran a la vez
// desde la pantalla (una hoja dentro de otra), sus entradas se quitan juntas, con un solo
// «atrás»: antes quedaba una de sobra y el siguiente «←» no salía de la pantalla.
const abiertas: number[] = [];
const porQuitar = new Set<number>();
let quitandoProgramado = false;
function quitarCerradas() {
  quitandoProgramado = false;
  let k = 0;
  while (abiertas.length && porQuitar.has(abiertas[abiertas.length - 1])) {
    porQuitar.delete(abiertas.pop()!);
    k++;
  }
  if (k) { ignorarAtras++; history.go(-k); }
}

export function useAtrasCierra(abierta: boolean, cerrar: () => void) {
  const cerrarRef = useRef(cerrar);
  cerrarRef.current = cerrar;
  useEffect(() => {
    if (!abierta) return;
    const capa = ++ultimaCapa;
    const arriba = abiertas[abiertas.length - 1];
    if (arriba !== undefined && porQuitar.has(arriba) && history.state?.capa === arriba) {
      // Se abre justo cuando otra se cierra (el menú da paso a una hoja): usa su entrada.
      porQuitar.delete(arriba);
      abiertas[abiertas.length - 1] = capa;
      history.replaceState({ ...history.state, capa }, "");
    } else {
      history.pushState({ ...history.state, capa }, "");
      abiertas.push(capa);
    }
    const alVolver = () => {
      if (ignorandoAhora) return;
      if ((history.state?.capa ?? 0) < capa) cerrarRef.current();
    };
    window.addEventListener("popstate", alVolver);
    return () => {
      window.removeEventListener("popstate", alVolver);
      if ((history.state?.capa ?? 0) >= capa) {
        // Cerrada desde la pantalla: su entrada sigue en el historial y se quita (junto con
        // las que se cierren en el mismo momento).
        porQuitar.add(capa);
        if (!quitandoProgramado) { quitandoProgramado = true; queueMicrotask(quitarCerradas); }
      } else {
        // Cerrada con «atrás»: su entrada ya no está.
        const i = abiertas.indexOf(capa);
        if (i >= 0) abiertas.splice(i, 1);
      }
    };
  }, [abierta]);
}
