// «Mostrar al cliente» (RF-27): pantalla limpia con lo que se le cobra, para voltear el
// celular o la tablet hacia el cliente. Se abre desde el detalle (menú ⋮) y desde Cobrar.
import { abonos, saldo, total, totalComida, type Cuenta } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";
import { resumen } from "../cuentas";

export function VistaCliente({ c, recibido, cerrar }: { c: Cuenta; recibido?: number | null; cerrar: () => void }) {
  const valor = saldo(c);
  const cambio = recibido != null && recibido >= valor ? recibido - valor : null;
  return (
    <main className="cliente" onClick={cerrar}>
      <h1>{c.nombre}</h1>
      <div className="renglones">
        {resumen(c).map((r) => (
          <p key={`${r.producto}:${r.nombre}:${r.precio}`}><span>{r.cantidad} {r.nombre}</span><span>{pesos(r.valor)}</span></p>
        ))}
      </div>
      <div className="cierre">
        {totalComida(c) > 0 && (
          <>
            <p className="parte"><span>Barra</span><span>{pesos(total(c) - totalComida(c))}</span></p>
            <p className="parte"><span>🍽 Comida</span><span>{pesos(totalComida(c))}</span></p>
          </>
        )}
        {abonos(c).length > 0 && (
          <>
            <p className="parte"><span>Cuenta</span><span>{pesos(total(c))}</span></p>
            {abonos(c).map((p) => (
              <p key={p.id} className="parte"><span>Abonó{p.pagador ? ` ${p.pagador}` : ""}</span><span>− {pesos(p.monto)}</span></p>
            ))}
          </>
        )}
        <p className="total-cliente"><span>{abonos(c).length > 0 ? "Falta" : "Total"}</span><span>{pesos(valor)}</span></p>
        {cambio != null && recibido !== valor && (
          <>
            <p className="parte"><span>Paga con</span><span>{pesos(recibido!)}</span></p>
            <p className="cambio-cliente"><span>Cambio</span><span>{pesos(cambio)}</span></p>
          </>
        )}
        <small>Toque para volver</small>
      </div>
    </main>
  );
}
