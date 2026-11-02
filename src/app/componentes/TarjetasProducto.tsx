import { pesos } from "../../dominio/formato";
import { colorDe, type Renglon } from "../cuentas";

export function TarjetasProducto({ items }: { items: Renglon[] }) {
  if (!items.length) return <p className="vacio">Todavía no hay nada anotado.</p>;
  return (
    <div className="prod-tarjetas">
      {items.map((r) => (
        <div key={`${r.producto}:${r.nombre}:${r.precio}:${r.comida}`} className={`prod-tarjeta${r.producto === "otro" ? " otro" : ""}${r.comida ? " es-comida" : ""}`} style={r.comida ? undefined : colorDe(r.producto)}>
          <span className="cant">{r.cantidad}</span>
          <span className="nom">{r.comida ? "🍽 " : ""}{r.nombre}</span>
          {r.precio != null && <span className="unit">× {pesos(r.precio)}</span>}
          <strong className="sub">{pesos(r.valor)}</strong>
        </div>
      ))}
    </div>
  );
}
