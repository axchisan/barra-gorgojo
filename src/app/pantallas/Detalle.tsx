import { useState } from "react";
import {
  abonos, porPagarPorLinea, producto as productoDe, puedeEditarLinea, saldo, situacion, total, totalComida, unidades,
  type Cuenta, type Linea,
} from "../../dominio/estado";
import { cuantasRondas, horaDe, nombreRonda, palabraRonda, pesos, rondaViva } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import { Desglose } from "../componentes/Desglose";
import { EditarLinea } from "../componentes/EditarLinea";
import { NoExiste } from "../componentes/NoExiste";
import { TarjetasProducto } from "../componentes/TarjetasProducto";
import { VistaCliente } from "../componentes/VistaCliente";
import { CancelarPedido } from "../componentes/Despacho";
import { colorDe, iconoTipo, resumen } from "../cuentas";
import { useAtrasCierra, type Nav } from "../navegacion";
import { contarPaquetes, nombrePaquete, porPaquete, textoPaquetes } from "../paquetes";
import { sinc } from "../sincronizacion";

export function Detalle({ nav, id }: { nav: Nav; id: string }) {
  const c = sinc.visible.cuentas[id];
  const [modo, setModo] = useState<"resumen" | "rondas">("resumen");
  const [anulando, setAnulando] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [anularCon, setAnularCon] = useState<string | null>(null);
  useAtrasCierra(menu, () => setMenu(false));
  const [renombrar, setRenombrar] = useState<string | null>(null);
  const [cliente, setCliente] = useState(false);
  const [juntar, setJuntar] = useState(false);
  const [verAnuladas, setVerAnuladas] = useState(false);
  /** El abono al que se le está poniendo quién pagó, y lo escrito. */
  const [nombrando, setNombrando] = useState<{ pago: string; texto: string } | null>(null);
  useAtrasCierra(cliente, () => setCliente(false));
  if (!c) return <NoExiste nav={nav} />;

  const s = situacion(c);
  const palabra = palabraRonda(c);
  const tipo = iconoTipo(c);
  // Productos ya pagados del todo con un abono por productos (se marcan con ✓).
  const porPagar = porPagarPorLinea(c);
  const pagadas = new Set(c.lineas.filter((l) => !l.anulada && !porPagar.has(l.id) && c.pagos.some((p) => !p.deshecho && p.lineas?.some((x) => x.linea === l.id))).map((l) => l.id));

  if (cliente) return <VistaCliente c={c} cerrar={() => setCliente(false)} />;

  return (
    <main className="detalle">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>{c.nombre}</strong>
        <button className="quien" onClick={() => setMenu(!menu)} aria-label="Más opciones">⋮</button>
      </header>
      {menu && (
        <div className="menu-persona">
          <button onClick={() => { setRenombrar(c.nombre); setMenu(false); }}>Cambiar nombre</button>
          <button onClick={() => { setCliente(true); setMenu(false); }}>Mostrar al cliente</button>
          {/* Juntar: para cobrar dos cuentas como una (docs/04 «Juntar cuentas»). */}
          {s === "abierta" && c.lineas.length > 0 && (
            <button onClick={() => { setJuntar(true); setMenu(false); }}>Juntar con otra cuenta</button>
          )}
          {s === "abierta" && (c.juntadas ?? []).map((j) => (
            <button key={j.cuenta} onClick={() => {
              setMenu(false);
              sinc.emitir({ t: "separar", cuenta: c.id, desde: j.cuenta });
              ponerAviso({ texto: `${j.nombre}: separada otra vez` });
            }}>Separar «{j.nombre}»</button>
          ))}
          {/* Anular: una cuenta vacía, cualquiera; con productos, solo el administrador y con motivo (RF-07). */}
          {s === "abierta" && (total(c) === 0 || sinc.esAdministrador) && (
            <button className="peligro" onClick={() => {
              setMenu(false);
              if (total(c) > 0) return setAnularCon("");
              sinc.emitir({ t: "anular_cuenta", cuenta: c.id });
              nav.aInicio();
              ponerAviso({ texto: "Cuenta anulada", deshacer: () => sinc.emitir({ t: "reabrir", cuenta: c.id }) });
            }}>Anular cuenta</button>
          )}
        </div>
      )}
      {anularCon !== null && (
        <form className="anular-fila" onSubmit={(e) => {
          e.preventDefault();
          if (!anularCon.trim()) return;
          sinc.emitir({ t: "anular_cuenta", cuenta: c.id, motivo: anularCon.trim() });
          setAnularCon(null);
          nav.aInicio();
          ponerAviso({ texto: `${c.nombre}: anulada`, deshacer: () => sinc.emitir({ t: "reabrir", cuenta: c.id }) });
        }}>
          <span>Anular «{c.nombre}» de {pesos(total(c))}. ¿Por qué?</span>
          <input placeholder="Motivo: cuenta repetida, prueba…" autoCapitalize="sentences" enterKeyHint="done" value={anularCon} onChange={(e) => setAnularCon(e.target.value)} autoFocus />
          <button type="button" className="secundario" onClick={() => setAnularCon(null)}>Cancelar</button>
          <button className="peligro" disabled={!anularCon.trim()}>Anular cuenta</button>
        </form>
      )}
      {renombrar !== null && (
        <form className="renombrar" onSubmit={(e) => {
          e.preventDefault();
          if (renombrar.trim()) sinc.emitir({ t: "renombrar", cuenta: c.id, nombre: renombrar });
          setRenombrar(null);
        }}>
          <input value={renombrar} onChange={(e) => setRenombrar(e.target.value)} autoFocus />
          <button className="principal">Guardar</button>
        </form>
      )}

      {juntar && <HojaJuntar c={c} nav={nav} cerrar={() => setJuntar(false)} />}

      <section className="cabeza-total">
        {tipo && <span className="tipo">{tipo}</span>}
        <span className="total">{pesos(s === "abierta" ? saldo(c) : total(c))}</span>
        <span className="meta">{unidades(c)} productos · {cuantasRondas(c)}</span>
        {totalComida(c) > 0 && <Desglose c={c} />}
        {s === "cobrada" && <span className="estado cobrada">Cobrada · {c.pagos.filter((p) => !p.deshecho).map((p) => p.medio === "deuda" ? `a deuda de ${sinc.visible.deudas?.[p.deudor ?? ""]?.nombre ?? "alguien"}` : `${p.medio} por ${p.persona}`).join(", ")}</span>}
        {s === "comida" && <span className="estado comida">Pasada a comida{c.comidaCobrada ? " · ya cobrada allá" : " · falta cobrar en comida"}</span>}
        {s === "anulada" && <span className="estado anulada">Anulada</span>}
        {s === "juntada" && (
          <button className="estado juntada" onClick={() => nav.ir({ v: "cuenta", id: c.juntadaA!.cuenta }, true)}>
            Se juntó con {c.juntadaA!.nombre} ({c.juntadaA!.por}, {horaDe(c.juntadaA!.en)}) · ver
          </button>
        )}
        {s === "abierta" && (c.juntadas ?? []).length > 0 && (
          <span className="estado juntas">Con {c.juntadas!.map((j) => j.nombre).join(", ")}</span>
        )}
        {c.reabierta && <span className="alerta">Se anotó después del cobro. Falta cobrar {pesos(saldo(c))}</span>}
        {s === "abierta" && abonos(c).length > 0 && (
          <span className="estado abonada">Abonado {pesos(abonos(c).reduce((t, p) => t + p.monto, 0))} · falta {pesos(saldo(c))}</span>
        )}
      </section>

      {s === "abierta" && abonos(c).length > 0 && (
        <section className="abonos-lista">
          {abonos(c).map((p) => {
            // Cada producto abonado con su chico o pedida: «4 Águila (Chico 2)».
            const que = p.lineas?.map((x) => {
              const l = c.lineas.find((y) => y.id === x.linea);
              const r = l && c.rondas.find((y) => y.id === l.ronda);
              return `${x.cantidad} ${l?.nombre ?? ""}${r ? ` (${nombreRonda(c, r)})` : ""}`;
            }).join(", ");
            const puede = sinc.esAdministrador || (p.persona === sinc.sesion?.persona && Date.now() - p.en < 5 * 60_000);
            return (
              <div key={p.id} className="abono-fila">
                <span>{p.pagador && <b className="pagador">{p.pagador}: </b>}<b>{pesos(p.monto)}</b> {p.medio === "efectivo" ? "en efectivo" : p.medio === "nequi" ? "por Nequi" : p.medio === "deuda" ? `📒 a deuda de ${sinc.visible.deudas?.[p.deudor ?? ""]?.nombre ?? "alguien"}` : "por Breve"}{que ? ` · ${que}` : ""}</span>
                <small className="tenue">{horaDe(p.en)} · {p.persona}</small>
                {nombrando?.pago === p.id ? (
                  <form className="nombrar-abono" onSubmit={(e) => {
                    e.preventDefault();
                    sinc.emitir({ t: "pagador", cuenta: c.id, pago: p.id, pagador: nombrando.texto.trim() });
                    setNombrando(null);
                  }}>
                    <input aria-label="Quién pagó este abono" placeholder="¿Quién pagó?" maxLength={40} enterKeyHint="done" autoCapitalize="words" autoFocus
                      value={nombrando.texto} onChange={(e) => setNombrando({ pago: p.id, texto: e.target.value })} />
                    <button className="principal">Guardar</button>
                    <button type="button" className="secundario" onClick={() => setNombrando(null)}>✕</button>
                  </form>
                ) : (
                  <div className="acciones-abono">
                    <button className="chip" onClick={() => setNombrando({ pago: p.id, texto: p.pagador ?? "" })}>✎ {p.pagador ? "Cambiar quién" : "¿Quién?"}</button>
                    {puede && <button className="chip" onClick={() => sinc.emitir({ t: "deshacer_pago", cuenta: c.id, pago: p.id })}>Deshacer</button>}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      <div className="chips centro">
        <button className={modo === "resumen" ? "chip activo" : "chip"} onClick={() => setModo("resumen")}>Resumen</button>
        <button className={modo === "rondas" ? "chip activo" : "chip"} onClick={() => setModo("rondas")}>{palabra === "chico" ? "Chicos" : "Pedidas"}</button>
      </div>

      {modo === "resumen" ? (
        <>
          {textoPaquetes(contarPaquetes(c.lineas)) && (
            <p className="incluye">Incluye {textoPaquetes(contarPaquetes(c.lineas))}</p>
          )}
          <TarjetasProducto items={resumen(c)} />
        </>
      ) : (
        <>
          {s === "abierta" && <p className="nota centrada">{sinc.tieneArea("barra") ? "Toque un producto para cambiar la cantidad o anularlo." : "Toque un plato (o una bebida que pidió comida) para cambiar la cantidad o anularlo. Lo de la barra solo se ve."}</p>}
          {/* Las pedidas anuladas del todo van plegadas al final: no estorban (siguen en la auditoría). */}
          {[...c.rondas].reverse().filter((r) => verAnuladas || rondaViva(c, r.id)).sort((a, b) => Number(rondaViva(c, b.id)) - Number(rondaViva(c, a.id))).map((r) => {
            const lineas = c.lineas.filter((l) => l.ronda === r.id);
            const sub = lineas.reduce((t, l) => t + (l.anulada ? 0 : l.cantidad * l.precio), 0);
            const elegida = lineas.find((l) => l.id === anulando);
            return (
              <section key={r.id} className={rondaViva(c, r.id) ? "ronda-tarjeta" : "ronda-tarjeta anulada"}>
                <header>
                  <strong>{rondaViva(c, r.id) ? nombreRonda(c, r) : "Anulada"}{r.de ? ` · de ${r.de.nombre}` : ""}</strong>
                  {c.tipo === "cancha" && s === "abierta" && rondaViva(c, r.id) && (
                    <button className="chip marcar-ronda" onClick={() => sinc.emitir({ t: "marcar_ronda", cuenta: c.id, ronda: r.id, adicional: !r.adicional })}>
                      {r.adicional ? "Es chico" : "Es adicional"}
                    </button>
                  )}
                  <span className="tenue">{horaDe(r.en)} · {r.persona}{r.detalle ? ` · 📝 ${r.detalle}` : ""}</span>
                  {s === "abierta" && lineas.some((l) => l.porDespachar && !l.anulada) && (
                    <span className="cancelar-pedido"><CancelarPedido c={c} lineas={lineas.filter((l) => l.porDespachar && !l.anulada)} /></span>
                  )}
                  <strong className="sub">
                    {/* Cuántos productos lleva la pedida, junto a lo que vale. */}
                    <small className="cuantos">{(() => { const k = lineas.reduce((t, l) => t + (l.anulada ? 0 : l.cantidad), 0); return `${k} ${k === 1 ? "producto" : "productos"} · `; })()}</small>
                    {pesos(sub)}
                  </strong>
                </header>
                {(() => {
                  const ficha = (l: Linea) => (
                    <button
                      key={l.id}
                      className={`ficha${l.anulada ? " anulada" : ""}${!l.anulada && pagadas.has(l.id) ? " pagada" : ""}${anulando === l.id ? " elegida" : ""}`}
                      style={l.anulada ? undefined : colorDe(l.producto)}
                      // Quien solo tiene comida ve lo de la barra, pero solo toca lo de comida (docs/14).
                      disabled={!!l.anulada || !puedeEditarLinea(sinc.areas, l) || (s !== "abierta" && !productoDe(sinc.visible, l.producto)?.conNombre)}
                      onClick={() => setAnulando(anulando === l.id ? null : l.id)}
                    >
                      <b>{l.cantidad}</b> {l.comida ? "🍽 " : ""}{l.nombre}{l.nota ? ` · ${l.nota}` : ""}{l.editada && !l.anulada ? " ✎" : ""}{!l.anulada && pagadas.has(l.id) ? " ✓" : ""}
                      {!l.anulada && l.porDespachar && <span className="marca despacho">🔔 por despachar</span>}
                    </button>
                  );
                  const { sueltas, grupos } = porPaquete(lineas);
                  return (
                    <>
                      {grupos.map((g) => (
                        <div key={g.paquete.id} className="paquete">
                          <span className="etiqueta-paquete">
                            📦 {nombrePaquete(g.paquete)} · {g.lineas.reduce((t, l) => t + (l.anulada ? 0 : l.cantidad), 0)}
                          </span>
                          <div className="fichas">{g.lineas.map(ficha)}</div>
                        </div>
                      ))}
                      {sueltas.length > 0 && <div className="fichas">{sueltas.map(ficha)}</div>}
                    </>
                  );
                })()}
                {elegida && <EditarLinea c={c} l={elegida} soloEtiqueta={s !== "abierta"} cerrar={() => setAnulando(null)} />}
              </section>
            );
          })}
          {c.rondas.some((r) => !rondaViva(c, r.id)) && (
            <button className="enlace ver-anuladas" onClick={() => setVerAnuladas(!verAnuladas)}>
              {verAnuladas ? "▾ Esconder las anuladas" : `▸ Pedidas anuladas (${c.rondas.filter((r) => !rondaViva(c, r.id)).length})`}
            </button>
          )}
        </>
      )}

      <div className="pie-fijo">
        {s === "abierta" && (
          <>
            <button className="secundario" onClick={() => nav.ir({ v: "anotar", cuenta: c.id })}>＋ {palabra === "chico" ? "Chico" : "Pedida"}</button>
            {c.rondas.length > 0 && <button className="secundario" onClick={() => nav.ir({ v: "anotar", cuenta: c.id, repetir: true })}>↻ Repetir</button>}
            <button className="principal grande" disabled={saldo(c) <= 0} onClick={() => nav.ir({ v: "cobrar", id: c.id })}>Cobrar</button>
          </>
        )}
        {s === "comida" && !c.comidaCobrada && (
          <button className="principal grande" onClick={() => sinc.emitir({ t: "comida_cobrada", cuenta: c.id, valor: true })}>Ya se cobró en comida</button>
        )}
        {(s === "cobrada" || s === "comida" || s === "anulada") && sinc.esAdministrador && (
          <button className="secundario" onClick={() => sinc.emitir({ t: "reabrir", cuenta: c.id })}>Reabrir</button>
        )}
      </div>
    </main>
  );
}

/** Escoger la cuenta a la que se suma esta: todo lo de esta pasa allá, para cobrarlas juntas. */
function HojaJuntar({ c, nav, cerrar }: { c: Cuenta; nav: Nav; cerrar: () => void }) {
  useAtrasCierra(true, cerrar);
  const otras = Object.values(sinc.visible.cuentas)
    .filter((x) => x.id !== c.id && situacion(x) === "abierta" && (x.lineas.length > 0 || Date.now() - x.abiertaEn < 3 * 3600_000))
    .sort((a, b) => b.ultima - a.ultima);
  const juntarCon = (d: Cuenta) => {
    sinc.emitir({ t: "juntar", cuenta: d.id, desde: c.id });
    cerrar();
    nav.ir({ v: "cuenta", id: d.id }, true);
    ponerAviso({ texto: `${c.nombre} quedó junto con ${d.nombre}`, deshacer: () => sinc.emitir({ t: "separar", cuenta: d.id, desde: c.id }) });
  };
  return (
    <div className="hoja" onClick={cerrar}>
      <div className="hoja-cuerpo" onClick={(e) => e.stopPropagation()}>
        <header className="cabeza-hoja">
          <h2>¿Con qué cuenta se junta «{c.nombre}»?</h2>
          <button className="cerrar-hoja" aria-label="Cerrar" onClick={cerrar}>✕</button>
        </header>
        <p className="nota">Lo de {c.nombre} ({pesos(saldo(c))}) pasa a la que escoja, y se cobran juntas.</p>
        {otras.length === 0 && <p className="vacio">No hay otras cuentas abiertas.</p>}
        <div className="tarjetas">
          {otras.map((x) => (
            <button key={x.id} className={`tarjeta ${x.tipo}`} onClick={() => juntarCon(x)}>
              <span className="nombre">{x.nombre}</span>
              <span className="valor">{pesos(saldo(x))}</span>
              <span className="meta">Juntas: {pesos(saldo(x) + saldo(c))}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
