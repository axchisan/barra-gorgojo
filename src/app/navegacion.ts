// Navegación con el botón «atrás» del celular: cada pantalla es una entrada del historial.
import { useEffect, useState } from "react";

export type Vista =
  | { v: "inicio"; pestana: "cuentas" | "cocina" | "dia" }
  | { v: "anotar"; cuenta?: string; repetir?: boolean }
  | { v: "cuenta"; id: string }
  | { v: "cobrar"; id: string }
  | { v: "productos" }
  | { v: "producto"; id?: string };

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
