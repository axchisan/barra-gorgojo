import { useState } from "react";
import { jornada, saldo, situacion, type Cuenta } from "../../dominio/estado";
import { horaDe, pesos } from "../../dominio/formato";
import { resumenJornada } from "../../dominio/jornada";
import { ponerAviso } from "../avisos";
import { sinc } from "../sincronizacion";
import { TarjetasProducto } from "../componentes/TarjetasProducto";
import type { Nav } from "../navegacion";
import { cerrarConEnter } from "../teclado";
import { contarPaquetes, textoPaquetes } from "../paquetes";

const enTablet = () => typeof matchMedia === "function" && matchMedia("(min-width: 700px)").matches;

export function ElDia({ nav, cuentas }: { nav: Nav; cuentas: Cuenta[] }) {
  const hoy = jornada(Date.now());
  const [contado, setContado] = useState("");
  const r = resumenJornada(cuentas, hoy);
  const { vendido, vendidoComida, porMedio } = r;
  const recibidoEfectivo = r.efectivo;
  const porProducto = r.porProducto;
  const cierres = sinc.visible.jornadas?.[hoy] ?? [];
  const ultimoCierre = cierres[cierres.length - 1];
  const paquetesHoy = contarPaquetes(
    cuentas.filter((c) => !c.anulada).flatMap((c) => {
      const rondasHoy = new Set(c.rondas.filter((r) => jornada(r.en) === hoy).map((r) => r.id));
      return c.lineas.filter((l) => rondasHoy.has(l.ronda));
    }),
  );
  const abiertas = cuentas.filter((c) => situacion(c) === "abierta" && saldo(c) > 0);
  const porCobrar = abiertas.reduce((s, c) => s + saldo(c), 0);
  const diferencia = contado ? Number(contado) - recibidoEfectivo : null;
  const cerrar = () => {
    if (!contado) return;
    sinc.emitir({ t: "cerrar_jornada", fecha: hoy, contado: Number(contado) });
    setContado("");
    ponerAviso({ texto: `Día cerrado · contado ${pesos(Number(contado))}` });
  };

  return (
    <section className="dia">
      {/* Lo que se hace al cerrar va arriba: vendido y cuadre de caja (C10). */}
      <div className="cifra grande"><span>Vendido hoy</span><strong>{pesos(vendido)}</strong></div>

      <article className="caja">
        <h2>Cuadre de caja</h2>
        <p className="tenue">El efectivo que debería haber por ventas de hoy (sin contar la base): <strong>{pesos(recibidoEfectivo)}</strong></p>
        <input inputMode="numeric" enterKeyHint="done" onKeyDown={cerrarConEnter} placeholder="Efectivo contado" value={contado} onChange={(e) => setContado(e.target.value.replace(/\D/g, ""))} />
        {diferencia != null && (
          <p className={diferencia === 0 ? "cambio" : "cambio falta"}>
            {diferencia === 0 ? "Cuadra exacto" : diferencia > 0 ? `Sobran ${pesos(diferencia)}` : `Faltan ${pesos(-diferencia)}`}
          </p>
        )}
        {contado && <button className="principal" onClick={cerrar}>{ultimoCierre ? "Cerrar el día otra vez" : "Cerrar el día"}</button>}
        {ultimoCierre && (
          <p className="cierre-hecho">
            Cerrado a las {horaDe(ultimoCierre.en)} por {ultimoCierre.por}: contado {pesos(ultimoCierre.contado)}
            {ultimoCierre.contado === ultimoCierre.esperado ? " · cuadró exacto" : ultimoCierre.contado > ultimoCierre.esperado ? ` · sobraban ${pesos(ultimoCierre.contado - ultimoCierre.esperado)}` : ` · faltaban ${pesos(ultimoCierre.esperado - ultimoCierre.contado)}`}
            {recibidoEfectivo !== ultimoCierre.esperado && ` · desde entonces entraron ${pesos(recibidoEfectivo - ultimoCierre.esperado)} más en efectivo`}
          </p>
        )}
        {abiertas.length > 0 && (
          <p className="alerta">{abiertas.length === 1 ? "Queda 1 cuenta abierta" : `Quedan ${abiertas.length} cuentas abiertas`}: {abiertas.map((c) => c.nombre).join(", ")}</p>
        )}
      </article>

      <div className="cifras">
        <div className="cifra"><span>Efectivo</span><strong>{pesos(porMedio.efectivo)}</strong></div>
        <div className="cifra"><span>Nequi</span><strong>{pesos(porMedio.nequi)}</strong></div>
        <div className="cifra"><span>Breve</span><strong>{pesos(porMedio.breve)}</strong></div>
        <div className="cifra en-comida"><span>Pasado a comida</span><strong>{pesos(porMedio.comida)}</strong></div>
        {(paquetesHoy.petacos > 0 || paquetesHoy.medios > 0) && (
          <div className="cifra"><span>Petacos vendidos</span><strong>{textoPaquetes(paquetesHoy)}</strong></div>
        )}
        {vendidoComida > 0 && (
          <>
            <div className="cifra"><span>🍺 Barra</span><strong>{pesos(vendido - vendidoComida)}</strong></div>
            <div className="cifra en-comida"><span>🍽 Comida cobrada en barra</span><strong>{pesos(vendidoComida)}</strong></div>
          </>
        )}
        <div className="cifra pendiente"><span>Por cobrar · {abiertas.length} {abiertas.length === 1 ? "cuenta" : "cuentas"}</span><strong>{pesos(porCobrar)}</strong></div>
      </div>

      {/* Plegable: cerrado en teléfono, abierto en la tablet. */}
      <details className="caja por-producto" open={enTablet()}>
        <summary><h2>Por producto</h2></summary>
        <TarjetasProducto items={porProducto} />
      </details>
      {sinc.esAdministrador && <button className="enlace" onClick={() => nav.ir({ v: "dias" })}>Días anteriores y CSV</button>}
      <button className="enlace" onClick={() => nav.ir({ v: "inicio", pestana: "cuentas" }, true)}>Ver cuentas</button>
    </section>
  );
}
