// El día, para hacer cuentas (rehecho el 2026-11-15 con la venta real de ese día): lo vendido
// partido en barra y comida, cómo pagaron (cuánto de comida entró por Nequi), cuánto le pasa
// una caja a la otra, el cuadre de cada caja y la lista de cuentas con filtros y detalle.
import { useState } from "react";
import { areaDe, type Area } from "../../dominio/areas";
import { efectivoDeJornada, jornada, type Cuenta } from "../../dominio/estado";
import { horaDe, pesos } from "../../dominio/formato";
import { pagosDeudasDe } from "../../dominio/deudas";
import { cuentasDelDia, resumenJornada, type CuentaDelDia, type Medios, type Parte } from "../../dominio/jornada";
import { ponerAviso } from "../avisos";
import { sinc } from "../sincronizacion";
import { TarjetasProducto } from "../componentes/TarjetasProducto";
import type { Nav } from "../navegacion";
import { cerrarConEnter } from "../teclado";
import { contarPaquetes, textoPaquetes } from "../paquetes";

const MEDIOS: { id: Medios; nombre: string; icono: string }[] = [
  { id: "efectivo", nombre: "Efectivo", icono: "💵" },
  { id: "nequi", nombre: "Nequi", icono: "📱" },
  { id: "breve", nombre: "Breve", icono: "📲" },
  { id: "deuda", nombre: "Fiado", icono: "📒" },
  { id: "comida", nombre: "Pasado a comida", icono: "🍽" },
];
const nombreMedio = (m: Medios) => MEDIOS.find((x) => x.id === m)!.nombre;
const nombreCaja = (a: Area) => (a === "comida" ? "cocina" : "barra");
const suma = (p: Parte) => p.barra + p.comida;

type Filtro = "todas" | Medios | "porCobrar" | "conComida" | "anuladas";

function tipoDe(c: Cuenta): string {
  if (c.tipo === "mesa") return c.mesa ? `Mesa ${c.mesa}` : "Mesa";
  if (c.tipo === "domicilio") return "🛵 Domicilio";
  if (c.tipo === "cancha") return "🎯 Cancha";
  if (c.tipo === "rapida") return "Venta rápida";
  return "";
}

