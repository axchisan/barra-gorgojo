// Las opciones de un producto (sabores de la gaseosa, marcas de mecato), al mantenerlo
// presionado al anotar (docs/02 «Opciones de un producto»). Cada toque suma uno; el
// contador quita. Se cierra con «Listo», tocando afuera o con «atrás».
import { useRef } from "react";
import type { Producto } from "../../dominio/catalogo";
import { useAtrasCierra } from "../navegacion";

export function HojaOpciones({ padre, opciones, cantidad, tocar, quitar, precio, cerrar }: {
  padre: Producto;
  opciones: Producto[];
  cantidad: (p: Producto) => number;
  tocar: (p: Producto) => void;
  quitar: (p: Producto) => void;
  precio: (p: Producto) => string;
  cerrar: () => void;
}) {
  useAtrasCierra(true, cerrar);
  // Se abre al mantener presionado: el «clic» de soltar el dedo puede caer en el fondo de la
  // hoja recién abierta (si el producto quedó fuera del cuerpo de la hoja) y la cerraba al
  // instante. Solo cierra un toque en el fondo que empezó con la hoja ya abierta.
  const tocoFondo = useRef(false);
  const total = opciones.reduce((t, p) => t + cantidad(p), 0);
  return (
    <div className="hoja" onPointerDown={() => { tocoFondo.current = true; }} onClick={() => { if (tocoFondo.current) cerrar(); }}>
      <div className="hoja-cuerpo hoja-opciones" role="dialog" aria-label={`Opciones de ${padre.nombre}`} onClick={(e) => e.stopPropagation()}>
        <header className="cabeza-hoja">
          <h2>{padre.nombre} · ¿cuál?</h2>
          <button className="cerrar-hoja" aria-label="Cerrar" onClick={cerrar}>✕</button>
        </header>
        <div className="productos">
          {opciones.map((p) => {
            const k = cantidad(p);
            return (
              <div key={p.id} className="producto-celda">
                <button className="producto" style={{ background: p.fondo, color: p.texto }} onClick={() => tocar(p)}>
                  <span className="corto">{p.corto}</span>
                  <span className="precio">{precio(p)}</span>
                </button>
                {k > 0 && (
                  <button className="contador" aria-label={`Quitar una ${p.nombre}`} onClick={() => quitar(p)}>
                    {k}<small>−</small>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button className="principal grande listo-opciones" onClick={cerrar}>{total > 0 ? `Listo · ${total}` : "Listo"}</button>
      </div>
    </div>
  );
}
