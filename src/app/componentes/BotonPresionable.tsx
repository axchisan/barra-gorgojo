// Un botón que distingue un toque de mantenerlo presionado (opciones de un producto,
// docs/02). Mantener: 450 ms sin moverse (si el dedo se mueve, es que está desplazando la
// pantalla). En el computador, el clic derecho hace lo mismo; con el teclado, la tecla de
// menú contextual. Sin `alMantener`, es un botón normal.
import { useRef, type ButtonHTMLAttributes } from "react";
import { vibrar } from "../vibrar";

const ESPERA = 450;
const TOLERANCIA = 10;

export function BotonPresionable({ alTocar, alMantener, ...resto }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  alTocar: () => void;
  alMantener?: () => void;
}) {
  const temporizador = useRef<number | undefined>(undefined);
  const fueLargo = useRef(false);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const cancelar = () => { window.clearTimeout(temporizador.current); temporizador.current = undefined; };
  const mantener = () => {
    fueLargo.current = true;
    // Si el sistema alcanzó a seleccionar algo, se quita: no debe salir el menú de copiar.
    try { window.getSelection()?.removeAllRanges(); } catch { /* sin selección */ }
    vibrar();
    alMantener?.();
  };
  return (
    <button
      {...resto}
      onPointerDown={(e) => {
        fueLargo.current = false;
        if (!alMantener || e.button !== 0) return;
        inicio.current = { x: e.clientX, y: e.clientY };
        cancelar();
        temporizador.current = window.setTimeout(() => { temporizador.current = undefined; mantener(); }, ESPERA);
      }}
      onPointerMove={(e) => {
        const i = inicio.current;
        if (temporizador.current !== undefined && i && Math.hypot(e.clientX - i.x, e.clientY - i.y) > TOLERANCIA) cancelar();
      }}
      onPointerUp={cancelar}
      onPointerLeave={cancelar}
      onPointerCancel={cancelar}
      onContextMenu={(e) => {
        if (!alMantener) return;
        e.preventDefault();
        // En Android el menú contextual llega después de mantener: ya se abrió.
        if (fueLargo.current) return;
        cancelar();
        mantener();
      }}
      onClick={(e) => {
        if (fueLargo.current) { fueLargo.current = false; e.preventDefault(); return; }
        alTocar();
      }}
    />
  );
}
