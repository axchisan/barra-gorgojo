import { useState } from "react";
import {
  producto as productoDe, saldo, situacion, total, totalComida, unidades,
  type Linea,
} from "../../dominio/estado";
import { horaDe, palabraRonda, pesos } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import { Desglose } from "../componentes/Desglose";
import { EditarLinea } from "../componentes/EditarLinea";
import { NoExiste } from "../componentes/NoExiste";
import { TarjetasProducto } from "../componentes/TarjetasProducto";
import { colorDe, iconoTipo, resumen } from "../cuentas";
import { useAtrasCierra, type Nav } from "../navegacion";
import { contarPaquetes, nombrePaquete, porPaquete, textoPaquetes } from "../paquetes";
import { sinc } from "../sincronizacion";

export function Detalle({ nav, id }: { nav: Nav; id: string }) {
  const c = sinc.visible.cuentas[id];
  const [modo, setModo] = useState<"resumen" | "rondas">("resumen");
  const [anulando, setAnulando] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  useAtrasCierra(menu, () => setMenu(false));
  const [renombrar, setRenombrar] = useState<string | null>(null);
  const [cliente, setCliente] = useState(false);
  useAtrasCierra(cliente, () => setCliente(false));
  if (!c) return <NoExiste nav={nav} />;

  const s = situacion(c);
  const palabra = palabraRonda(c);
  const plural = palabra === "chico" ? "chicos" : "pedidas";
  const tipo = iconoTipo(c);

  if (cliente) {
    return (
      <main className="cliente" onClick={() => setCliente(false)}>
        <h1>{c.nombre}</h1>
        {resumen(c).map((r) => (
          <p key={`${r.producto}:${r.nombre}:${r.precio}`}><span>{r.cantidad} {r.nombre}</span><span>{pesos(r.valor)}</span></p>
        ))}
        {totalComida(c) > 0 && (
          <>
            <p className="parte"><span>Barra</span><span>{pesos(total(c) - totalComida(c))}</span></p>
            <p className="parte"><span>🍽 Comida</span><span>{pesos(totalComida(c))}</span></p>
          </>
        )}
        <p className="total-cliente"><span>Total</span><span>{pesos(saldo(c))}</span></p>
        <small>Toque para volver</small>
      </main>
    );
  }

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
          {s === "abierta" && (
            <button className="peligro" onClick={() => {
              sinc.emitir({ t: "anular_cuenta", cuenta: c.id });
              nav.aInicio();
              ponerAviso({ texto: "Cuenta anulada", deshacer: () => sinc.emitir({ t: "reabrir", cuenta: c.id }) });
            }}>Anular cuenta</button>
          )}
        </div>
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

      <section className="cabeza-total">
        {tipo && <span className="tipo">{tipo}</span>}
        <span className="total">{pesos(s === "abierta" ? saldo(c) : total(c))}</span>
        <span className="meta">{unidades(c)} productos · {c.rondas.length} {c.rondas.length === 1 ? palabra : plural}</span>
        {totalComida(c) > 0 && <Desglose c={c} />}
        {s === "cobrada" && <span className="estado cobrada">Cobrada · {c.pagos.filter((p) => !p.deshecho).map((p) => `${p.medio} por ${p.persona}`).join(", ")}</span>}
        {s === "comida" && <span className="estado comida">Pasada a comida{c.comidaCobrada ? " · ya cobrada allá" : " · falta cobrar en comida"}</span>}
        {s === "anulada" && <span className="estado anulada">Anulada</span>}
        {c.reabierta && <span className="alerta">Se anotó después del cobro. Falta cobrar {pesos(saldo(c))}</span>}
      </section>

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
          {s === "abierta" && <p className="nota centrada">Toque un producto para cambiar la cantidad o anularlo.</p>}
          {[...c.rondas].reverse().map((r) => {
            const lineas = c.lineas.filter((l) => l.ronda === r.id);
            const sub = lineas.reduce((t, l) => t + (l.anulada ? 0 : l.cantidad * l.precio), 0);
            const elegida = lineas.find((l) => l.id === anulando);
            return (
              <section key={r.id} className="ronda-tarjeta">
                <header>
                  <strong>{palabra === "chico" ? "Chico" : "Pedida"} {r.numero}</strong>
                  <span className="tenue">{horaDe(r.en)} · {r.persona}</span>
                  <strong className="sub">{pesos(sub)}</strong>
                </header>
                {(() => {
                  const ficha = (l: Linea) => (
                    <button
                      key={l.id}
                      className={`ficha${l.anulada ? " anulada" : ""}${anulando === l.id ? " elegida" : ""}`}
                      style={l.anulada ? undefined : colorDe(l.producto)}
                      disabled={!!l.anulada || (s !== "abierta" && !productoDe(sinc.visible, l.producto)?.conNombre)}
                      onClick={() => setAnulando(anulando === l.id ? null : l.id)}
                    >
                      <b>{l.cantidad}</b> {l.comida ? "🍽 " : ""}{l.nombre}{l.editada && !l.anulada ? " ✎" : ""}
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
        {(s === "cobrada" || s === "comida" || s === "anulada") && (
          <button className="secundario" onClick={() => sinc.emitir({ t: "reabrir", cuenta: c.id })}>Reabrir</button>
        )}
      </div>
    </main>
  );
}
