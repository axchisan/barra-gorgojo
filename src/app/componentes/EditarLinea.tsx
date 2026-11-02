import { useState } from "react";
import { producto as productoDe, type Cuenta, type Linea } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import { nombrePaquete } from "../paquetes";
import { sinc } from "../sincronizacion";
import { vibrar } from "../vibrar";

/** Cambiar la cantidad de un producto ya anotado, o anularlo. */
export function EditarLinea({ c, l, cerrar, soloEtiqueta }: { c: Cuenta; l: Linea; cerrar: () => void; soloEtiqueta?: boolean }) {
  const [n, setN] = useState(l.cantidad);
  return (
    <div className="editar-fila">
      <span className="titulo">{l.nombre}{l.paquete ? ` · ${nombrePaquete(l.paquete)}` : ""}</span>
      {l.editada && <span className="tenue">Antes eran {l.editada.antes} · cambió {l.editada.por}</span>}
      {productoDe(sinc.visible, l.producto)?.conNombre && (
        <div className="opciones">
          <button className={l.comida ? "chip" : "chip activo"} onClick={() => sinc.emitir({ t: "comida_linea", cuenta: c.id, linea: l.id, valor: false })}>🍺 Barra</button>
          <button className={l.comida ? "chip activo comida-chip" : "chip"} onClick={() => sinc.emitir({ t: "comida_linea", cuenta: c.id, linea: l.id, valor: true })}>🍽 Es comida</button>
        </div>
      )}
      {soloEtiqueta ? (
        <div className="fila-botones">
          <button className="secundario grande" onClick={cerrar}>Listo</button>
        </div>
      ) : (<>
      <div className="cantidad">
        <button aria-label="Uno menos" onClick={() => { vibrar(); setN((x) => Math.max(1, x - 1)); }}>−</button>
        <span>
          <b>{n}</b>
          <small>{pesos(n * l.precio)}</small>
        </span>
        <button aria-label="Uno más" onClick={() => { vibrar(); setN((x) => x + 1); }}>+</button>
      </div>
      <div className="fila-botones">
        <button className="secundario" onClick={cerrar}>Cancelar</button>
        <button className="peligro" onClick={() => { sinc.emitir({ t: "anular", cuenta: c.id, linea: l.id }); cerrar(); }}>Anular</button>
        <button className="principal grande" disabled={n === l.cantidad} onClick={() => {
          const antes = l.cantidad;
          sinc.emitir({ t: "cantidad", cuenta: c.id, linea: l.id, cantidad: n });
          cerrar();
          ponerAviso({
            texto: `${l.nombre}: ${antes} → ${n}`,
            deshacer: () => sinc.emitir({ t: "cantidad", cuenta: c.id, linea: l.id, cantidad: antes }),
          });
        }}>Guardar</button>
      </div>
      </>)}
    </div>
  );
}