export function ElDia({ nav, cuentas }: { nav: Nav; cuentas: Cuenta[] }) {
  const hoy = jornada(Date.now());
  const r = resumenJornada(cuentas, hoy);
  const d = cuentasDelDia(cuentas, hoy);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [buscar, setBuscar] = useState("");
  const [verProductos, setVerProductos] = useState<"comida" | "barra">("comida");
  const vendidoBarra = r.vendido - r.vendidoComida;
  const pagosDeudas = pagosDeudasDe(Object.values(sinc.visible.deudas ?? {}), hoy, jornada);
  const paquetesHoy = contarPaquetes(
    cuentas.filter((c) => !c.anulada).flatMap((c) => {
      const rondasHoy = new Set(c.rondas.filter((x) => jornada(x.en) === hoy).map((x) => x.id));
      return c.lineas.filter((l) => rondasHoy.has(l.ronda));
    }),
  );
  const filas = MEDIOS.filter((m) => m.id === "efectivo" || suma(d.porMedio[m.id]) > 0);
  const totalPagado: Parte = filas.reduce((t, m) => ({ barra: t.barra + d.porMedio[m.id].barra, comida: t.comida + d.porMedio[m.id].comida }), { barra: 0, comida: 0 });
  const porCobrarN = d.cuentas.filter((x) => x.falta > 0).length;

  // Entre cajas: lo que cada caja cobró de la otra área, neto por medio.
  const cruces = (["efectivo", "nequi", "breve"] as const).map((m) => {
    const neto = d.cajas.barra.deLaOtra[m] - d.cajas.comida.deLaOtra[m]; // > 0: la barra le debe a la cocina
    return { m, neto, deComidaEnBarra: d.cajas.barra.deLaOtra[m], deBarraEnCocina: d.cajas.comida.deLaOtra[m] };
  }).filter((x) => x.deComidaEnBarra || x.deBarraEnCocina);

  const lista = filtrar(d.cuentas, filtro, buscar);
  const ponerFiltro = (f: Filtro) => {
    setFiltro(f);
    document.getElementById("cuentas-del-dia")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="dia dia-nuevo">
      {/* 1. Lo vendido, partido en barra y comida. */}
      <article className="dia-hero">
        <span className="dia-hero-titulo">Vendido hoy</span>
        <strong className="dia-hero-total">{pesos(r.vendido)}</strong>
        <span className="dia-hero-sub">{d.cuentas.length} {d.cuentas.length === 1 ? "cuenta" : "cuentas"}{porCobrarN ? ` · ${porCobrarN} sin cobrar` : " · todas cobradas"}</span>
        <div className="dia-hero-areas">
          <div><span>🍺 Barra</span><strong>{pesos(vendidoBarra)}</strong></div>
          <div className="de-comida"><span>🍽 Comida</span><strong>{pesos(r.vendidoComida)}</strong></div>
        </div>
      </article>

      <div className="dia-columnas">
        <div className="dia-col">
          {/* Lo que se hace al cerrar, arriba (C10): el efectivo que debe haber y el contado. */}
          <Cuadre cuentas={cuentas} hoy={hoy} d={d} />

          {/* 2. Cómo pagaron, partido en barra y comida (cada pago repartido). */}
          <article className="caja dia-tabla-caja">
            <h2>¿Cómo pagaron?</h2>
            <table className="dia-tabla">
              <thead><tr><th></th><th>🍺 Barra</th><th>🍽 Comida</th><th>Total</th></tr></thead>
              <tbody>
                {filas.map((m) => (
                  <tr key={m.id} onClick={() => ponerFiltro(m.id)} className={`fila-${m.id}`} aria-label={`${m.nombre}: ${pesos(suma(d.porMedio[m.id]))}`}>
                    <th>{m.icono} {m.nombre}</th>
                    <td>{pesos(d.porMedio[m.id].barra)}</td>
                    <td className="de-comida">{pesos(d.porMedio[m.id].comida)}</td>
                    <td><b>{pesos(suma(d.porMedio[m.id]))}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th>Cobrado</th><td>{pesos(totalPagado.barra)}</td><td className="de-comida">{pesos(totalPagado.comida)}</td><td><b>{pesos(suma(totalPagado))}</b></td></tr>
                {suma(d.porCobrar) > 0 && (
                  <tr className="por-cobrar" onClick={() => ponerFiltro("porCobrar")}>
                    <th>⏳ Por cobrar</th><td>{pesos(d.porCobrar.barra)}</td><td className="de-comida">{pesos(d.porCobrar.comida)}</td><td><b>{pesos(suma(d.porCobrar))}</b></td>
                  </tr>
                )}
              </tfoot>
            </table>
            <p className="nota">Toque una fila para ver esas cuentas. Una cuenta con comida y barra se reparte según lo que tenía de cada una{r.porMedio.deuda > 0 ? "; lo fiado es venta, pero no es plata en la caja" : ""}.</p>
          </article>

          {/* 3. Entre cajas: lo que una caja cobró de la otra área. */}
          {cruces.length > 0 && (
            <article className="caja entre-cajas">
              <h2>Entre cajas</h2>
              {cruces.map(({ m, neto, deComidaEnBarra, deBarraEnCocina }) => (
                <div key={m} className="cruce">
                  <p className="cruce-titulo">
                    {neto === 0
                      ? <>{nombreMedio(m)}: <b>quedan a paz y salvo</b></>
                      : <>{nombreMedio(m)}: la <b>{neto > 0 ? "barra" : "cocina"}</b> le pasa a la <b>{neto > 0 ? "cocina" : "barra"}</b> <strong>{pesos(Math.abs(neto))}</strong></>}
                  </p>
                  <p className="tenue">
                    La barra cobró {pesos(deComidaEnBarra)} de comida · la cocina cobró {pesos(deBarraEnCocina)} de barra
                  </p>
                </div>
              ))}
            </article>
          )}

          {(pagosDeudas.total > 0 || paquetesHoy.petacos > 0 || paquetesHoy.medios > 0) && (
            <div className="cifras">
              {pagosDeudas.total > 0 && (
                <button className="cifra deuda" onClick={() => nav.ir({ v: "deudas" })}>
                  <span>📒 Pagos de deudas hoy (aparte de la caja)</span><strong>{pesos(pagosDeudas.total)}</strong>
                </button>
              )}
              {(paquetesHoy.petacos > 0 || paquetesHoy.medios > 0) && (
                <div className="cifra"><span>Petacos vendidos</span><strong>{textoPaquetes(paquetesHoy)}</strong></div>
              )}
            </div>
          )}
        </div>

        <div className="dia-col">
          {/* 4. Las cuentas del día, con filtros y su detalle. */}
          <article className="caja cuentas-dia" id="cuentas-del-dia">
            <h2>Cuentas del día</h2>
            <div className="chips filtros-dia" role="group" aria-label="Filtrar cuentas">
              {([
                ["todas", `Todas · ${d.cuentas.length}`],
                ...MEDIOS.filter((m) => d.cuentas.some((x) => x.pagos.some((p) => p.medio === m.id))).map((m) => [m.id, m.nombre] as const),
                ...(porCobrarN ? [["porCobrar", `Por cobrar · ${porCobrarN}`] as const] : []),
                ["conComida", "Con comida"],
                ...(d.anuladas.length ? [["anuladas", `Anuladas · ${d.anuladas.length}`] as const] : []),
              ] as [Filtro, string][]).map(([f, texto]) => (
                <button key={f} className={filtro === f ? "chip activo" : "chip"} aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{texto}</button>
              ))}
            </div>
            <input className="buscar" placeholder="Buscar por nombre o mesa" aria-label="Buscar en las cuentas del día" value={buscar}
              enterKeyHint="search" onKeyDown={cerrarConEnter} onChange={(e) => setBuscar(e.target.value)} />
            {filtro !== "todas" && filtro !== "anuladas" && <ResumenFiltro lista={lista} filtro={filtro} />}
            {filtro === "anuladas"
              ? d.anuladas.filter((c) => !buscar.trim() || c.nombre.toLowerCase().includes(buscar.trim().toLowerCase())).map((c) => (
                <button key={c.id} className="renglon-dia anulada" onClick={() => nav.ir({ v: "cuenta", id: c.id })}>
                  <span className="renglon-dia-nombre">{c.nombre}</span>
                  <span className="renglon-dia-sub">Anulada{c.anulacion ? ` por ${c.anulacion.por} · ${horaDe(c.anulacion.en)}${c.anulacion.motivo ? ` · «${c.anulacion.motivo}»` : ""}` : ""}</span>
                </button>
              ))
              : lista.map((x) => <FilaCuenta key={x.cuenta.id} x={x} nav={nav} />)}
            {filtro !== "anuladas" && lista.length === 0 && <p className="vacio">No hay cuentas así.</p>}
          </article>

          {/* 5. Por producto, comida y barra por separado. */}
          <article className="caja por-producto">
            <h2>Por producto</h2>
            <div className="segmentos" role="group" aria-label="Qué productos">
              <button className={verProductos === "comida" ? "activo comida-chip" : ""} aria-pressed={verProductos === "comida"} onClick={() => setVerProductos("comida")}>🍽 Comida · {pesos(r.vendidoComida)}</button>
              <button className={verProductos === "barra" ? "activo" : ""} aria-pressed={verProductos === "barra"} onClick={() => setVerProductos("barra")}>🍺 Barra · {pesos(vendidoBarra)}</button>
            </div>
            <TarjetasProducto items={r.porProducto.filter((p) => !!p.comida === (verProductos === "comida"))} />
          </article>
        </div>
      </div>

      {sinc.esAdministrador && <button className="enlace" onClick={() => nav.ir({ v: "dias" })}>Días anteriores y CSV</button>}
      <button className="enlace" onClick={() => nav.ir({ v: "inicio", pestana: "cuentas" }, true)}>Ver cuentas</button>
    </section>
  );
}

function filtrar(cuentas: CuentaDelDia[], filtro: Filtro, buscar: string): CuentaDelDia[] {
  const q = buscar.trim().toLowerCase();
  return cuentas.filter((x) => {
    if (q && !`${x.cuenta.nombre} ${tipoDe(x.cuenta)}`.toLowerCase().includes(q)) return false;
    if (filtro === "todas") return true;
    if (filtro === "porCobrar") return x.falta > 0;
    if (filtro === "conComida") return x.comida > 0;
    if (filtro === "anuladas") return false;
    return x.pagos.some((p) => p.medio === filtro);
  });
}

/** La suma de lo filtrado: p. ej. «Nequi · 9 cuentas · $ 604.500 (barra … · comida …)». */
function ResumenFiltro({ lista, filtro }: { lista: CuentaDelDia[]; filtro: Filtro }) {
  let barra = 0, comida = 0;
  for (const x of lista) {
    if (filtro === "porCobrar") { barra += x.falta; continue; } // se muestra solo el total
    if (filtro === "conComida") { barra += x.barra; comida += x.comida; continue; }
    for (const p of x.pagos) if (p.medio === filtro) { barra += p.barra; comida += p.comida; }
  }
  const total = barra + comida;
  return (
    <p className="resumen-filtro">
      <b>{lista.length} {lista.length === 1 ? "cuenta" : "cuentas"} · {pesos(total)}</b>
      {filtro !== "porCobrar" && <span> · 🍺 {pesos(barra)} · 🍽 {pesos(comida)}</span>}
    </p>
  );
}

/** Una cuenta del día: nombre, total, de qué fue y cómo la pagaron (quién cobró y en qué caja). */
function FilaCuenta({ x, nav }: { x: CuentaDelDia; nav: Nav }) {
  const c = x.cuenta;
  const deudas = sinc.visible.deudas ?? {};
  const tipo = tipoDe(c);
  return (
    <button className={`renglon-dia${x.falta > 0 ? " sin-cobrar" : ""}`} onClick={() => nav.ir({ v: "cuenta", id: c.id })}>
      <span className="renglon-dia-cabeza">
        <span className="renglon-dia-nombre">{c.nombre}</span>
        <strong className="renglon-dia-total">{pesos(x.barra + x.comida)}</strong>
      </span>
      <span className="renglon-dia-sub">
        {horaDe(x.desde)}{tipo && !c.nombre.includes(tipo) ? ` · ${tipo}` : ""}
        {x.barra > 0 && <span className="parte"> · 🍺 {pesos(x.barra)}</span>}
        {x.comida > 0 && <span className="parte de-comida"> · 🍽 {pesos(x.comida)}</span>}
      </span>
      <span className="renglon-dia-pagos">
        {x.pagos.map((p) => (
          <span key={p.id} className={`pago-chip medio-${p.medio}`}>
            {nombreMedio(p.medio)} {pesos(p.monto)}{p.medio === "deuda" && p.deudor ? ` · ${deudas[p.deudor]?.nombre ?? p.deudor}` : ""} · {p.persona} ({nombreCaja(p.caja)})
          </span>
        ))}
        {x.falta > 0 && <span className="pago-chip falta">⏳ Falta {pesos(x.falta)}</span>}
      </span>
    </button>
  );
}

/** El cuadre del efectivo de cada caja: lo que debería haber, lo contado y cerrar el día. */
function Cuadre({ cuentas, hoy, d }: { cuentas: Cuenta[]; hoy: string; d: ReturnType<typeof cuentasDelDia> }) {
  const [contado, setContado] = useState("");
  const [caja, setCaja] = useState<Area>(sinc.panel);
  const recibidoEfectivo = efectivoDeJornada(cuentas, hoy, caja);
  const cierres = (sinc.visible.jornadas?.[hoy] ?? []).filter((x) => areaDe(x.area) === caja);
  const ultimoCierre = cierres[cierres.length - 1];
  const diferencia = contado ? Number(contado) - recibidoEfectivo : null;
  const deCaja = d.cajas[caja].porMedio;
  const cerrar = () => {
    if (!contado) return;
    sinc.emitir({ t: "cerrar_jornada", fecha: hoy, contado: Number(contado), area: caja });
    setContado("");
    ponerAviso({ texto: `Día cerrado · caja de ${nombreCaja(caja)} · contado ${pesos(Number(contado))}` });
  };
  return (
    <article className="caja cuadre">
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
      <p className="tenue">Lo cobrado hoy en la caja de {nombreCaja(caja)}:</p>
      <div className="cuadre-recibio">
        <div className="cuadre-efectivo"><span>💵 Efectivo que debe haber</span><strong>{pesos(recibidoEfectivo)}</strong><small>Sin contar la base</small></div>
        {deCaja.nequi > 0 && <div><span>📱 Nequi</span><b>{pesos(deCaja.nequi)}</b></div>}
        {deCaja.breve > 0 && <div><span>📲 Breve</span><b>{pesos(deCaja.breve)}</b></div>}
        {deCaja.deuda > 0 && <div><span>📒 Fiado</span><b>{pesos(deCaja.deuda)}</b></div>}
      </div>
      <input inputMode="numeric" enterKeyHint="done" onKeyDown={cerrarConEnter} placeholder="Efectivo contado" aria-label="Efectivo contado" value={contado} onChange={(e) => setContado(e.target.value.replace(/\D/g, ""))} />
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
    </article>
  );
}
