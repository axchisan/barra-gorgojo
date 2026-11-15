import { useState } from "react";
import { modoPrecio, producto as productoDe, type Cuenta, type Linea } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import { useAtrasCierra } from "../navegacion";
import { nombrePaquete } from "../paquetes";
import { sinc } from "../sincronizacion";
import { vibrar } from "../vibrar";
import { ElegirProductos } from "./ElegirProductos";

/**
 * Cambiar la cantidad de un producto ya anotado, o anularlo. Es una hoja, como «Otro»:
 * siempre a la vista, aunque la pedida esté al final de una lista larga (C2).
 */
export function EditarLinea({ c, l, cerrar, soloEtiqueta }: { c: Cuenta; l: Linea; cerrar: () => void; soloEtiqueta?: boolean }) {
  const [n, setN] = useState(l.cantidad);
  const [cambiar, setCambiar] = useState(false);
  useAtrasCierra(true, cerrar);
  // Barra, comida o cambio de plata (2026-11-15): el cliente pagó por Nequi y se le dio efectivo.
  const marcar = (a: "barra" | "comida" | "cambio") => {
    if (a === "cambio") {
      if (l.cambio) return;
      sinc.emitir({ t: "cambio_linea", cuenta: c.id, linea: l.id, valor: true, caja: sinc.panel });
      ponerAviso({ texto: `${l.nombre}: cambio de plata, no cuenta como venta` });
      return;
    }
    if (l.cambio) sinc.emitir({ t: "cambio_linea", cuenta: c.id, linea: l.id, valor: false });
    if (!!l.comida !== (a === "comida") || l.cambio) sinc.emitir({ t: "comida_linea", cuenta: c.id, linea: l.id, valor: a === "comida" });
  };
  return (
    <div className="hoja" onClick={cerrar}>
    <div className="hoja-cuerpo editar-fila" onClick={(e) => e.stopPropagation()}>
      <header className="cabeza-hoja">
        <span className="titulo">{l.nombre}{l.paquete ? ` · ${nombrePaquete(l.paquete)}` : ""}</span>
        <button className="cerrar-hoja" aria-label="Cerrar" onClick={cerrar}>✕</button>
      </header>
      {l.editada && <span className="tenue">Antes eran {l.editada.antes} · cambió {l.editada.por}</span>}
      {productoDe(sinc.visible, l.producto)?.conNombre && (
        <div className="opciones">
          <button className={!l.comida && !l.cambio ? "chip activo" : "chip"} onClick={() => marcar("barra")}>🍺 Barra</button>
          <button className={l.comida && !l.cambio ? "chip activo comida-chip" : "chip"} onClick={() => marcar("comida")}>🍽 Es comida</button>
          <button className={l.cambio ? "chip activo cambio-chip" : "chip"} aria-pressed={!!l.cambio} onClick={() => marcar("cambio")}>💱 Cambio de plata</button>
        </div>
      )}
      {l.cambio && (
        <p className="tenue nota-cambio">No es venta: se cobra en la cuenta, y en «El día» el efectivo de la {l.cambio.caja === "comida" ? "cocina" : "barra"} baja {pesos(l.precio * l.cantidad)} (se le dio al cliente).</p>
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
      {/* Edición de la pedida: cambiar este producto por otro, con la misma cantidad. */}
      {!productoDe(sinc.visible, l.producto)?.libre && (
        <button className="secundario cambiar-producto" onClick={() => setCambiar(true)}>⇄ Cambiar por otro producto</button>
      )}
      {cambiar && (
        <ElegirProductos titulo={`Cambiar ${l.cantidad} ${l.nombre} por…`} varios={false} tipo={c.tipo} modo={modoPrecio(c, c.rondas.find((r) => r.id === l.ronda))} sinProducto={l.producto}
          cerrar={() => setCambiar(false)}
          listo={([e]) => {
            const nombre = productoDe(sinc.visible, e.producto)?.nombre ?? "otro";
            sinc.emitir({ t: "cambiar_producto", cuenta: c.id, linea: l.id, nueva: { id: crypto.randomUUID(), producto: e.producto, cantidad: l.cantidad } });
            ponerAviso({ texto: `Cambiado: ${l.cantidad} ${l.nombre} → ${nombre}` });
            cerrar();
          }} />
      )}
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
    </div>
  );
}
