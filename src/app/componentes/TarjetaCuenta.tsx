import { useRef } from "react";
import { abonos, estadoDomicilio, nombreEstadoDomicilio, saldo, totalComida, unidades, type Cuenta } from "../../dominio/estado";
import { haceCuanto, horaDe, pesos } from "../../dominio/formato";
import { iconoTipo } from "../cuentas";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";
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
      {/* El tipo, si el nombre no lo dice ya («Mesa 4», «Mesa · 1:15 p. m.»). */}
      {tipo && !c.nombre.startsWith(tipo.slice(3)) && <span className="tipo">{tipo}</span>}
      <span className="valor">{pesos(saldo(c))}</span>
      {/* Con abonos, el valor es lo que falta. */}
      {/* Comida y bebidas por despachar, en la misma línea: la tarjeta no crece (C2). */}
      <span className="meta">
        {unidades(c)} · {haceCuanto(c.ultima)}{abonos(c).length > 0 && !c.reabierta ? " · con abono" : ""}
        {/* En el panel de comida, cuánto va de comida; en la barra, solo la marca. */}
        {totalComida(c) > 0 && <span className="marca-comida" title="Con comida"> · 🍽{sinc.panel === "comida" ? ` ${pesos(totalComida(c))}` : ""}</span>}
      </span>
      {c.lineas.some((l) => l.porDespachar && !l.anulada) && <span className="alerta despacho">🔔 Por despachar</span>}
      {/* Domicilio (2026-11-15): en qué va y para qué hora, sutil; en rojo si se atrasó. */}
      {c.tipo === "domicilio" && !c.anulada && estadoDomicilio(c) !== "entregado" && (
        <span className={`marca-domicilio${c.domicilio?.entrega && c.domicilio.entrega < Date.now() ? " atrasado" : ""}`}>
          {nombreEstadoDomicilio[estadoDomicilio(c)]}{c.domicilio?.entrega ? ` · ${horaDe(c.domicilio.entrega)}` : ""}
        </span>
      )}
      {(() => {
        // Apartado por entregar (2026-11-15): la hora más próxima, o «sin hora».
        const r = c.rondas.filter((x) => x.apartado && !x.entregado && c.lineas.some((l) => l.ronda === x.id && !l.anulada));
        if (!r.length) return null;
        const horas = r.map((x) => x.apartado!.para).filter((x): x is number => !!x).sort((a, b) => a - b);
        return <span className={`alerta apartado${horas[0] && horas[0] < Date.now() ? " atrasado" : ""}`}>⏰ Apartado{horas[0] ? ` · ${horaDe(horas[0])}` : ""}</span>;
      })()}
      {c.reabierta && <span className="alerta">Anotaron después del cobro</span>}
    </button>
  );
}
