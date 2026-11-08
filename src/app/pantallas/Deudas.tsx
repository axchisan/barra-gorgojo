// Deudas (docs/15): quién debe y cuánto, lo que se le fió (cuentas o anotado a mano), sus
// pagos, y recibir un pago. Los pagos de deudas van aparte de la caja del día.
import { useState } from "react";
import { comidaDeudor, idDeudor, saldoDeudor, type Deudor } from "../../dominio/deudas";
import { TOPE_VALOR_LIBRE } from "../../dominio/catalogo";
import { fechaCorta, horaDe, pesos } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";
import { cerrarConEnter } from "../teclado";

const deudores = () => Object.values(sinc.visible.deudas ?? {});

export function Deudas({ nav }: { nav: Nav }) {
  const [buscar, setBuscar] = useState("");
  const [anotar, setAnotar] = useState(false);
  const [verPagadas, setVerPagadas] = useState(false);
  const q = buscar.trim().toLowerCase();
  const todos = deudores().filter((d) => !q || d.nombre.toLowerCase().includes(q));
  const conDeuda = todos.filter((d) => saldoDeudor(d) > 0).sort((a, b) => saldoDeudor(b) - saldoDeudor(a));
  const pagadas = todos.filter((d) => saldoDeudor(d) <= 0);
  const total = deudores().reduce((s, d) => s + Math.max(0, saldoDeudor(d)), 0);
  const comida = deudores().reduce((s, d) => s + Math.max(0, comidaDeudor(d)), 0);

  return (
    <main className="deudas">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>📒 Deudas</strong>
      </header>
      <div className="cifras">
        <div className="cifra grande"><span>Le deben al negocio</span><strong>{pesos(total)}</strong></div>
        <div className="cifra en-comida"><span>🍽 De comida</span><strong>{pesos(comida)}</strong></div>
        <div className="cifra"><span>🍺 De barra</span><strong>{pesos(total - comida)}</strong></div>
      </div>
      <input className="buscar" type="search" placeholder="Buscar por nombre" enterKeyHint="search" onKeyDown={cerrarConEnter}
        value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      {conDeuda.length === 0 && <p className="vacio">{q ? "Nadie con ese nombre debe." : "Nadie debe nada."}</p>}
      <div className="tarjetas">
        {conDeuda.map((d) => <TarjetaDeudor key={d.id} d={d} nav={nav} />)}
      </div>
      {pagadas.length > 0 && (
        <section className="cerradas">
          <button className="enlace" onClick={() => setVerPagadas(!verPagadas)}>{verPagadas ? "▾" : "▸"} Ya pagaron ({pagadas.length})</button>
          {verPagadas && <div className="tarjetas">{pagadas.map((d) => <TarjetaDeudor key={d.id} d={d} nav={nav} />)}</div>}
        </section>
      )}
      {anotar && <HojaAnotarDeuda cerrar={() => setAnotar(false)} />}
      {sinc.administraDeudas && (
        <div className="pie-fijo">
          <button className="principal grande" onClick={() => setAnotar(true)}>＋ Anotar deuda</button>
        </div>
      )}
    </main>
  );
}

function TarjetaDeudor({ d, nav }: { d: Deudor; nav: Nav }) {
  const ultima = d.movimientos.filter((m) => !m.anulado).at(-1);
  const comida = comidaDeudor(d);
  return (
    <button className="tarjeta deudor" onClick={() => nav.ir({ v: "deudor", id: d.id })}>
      <span className="nombre">{d.nombre}</span>
      <span className="valor">{pesos(Math.max(0, saldoDeudor(d)))}</span>
      <span className="meta">{ultima ? `${ultima.tipo === "pago" ? "pagó" : "fió"} ${fechaCorta(ultima.en)}` : ""}{comida > 0 ? ` · 🍽 ${pesos(comida)}` : ""}</span>
    </button>
  );
}

