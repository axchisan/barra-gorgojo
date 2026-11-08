import { useRef } from "react";
import { abonos, saldo, totalComida, unidades, type Cuenta } from "../../dominio/estado";
import { haceCuanto, pesos } from "../../dominio/formato";
import { iconoTipo } from "../cuentas";
import type { Nav } from "../navegacion";
import { vibrar } from "../vibrar";

export function TarjetaCuenta({ c, nav }: { c: Cuenta; nav: Nav }) {
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const largo = useRef(false);
  const tipo = iconoTipo(c);
  return (
    <button
      className={`tarjeta ${c.tipo}${c.reabierta ? " reabierta" : ""}`}
      onPointerDown={() => {
        largo.current = false;
        temporizador.current = setTimeout(() => {
          largo.current = true;
          vibrar();
          nav.ir({ v: "anotar", cuenta: c.id });
        }, 450);
      }}
      onPointerUp={() => clearTimeout(temporizador.current)}
      onPointerLeave={() => clearTimeout(temporizador.current)}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (!largo.current) nav.ir({ v: "cuenta", id: c.id }); }}
    >
      <span className="nombre">{c.nombre}</span>
      {tipo && c.nombre !== tipo.slice(3) && <span className="tipo">{tipo}</span>}
      <span className="valor">{pesos(saldo(c))}</span>
      {/* Con abonos, el valor es lo que falta. */}
      {/* Comida y bebidas por despachar, en la misma línea: la tarjeta no crece (C2). */}
      <span className="meta">
        {unidades(c)} · {haceCuanto(c.ultima)}{abonos(c).length > 0 && !c.reabierta ? " · con abono" : ""}
        {totalComida(c) > 0 && <span className="marca-comida" title="Con comida"> · 🍽</span>}
      </span>
      {c.lineas.some((l) => l.porDespachar && !l.anulada) && <span className="alerta despacho">🔔 Por despachar</span>}
      {c.reabierta && <span className="alerta">Anotaron después del cobro</span>}
    </button>
  );
}
