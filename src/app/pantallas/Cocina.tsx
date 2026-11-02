import { total, type Cuenta } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import { resumen } from "../cuentas";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";

export function Cocina({ nav, cuentas }: { nav: Nav; cuentas: Cuenta[] }) {
  return (
    <section className="cocina">
      <p className="nota">Bebidas de mesas que se pasaron a la cuenta de comida y todavía no se han cobrado allá.</p>
      {cuentas.length === 0 && <p className="vacio">Nada pendiente en comida.</p>}
      {cuentas.sort((a, b) => (a.mesa ?? 0) - (b.mesa ?? 0)).map((c) => (
        <article key={c.id} className="caja">
          <header onClick={() => nav.ir({ v: "cuenta", id: c.id })}>
            <strong>{c.nombre}</strong>
            <strong>{pesos(total(c))}</strong>
          </header>
          <p className="tenue">{resumen(c).map((r) => `${r.cantidad} ${r.nombre}`).join(", ")}</p>
          <button className="principal" onClick={() => {
            sinc.emitir({ t: "comida_cobrada", cuenta: c.id, valor: true });
            ponerAviso({ texto: `${c.nombre}: cobrada en comida`, deshacer: () => sinc.emitir({ t: "comida_cobrada", cuenta: c.id, valor: false }) });
          }}>Ya se cobró en comida</button>
        </article>
      ))}
    </section>
  );
}