/** Una deuda que no salió de una cuenta (las de comida que se llevaban aparte). Con el permiso de administrar deudas. */
function HojaAnotarDeuda({ cerrar, para }: { cerrar: () => void; para?: Deudor }) {
  const [nombre, setNombre] = useState(para?.nombre ?? "");
  const [concepto, setConcepto] = useState("");
  const [valor, setValor] = useState("");
  const [comida, setComida] = useState(true);
  const v = Number(valor);
  const listo = idDeudor(nombre) && v > 0 && v <= TOPE_VALOR_LIBRE;
  const parecidos = !para && nombre.trim() ? deudores().filter((d) => d.nombre.toLowerCase().includes(nombre.trim().toLowerCase())).slice(0, 6) : [];
  return (
    <div className="hoja" onClick={cerrar}>
      <div className="hoja-cuerpo" onClick={(e) => e.stopPropagation()}>
        <header className="cabeza-hoja">
          <h2>{para ? `Anotar deuda de ${para.nombre}` : "Anotar una deuda"}</h2>
          <button className="cerrar-hoja" aria-label="Cerrar" onClick={cerrar}>✕</button>
        </header>
        {!para && (
          <>
            <input placeholder="¿Quién debe?" aria-label="Quién debe" autoCapitalize="words" maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
            {parecidos.length > 0 && (
              <div className="chips">{parecidos.map((d) => <button key={d.id} className={nombre === d.nombre ? "chip activo" : "chip"} onClick={() => setNombre(d.nombre)}>{d.nombre}</button>)}</div>
            )}
          </>
        )}
        <input placeholder="¿Qué es? (ej.: almuerzos de la semana)" aria-label="Qué es la deuda" autoCapitalize="sentences" maxLength={80} value={concepto} onChange={(e) => setConcepto(e.target.value)} />
        <input className="numero" inputMode="numeric" placeholder="Valor" aria-label="Valor de la deuda" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))} />
        <div className="segmentos" role="group" aria-label="Comida o barra">
          <button className={comida ? "activo comida-chip" : ""} aria-pressed={comida} onClick={() => setComida(true)}>🍽 Comida</button>
          <button className={comida ? "" : "activo"} aria-pressed={!comida} onClick={() => setComida(false)}>🍺 Barra</button>
        </div>
        <button className="principal grande" disabled={!listo} onClick={() => {
          sinc.emitir({ t: "deuda_cargo", deudor: nombre.trim(), valor: v, concepto: concepto.trim(), comida });
          ponerAviso({ texto: `Deuda anotada: ${nombre.trim()} · ${pesos(v)}` });
          cerrar();
        }}>Anotar {v > 0 ? pesos(v) : "deuda"}</button>
      </div>
    </div>
  );
}

