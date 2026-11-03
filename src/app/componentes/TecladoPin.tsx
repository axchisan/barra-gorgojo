import { useState } from "react";
import { vibrar } from "../vibrar";

/**
 * Teclado de PIN grande, de una mano: 4 puntos y los números. Al cuarto dígito avisa;
 * no usa el teclado del celular (no tapa nada y siempre es numérico).
 */
export function TecladoPin({ titulo, detalle, error, ocupado, alCompletar, alCancelar }: {
  titulo: string;
  detalle?: string;
  error?: string;
  ocupado?: boolean;
  alCompletar: (pin: string) => void;
  alCancelar?: () => void;
}) {
  const [pin, setPin] = useState("");
  const tocar = (d: string) => {
    if (ocupado || pin.length >= 4) return;
    vibrar();
    const nuevo = pin + d;
    setPin(nuevo);
    if (nuevo.length === 4) setTimeout(() => { alCompletar(nuevo); setPin(""); }, 120);
  };
  return (
    <section className="teclado-pin" aria-label={titulo}>
      <h2>{titulo}</h2>
      {detalle && <p className="nota">{detalle}</p>}
      <div className="puntos" aria-live="polite" aria-label={`${pin.length} de 4 números`}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? "punto lleno" : "punto"} />)}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="teclas">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} className="tecla" onClick={() => tocar(d)} disabled={ocupado}>{d}</button>
        ))}
        <button className="tecla suave" onClick={alCancelar} disabled={!alCancelar}>{alCancelar ? "Volver" : ""}</button>
        <button className="tecla" onClick={() => tocar("0")} disabled={ocupado}>0</button>
        <button className="tecla suave" aria-label="Borrar" onClick={() => setPin((p) => p.slice(0, -1))} disabled={ocupado || !pin}>⌫</button>
      </div>
    </section>
  );
}
