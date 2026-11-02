import type { Dispatch, SetStateAction } from "react";
import { TOPE_VALOR_LIBRE } from "../../dominio/catalogo";
import { pesos } from "../../dominio/formato";
import { vibrar } from "../vibrar";

export const VALORES_MECATO = [1000, 1500, 2000, 2500, 3000, 5000];

/** Un producto de valor libre ya escogido: el mecato (solo valor) u «Otro» (nombre y valor). */
export type Libre = { producto: string; nombre?: string; precio: number; comida?: boolean };

/** Escoger el valor del mecato, o el nombre y el valor de «Otro». */
export function HojaLibre(props: {
  hoja: "mecato" | "otro";
  setHoja: Dispatch<SetStateAction<"mecato" | "otro" | null>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  otroNombre: string;
  setOtroNombre: Dispatch<SetStateAction<string>>;
  otroValor: string;
  setOtroValor: Dispatch<SetStateAction<string>>;
  esComida: boolean;
  setEsComida: Dispatch<SetStateAction<boolean>>;
  libres: Libre[];
  setLibres: Dispatch<SetStateAction<Libre[]>>;
  palabra: string;
}) {
  const { hoja, setHoja, error, setError, otroNombre, setOtroNombre, otroValor, setOtroValor, esComida, setEsComida, libres, setLibres, palabra } = props;
  return (
    <div className="hoja" onClick={() => setHoja(null)}>
      <div className="hoja-cuerpo" onClick={(e) => e.stopPropagation()}>
        <h2>{hoja === "otro" ? "Otro producto" : "Mecato · escoja el valor"}</h2>
        {error && <p className="error">{error}</p>}
        {hoja === "otro" && (
          // Nombre y barra/comida en una fila: con el teclado abierto se siguen viendo (C7).
          <div className="fila-otro">
            <input
              placeholder="¿Qué es?"
              aria-label="Qué producto es"
              enterKeyHint="next"
              value={otroNombre}
              onChange={(e) => setOtroNombre(e.target.value)}
              autoFocus
            />
            <div className="segmentos" role="group" aria-label="Barra o comida">
              <button className={esComida ? "" : "activo"} aria-pressed={!esComida} onClick={() => setEsComida(false)}>🍺 Barra</button>
              <button className={esComida ? "activo comida-chip" : ""} aria-pressed={esComida} onClick={() => setEsComida(true)}>🍽 Comida</button>
            </div>
          </div>
        )}
        <div className="productos valores">
          {VALORES_MECATO.map((v) => (
            <button key={v} className="producto neutro" onClick={() => {
              if (hoja === "otro" && !otroNombre.trim()) return setError("Escriba qué producto es.");
              vibrar();
              setLibres((l) => [...l, { producto: hoja, nombre: hoja === "otro" ? otroNombre.trim() : undefined, precio: v, comida: hoja === "otro" && esComida }]);
              setHoja(null);
              setEsComida(false);
              setError("");
            }}>
              <span className="corto">{pesos(v)}</span>
            </button>
          ))}
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const v = Number(otroValor);
          if (hoja === "otro" && !otroNombre.trim()) return setError("Escriba qué producto es.");
          if (v > 0 && v <= TOPE_VALOR_LIBRE) {
            setLibres((l) => [...l, { producto: hoja, nombre: hoja === "otro" ? otroNombre.trim() : undefined, precio: v, comida: hoja === "otro" && esComida }]);
            setEsComida(false);
            setOtroValor("");
            setHoja(null);
            setError("");
          }
        }}>
          <input inputMode="numeric" enterKeyHint="done" placeholder="Otro valor" value={otroValor} onChange={(e) => setOtroValor(e.target.value.replace(/\D/g, ""))} />
          <button className="principal">Agregar</button>
        </form>
        {libres.length > 0 && (
          <p className="nota">En esta {palabra}: {libres.map((x) => `${x.comida ? "🍽 " : ""}${x.nombre ?? "Mecato"} ${pesos(x.precio)}`).join(" + ")}</p>
        )}
      </div>
    </div>
  );
}
