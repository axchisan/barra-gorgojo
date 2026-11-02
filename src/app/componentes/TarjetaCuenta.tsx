import { useRef } from "react";
import { saldo, unidades, type Cuenta } from "../../dominio/estado";
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
      <span className="meta">{unidades(c)} · {haceCuanto(c.ultima)}</span>
      {c.reabierta && <span className="alerta">Anotaron después del cobro</span>}
    </button>
  );
}