export function DeudorDetalle({ nav, id }: { nav: Nav; id: string }) {
  const d = sinc.visible.deudas?.[id];
  const [pagar, setPagar] = useState(false);
  const [anotar, setAnotar] = useState(false);
  const [verAnulados, setVerAnulados] = useState(false);
  if (!d) return <main className="vacio-pantalla"><p>Esa persona no tiene deudas.</p><button className="secundario" onClick={nav.volver}>Volver</button></main>;
  const debe = Math.max(0, saldoDeudor(d));
  const movimientos = [...d.movimientos].reverse().filter((m) => verAnulados || !m.anulado);
  return (
    <main className="deudor-detalle">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>{d.nombre}</strong>
      </header>
      <section className="cabeza-total">
        <span className="tipo">Debe</span>
        <span className="total">{pesos(debe)}</span>
        {comidaDeudor(d) > 0 && <span className="meta">🍽 {pesos(comidaDeudor(d))} de comida · 🍺 {pesos(debe - comidaDeudor(d))} de barra</span>}
      </section>
      <section className="movimientos">
        {movimientos.map((m) => (
          <div key={m.id} className={`movimiento ${m.tipo}${m.anulado ? " anulado" : ""}`}>
            <span className="que">
              {m.tipo === "pago" ? `Pagó ${m.medio === "nequi" ? "por Nequi" : m.medio === "breve" ? "por Breve" : "en efectivo"}`
                : m.cuenta ? <>Cuenta «{m.cuenta.nombre}»</> : m.concepto || "Deuda anotada"}
              {m.comida ? " · 🍽" : ""}
            </span>
            <strong className="valor">{m.tipo === "pago" ? "−" : "+"}{pesos(m.valor)}</strong>
            <small className="tenue">{fechaCorta(m.en)} {horaDe(m.en)} · {m.por}{m.anulado ? ` · anulado por ${m.anulado.por}` : ""}</small>
            {sinc.administraDeudas && !m.anulado && !m.cuenta && (
              <button className="chip" onClick={() => sinc.emitir({ t: "deuda_anular", deudor: d.id, movimiento: m.id })}>Anular</button>
            )}
          </div>
        ))}
        {d.movimientos.some((m) => m.anulado) && (
          <button className="enlace" onClick={() => setVerAnulados(!verAnulados)}>{verAnulados ? "▾ Esconder los anulados" : "▸ Ver los anulados"}</button>
        )}
      </section>
      {pagar && <HojaPagoDeuda d={d} cerrar={() => setPagar(false)} />}
      {anotar && <HojaAnotarDeuda para={d} cerrar={() => setAnotar(false)} />}
      <div className="pie-fijo">
        {sinc.administraDeudas && <button className="secundario" onClick={() => setAnotar(true)}>＋ Deuda</button>}
        <button className="principal grande" disabled={debe <= 0} onClick={() => setPagar(true)}>Recibir pago</button>
      </div>
    </main>
  );
}

/** Recibir un pago de una deuda: todo o una parte. Va aparte de la caja del día. */
function HojaPagoDeuda({ d, cerrar }: { d: Deudor; cerrar: () => void }) {
  const debe = Math.max(0, saldoDeudor(d));
  const [valor, setValor] = useState(String(debe));
  const [medio, setMedio] = useState<"efectivo" | "nequi" | "breve">("efectivo");
  const v = Math.min(Number(valor) || 0, debe);
  return (
    <div className="hoja" onClick={cerrar}>
      <div className="hoja-cuerpo" onClick={(e) => e.stopPropagation()}>
        <header className="cabeza-hoja">
          <h2>{d.nombre} paga · debe {pesos(debe)}</h2>
          <button className="cerrar-hoja" aria-label="Cerrar" onClick={cerrar}>✕</button>
        </header>
        <input className="numero" inputMode="numeric" aria-label="Cuánto paga" placeholder="¿Cuánto paga?" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))} />
        <div className="chips">
          <button className={v === debe ? "chip activo" : "chip"} onClick={() => setValor(String(debe))}>Todo</button>
          <button className="chip" onClick={() => setValor(String(Math.ceil(debe / 2 / 100) * 100))}>La mitad</button>
        </div>
        <div className="opciones medios">
          {(["efectivo", "nequi", "breve"] as const).map((m) => (
            <button key={m} className={medio === m ? "chip activo" : "chip"} onClick={() => setMedio(m)}>{m === "efectivo" ? "Efectivo" : m === "nequi" ? "Nequi" : "Breve"}</button>
          ))}
        </div>
        <p className="nota">Va aparte de la caja del día: la venta ya contó el día en que se fió.</p>
        <button className="principal grande" disabled={!(v > 0)} onClick={() => {
          sinc.emitir({ t: "deuda_pago", deudor: d.id, valor: v, medio });
          ponerAviso({ texto: `${d.nombre} pagó ${pesos(v)}${v < debe ? ` · debe ${pesos(debe - v)}` : " · quedó a paz y salvo"}` });
          cerrar();
        }}>Recibir {v > 0 ? pesos(v) : ""}</button>
      </div>
    </div>
  );
}
