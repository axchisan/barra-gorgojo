// «⏰ Apartados» (2026-11-15, pedido de comida): lo que alguien pidió que le apartaran para
// más tarde («una picada para las 2»), por hora, hasta que se entregue. Los atrasados, en
// rojo. Arriba de las cuentas, en la barra y en comida.
import { apartadosPendientes, type Cuenta } from "../../dominio/estado";
import { haceCuanto, horaDe } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";

export function ListaApartados({ nav, cuentas }: { nav: Nav; cuentas: Cuenta[] }) {
  const pendientes = apartadosPendientes(cuentas);
  if (!pendientes.length) return null;
  const ahora = Date.now();
  return (
    <section className="apartados-comida" aria-label="Apartados">
      <h2 className="seccion">⏰ Apartados ({pendientes.length})</h2>
      {pendientes.map(({ cuenta: c, ronda: r, lineas }) => {
        const para = r.apartado!.para;
        const atrasado = !!para && para < ahora;
        return (
          <article key={`${c.id}-${r.id}`} className={`apartado${atrasado ? " atrasado" : ""}`}>
            <button className="cuerpo" onClick={() => nav.ir({ v: "cuenta", id: c.id })}>
              <strong className="hora">{para ? horaDe(para) : "Sin hora"}{atrasado ? ` · ⚠️ hace ${haceCuanto(para).replace(/^hace /, "")}` : ""}</strong>
              <span className="quien">{c.tipo === "domicilio" ? "🛵 " : ""}{c.nombre}{c.direccion ? ` · ${c.direccion}` : ""}</span>
              <span className="que">{lineas.map((l) => `${l.cantidad} ${l.nombre}${l.nota ? ` (${l.nota})` : ""}`).join(", ")}</span>
            </button>
            <button className="principal entregar" onClick={() => {
              sinc.emitir({ t: "apartado_entregado", cuenta: c.id, ronda: r.id, valor: true });
              ponerAviso({ texto: `${c.nombre}: apartado entregado`, deshacer: () => sinc.emitir({ t: "apartado_entregado", cuenta: c.id, ronda: r.id, valor: false }) });
            }}>Entregado</button>
          </article>
        );
      })}
    </section>
  );
}
