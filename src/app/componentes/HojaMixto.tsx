import type { Dispatch, SetStateAction } from "react";
import { MEDIO_PETACO, PETACO, type Producto } from "../../dominio/catalogo";
import type { PaqueteEnArmado } from "../paquetes";
import { vibrar } from "../vibrar";

/** Armar un petaco o medio petaco con cervezas de varias marcas. */
export function HojaMixto({ mixto, setMixto, mezcla, setMezcla, cervezas, setPaquetes }: {
  mixto: 15 | 30;
  setMixto: Dispatch<SetStateAction<15 | 30 | null>>;
  mezcla: Record<string, number>;
  setMezcla: Dispatch<SetStateAction<Record<string, number>>>;
  cervezas: Producto[];
  setPaquetes: Dispatch<SetStateAction<PaqueteEnArmado[]>>;
}) {
  const enMezcla = Object.values(mezcla).reduce((a, b) => a + b, 0);
  return (
    <div className="hoja" onClick={() => setMixto(null)}>
      <div className="hoja-cuerpo" onClick={(e) => e.stopPropagation()}>
        <h2>Petaco mixto</h2>
        <div className="opciones">
          <button className={mixto === MEDIO_PETACO ? "chip activo" : "chip"} onClick={() => setMixto(MEDIO_PETACO)}>Medio · {MEDIO_PETACO}</button>
          <button className={mixto === PETACO ? "chip activo" : "chip"} onClick={() => setMixto(PETACO)}>Petaco · {PETACO}</button>
        </div>
        <p className={`estado-mezcla ${enMezcla === mixto ? "cambio" : enMezcla > mixto ? "cambio falta" : "nota centrada"}`}>
          {enMezcla === mixto ? `Completo: ${enMezcla} cervezas` : enMezcla > mixto ? `Sobran ${enMezcla - mixto}` : `Lleva ${enMezcla} · faltan ${mixto - enMezcla}`}
        </p>
        <div className="productos">
          {cervezas.map((p) => (
            <div key={p.id} className="producto-celda">
              <button className="producto" style={{ background: p.fondo, color: p.texto }} onClick={() => { vibrar(); setMezcla((m) => ({ ...m, [p.id]: (m[p.id] ?? 0) + 1 })); }}>
                <span className="corto">{p.corto}</span>
                <span className="precio">+1</span>
              </button>
              {(mezcla[p.id] ?? 0) > 0 && (
                <button className="contador" aria-label={`Quitar una ${p.nombre}`} onClick={() => setMezcla((m) => ({ ...m, [p.id]: Math.max(0, (m[p.id] ?? 0) - 1) }))}>
                  {mezcla[p.id]}<small>−</small>
                </button>
              )}
              <button className="mas-cinco" aria-label={`Cinco ${p.nombre} más`} onClick={() => { vibrar(); setMezcla((m) => ({ ...m, [p.id]: (m[p.id] ?? 0) + 5 })); }}>+5</button>
            </div>
          ))}
        </div>
        <div className="fila-botones">
          <button className="secundario" onClick={() => setMezcla({})}>Limpiar</button>
          <button className="principal grande" disabled={enMezcla !== mixto} onClick={() => {
            const items = Object.fromEntries(Object.entries(mezcla).filter(([, k]) => k > 0));
            setPaquetes((ps) => [...ps, { id: crypto.randomUUID(), tipo: mixto === PETACO ? "petaco" : "medio", mixto: true, items }]);
            setMixto(null);
            setMezcla({});
            vibrar();
          }}>Agregar petaco mixto</button>
        </div>
      </div>
    </div>
  );
}
