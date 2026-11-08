import { useState } from "react";
import { areaDe, type Area } from "../../dominio/areas";
import { efectivoDeJornada, jornada, saldo, situacion, type Cuenta } from "../../dominio/estado";
import { horaDe, pesos } from "../../dominio/formato";
import { pagosDeudasDe } from "../../dominio/deudas";
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
  const porProducto = r.porProducto;
  // Dos cajas (docs/14): la de la barra y la de la cocina. Cada una cuadra el efectivo que cobró.
  const [caja, setCaja] = useState<Area>(sinc.panel);
  const recibidoEfectivo = efectivoDeJornada(cuentas, hoy, caja);
  const efectivoCocina = efectivoDeJornada(cuentas, hoy, "comida");
  const cierres = (sinc.visible.jornadas?.[hoy] ?? []).filter((x) => areaDe(x.area) === caja);
  const ultimoCierre = cierres[cierres.length - 1];
  const nombreCaja = caja === "comida" ? "caja de cocina" : "caja de barra";
  const pagosDeudas = pagosDeudasDe(Object.values(sinc.visible.deudas ?? {}), hoy, jornada);
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
    sinc.emitir({ t: "cerrar_jornada", fecha: hoy, contado: Number(contado), area: caja });
    setContado("");
    ponerAviso({ texto: `Día cerrado · ${nombreCaja} · contado ${pesos(Number(contado))}` });
  };

  return (
    <section className="dia">
      {/* Lo que se hace al cerrar va arriba: vendido y cuadre de caja (C10). */}
      <div className="cifra grande"><span>Vendido hoy</span><strong>{pesos(vendido)}</strong></div>

      <article className="caja">
        <h2>Cuadre de caja</h2>
        {sinc.areas.length > 1 && (
          <div className="segmentos cajas" role="group" aria-label="Qué caja">
            {sinc.areas.map((a) => (
              <button key={a} className={caja === a ? `activo${a === "comida" ? " comida-chip" : ""}` : ""} aria-pressed={caja === a} onClick={() => { setCaja(a); setContado(""); }}>
                {a === "comida" ? "🍽 Cocina" : "🍺 Barra"}
              </button>
            ))}
          </div>
        )}
        <p className="tenue">El efectivo que debería haber en la {nombreCaja} por lo cobrado hoy allí (sin contar la base): <strong>{pesos(recibidoEfectivo)}</strong></p>
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
        {efectivoCocina > 0 && (
          <>
            <div className="cifra"><span>Efectivo caja barra</span><strong>{pesos(efectivoDeJornada(cuentas, hoy, "barra"))}</strong></div>
            <div className="cifra en-comida"><span>Efectivo caja cocina</span><strong>{pesos(efectivoCocina)}</strong></div>
          </>
        )}
        <div className="cifra"><span>Nequi</span><strong>{pesos(porMedio.nequi)}</strong></div>
        <div className="cifra"><span>Breve</span><strong>{pesos(porMedio.breve)}</strong></div>
        {porMedio.comida > 0 && <div className="cifra en-comida"><span>Pasado a comida</span><strong>{pesos(porMedio.comida)}</strong></div>}
        {/* Deudas (docs/15): lo fiado hoy es venta de hoy; lo que pagan de deudas va aparte de la caja. */}
        {porMedio.deuda > 0 && <div className="cifra deuda"><span>📒 Fiado hoy</span><strong>{pesos(porMedio.deuda)}</strong></div>}
        {pagosDeudas.total > 0 && (
          <button className="cifra deuda" onClick={() => nav.ir({ v: "deudas" })}>
            <span>📒 Pagos de deudas hoy (aparte de la caja)</span><strong>{pesos(pagosDeudas.total)}</strong>
          </button>
        )}
        {(paquetesHoy.petacos > 0 || paquetesHoy.medios > 0) && (
          <div className="cifra"><span>Petacos vendidos</span><strong>{textoPaquetes(paquetesHoy)}</strong></div>
        )}
        {vendidoComida > 0 && (
          <>
            <div className="cifra"><span>🍺 Barra</span><strong>{pesos(vendido - vendidoComida)}</strong></div>
            <div className="cifra en-comida"><span>🍽 Comida</span><strong>{pesos(vendidoComida)}</strong></div>
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
