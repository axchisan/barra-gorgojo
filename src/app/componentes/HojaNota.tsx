import { useState } from "react";
import type { Producto } from "../../dominio/catalogo";
import { TOPE_VALOR_LIBRE } from "../../dominio/catalogo";
import { pesos } from "../../dominio/formato";
import { useAtrasCierra } from "../navegacion";
import { cerrarConEnter } from "../teclado";
import { vibrar } from "../vibrar";

/** Largo máximo de una nota de plato (el dominio la recorta igual). */
const LARGO_NOTA = 60;

/**
 * Un plato con nota («solo carne», «más yuca»): toques en las notas rápidas del producto,
 * texto libre si hace falta, y se agrega uno con esa nota.
 */
export function HojaNota({ producto, cerrar, agregar }: { producto: Producto; cerrar: () => void; agregar: (nota: string) => void }) {
  useAtrasCierra(true, cerrar);
  const [escogidas, setEscogidas] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const nota = [...escogidas, texto.trim()].filter(Boolean).join(", ").slice(0, LARGO_NOTA);
  const listo = () => {
    if (!nota) return;
    vibrar();
    agregar(nota);
    cerrar();
  };
  return (
    <div className="hoja" onClick={cerrar}>
      <div className="hoja-cuerpo" onClick={(e) => e.stopPropagation()}>
        <header className="cabeza-hoja">
          <h2>{producto.nombre} · con nota</h2>
          <button className="cerrar-hoja" aria-label="Cerrar" onClick={cerrar}>✕</button>
        </header>
        {(producto.notas ?? []).length > 0 && (
          <div className="chips" role="group" aria-label="Notas rápidas">
            {producto.notas!.map((n) => {
              const activa = escogidas.includes(n);
              return (
                <button key={n} className={activa ? "chip activo" : "chip"} aria-pressed={activa}
                  onClick={() => setEscogidas((e) => (activa ? e.filter((x) => x !== n) : [...e, n]))}>{n}</button>
              );
            })}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); listo(); }}>
          <input placeholder="Otra nota (opcional)" aria-label="Nota" enterKeyHint="done" autoCapitalize="sentences" maxLength={LARGO_NOTA}
            value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button className="principal" disabled={!nota}>Agregar</button>
        </form>
        {nota && <p className="nota">1 {producto.nombre} · {nota}</p>}
      </div>
    </div>
  );
}

/** Un plato de otro valor: se escribe el valor y, si quieren, qué es. Va como comida. */
export function HojaPlato({ cerrar, agregar }: { cerrar: () => void; agregar: (nombre: string, precio: number) => void }) {
  useAtrasCierra(true, cerrar);
  const [valor, setValor] = useState("");
  const [nombre, setNombre] = useState("");
  const v = Number(valor);
  const valido = v > 0 && v <= TOPE_VALOR_LIBRE;
  const listo = () => {
    if (!valido) return;
    vibrar();
    agregar(nombre.trim() || "Plato", v);
    cerrar();
  };
  return (
    <div className="hoja" onClick={cerrar}>
      <div className="hoja-cuerpo" onClick={(e) => e.stopPropagation()}>
        <header className="cabeza-hoja">
          <h2>Plato de otro valor</h2>
          <button className="cerrar-hoja" aria-label="Cerrar" onClick={cerrar}>✕</button>
        </header>
        <form className="plato-valor" onSubmit={(e) => { e.preventDefault(); listo(); }}>
          <input className="numero" inputMode="numeric" enterKeyHint="done" placeholder="Valor" aria-label="Valor del plato" autoFocus
            value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))} />
          <button className="principal" disabled={!valido}>Agregar{valido ? ` ${pesos(v)}` : ""}</button>
        </form>
        <input placeholder="¿Qué es? (opcional): picada, solo carne…" aria-label="Qué plato es" enterKeyHint="done" autoCapitalize="sentences" maxLength={40}
          onKeyDown={cerrarConEnter} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
    </div>
  );
}
