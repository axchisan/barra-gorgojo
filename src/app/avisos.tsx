// Avisos (F4 de docs/12): arriba, sobre la barra superior, donde no tapan botones de
// venta. Se van solos (2,5 s; 6 s con «Deshacer»), se quitan tocándolos o deslizándolos,
// y uno nuevo reemplaza al anterior. Lo que el servidor no aceptó (regla 8) se queda
// hasta que se toque; si mientras tanto llega otro aviso, vuelve cuando ese se va.
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { sinc } from "./sincronizacion";

export type Aviso = { texto: string; deshacer?: () => void; id: number };
export let ponerAviso: (a: Omit<Aviso, "id">) => void = () => {};

export const DURACION = 2500;
export const DURACION_DESHACER = 6000;
/** Cuánto hay que deslizar (px) para quitar un aviso. */
const DESLIZAR = 50;

let ultimo = 0;
const nuevoId = () => ++ultimo;

export function Avisos() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [rechazos, setRechazos] = useState<Aviso[]>([]);
  const [corrido, setCorrido] = useState<{ x: number; y: number } | null>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    ponerAviso = (a) => setAviso({ ...a, id: nuevoId() });
    sinc.alRechazo = (motivo) =>
      setRechazos((r) => (r.some((x) => x.texto === `No se hizo: ${motivo}`) ? r : [...r, { texto: `No se hizo: ${motivo}`, id: nuevoId() }]));
    return () => { ponerAviso = () => {}; sinc.alRechazo = null; };
  }, []);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.deshacer ? DURACION_DESHACER : DURACION);
    return () => clearTimeout(t);
  }, [aviso]);

  const rechazo = !aviso && rechazos.length > 0;
  const actual = aviso ?? rechazos[0];
  if (!actual) return null;

  const quitar = () => {
    setCorrido(null);
    if (rechazo) setRechazos((r) => r.slice(1));
    else setAviso(null);
  };
  const alBajar = (e: PointerEvent) => { inicio.current = { x: e.clientX, y: e.clientY }; };
  const alMover = (e: PointerEvent) => {
    if (!inicio.current) return;
    setCorrido({ x: e.clientX - inicio.current.x, y: Math.min(0, e.clientY - inicio.current.y) });
  };
  const alSoltar = (e: PointerEvent) => {
    const i = inicio.current;
    inicio.current = null;
    if (!i) return;
    const dx = e.clientX - i.x, dy = e.clientY - i.y;
    // Un toque (o un deslizamiento hacia un lado o hacia arriba) lo quita.
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return quitar();
    if (Math.abs(dx) > DESLIZAR || dy < -DESLIZAR / 2) return quitar();
    setCorrido(null);
  };

  const mas = rechazo && rechazos.length > 1 ? ` (+${rechazos.length - 1})` : "";
  return (
    <div
      key={actual.id}
      className={rechazo ? "aviso rechazo" : "aviso"}
      role={rechazo ? "alert" : "status"}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={() => { inicio.current = null; setCorrido(null); }}
      style={corrido ? { transform: `translate(${corrido.x}px, ${corrido.y}px)`, opacity: Math.max(0.3, 1 - Math.abs(corrido.x) / 200), transition: "none" } : undefined}
    >
      <span>{actual.texto}{mas}</span>
      {!rechazo && aviso?.deshacer && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={() => { aviso.deshacer!(); setAviso(null); }}
        >Deshacer</button>
      )}
      {rechazo && <span className="cerrar-aviso" aria-hidden>✕</span>}
    </div>
  );
}
