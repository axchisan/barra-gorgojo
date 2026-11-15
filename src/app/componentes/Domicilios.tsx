// Domicilios (2026-11-15): la lista «🛵 Domicilios» de comida, por hora de entrega, con el
// estado y un toque para pasar al siguiente; el recordatorio cuando uno se atrasa; y la
// franja de estados en el detalle de la cuenta.
import { useEffect, useRef, useState } from "react";
import { domiciliosPendientes, ESTADOS_DOMICILIO, estadoDomicilio, nombreEstadoDomicilio, type Cuenta, type EstadoDomicilio } from "../../dominio/estado";
import { haceCuanto, horaDe } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import { horaDeHoy } from "../cuentas";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";
import { sonar } from "./Despacho";

const ICONO: Record<EstadoDomicilio, string> = { recibido: "📥", preparacion: "🍳", camino: "🛵", entregado: "✅" };
const siguiente = (e: EstadoDomicilio): EstadoDomicilio | null => ESTADOS_DOMICILIO[ESTADOS_DOMICILIO.indexOf(e) + 1] ?? null;
/** Atrasado: pasó la hora de entrega sin entregarse. */
export const atrasado = (c: Cuenta, ahora = Date.now()) => !!c.domicilio?.entrega && c.domicilio.entrega < ahora && estadoDomicilio(c) !== "entregado";

function pasar(c: Cuenta, a: EstadoDomicilio) {
  const antes = estadoDomicilio(c);
  sinc.emitir({ t: "domicilio", cuenta: c.id, estado: a });
  ponerAviso({ texto: `${c.nombre}: ${nombreEstadoDomicilio[a]}`, deshacer: () => sinc.emitir({ t: "domicilio", cuenta: c.id, estado: antes }) });
}

/** «🛵 Domicilios» en el inicio de comida: los que faltan por entregar, por hora. */
export function ListaDomicilios({ nav, cuentas }: { nav: Nav; cuentas: Cuenta[] }) {
  const pendientes = domiciliosPendientes(cuentas);
  if (!pendientes.length) return null;
  return (
    <section className="domicilios" aria-label="Domicilios">
      <h2 className="seccion">🛵 Domicilios ({pendientes.length})</h2>
      {pendientes.map((c) => {
        const e = estadoDomicilio(c);
        const sig = siguiente(e);
        const tarde = atrasado(c);
        return (
          <article key={c.id} className={`fila-domicilio-lista${tarde ? " atrasado" : ""}`}>
            <button className="cuerpo" onClick={() => nav.ir({ v: "cuenta", id: c.id })}>
              <strong className="hora">{c.domicilio?.entrega ? `Para las ${horaDe(c.domicilio.entrega)}` : "Sin hora"}{tarde ? ` · ⚠️ atrasado ${haceCuanto(c.domicilio!.entrega!).replace(/^hace /, "")}` : ""}</strong>
              <span className="quien">{c.nombre}{c.direccion ? ` · ${c.direccion}` : ""}</span>
              <span className={`estado-domicilio ${e}`}>{ICONO[e]} {nombreEstadoDomicilio[e]}</span>
            </button>
            {sig && <button className="principal siguiente" onClick={() => pasar(c, sig)}>{ICONO[sig]} {nombreEstadoDomicilio[sig]}</button>}
          </article>
        );
      })}
    </section>
  );
}

/** En el detalle de un domicilio: los estados (un toque) y la hora de entrega. */
export function FranjaDomicilio({ c }: { c: Cuenta }) {
  const e = estadoDomicilio(c);
  const [editando, setEditando] = useState(false);
  const [hora, setHora] = useState("");
  return (
    <section className="franja-domicilio" aria-label="Estado del domicilio">
      <div className="chips">
        {ESTADOS_DOMICILIO.map((x) => (
          <button key={x} className={x === e ? `chip activo estado-domicilio ${x}` : "chip"} aria-pressed={x === e} onClick={() => { if (x !== e) pasar(c, x); }}>
            {ICONO[x]} {nombreEstadoDomicilio[x]}
          </button>
        ))}
      </div>
      {editando ? (
        <form className="fila-franja" onSubmit={(ev) => { ev.preventDefault(); const para = horaDeHoy(hora); sinc.emitir({ t: "domicilio", cuenta: c.id, entrega: para ?? null }); setEditando(false); }}>
          <input type="time" aria-label="Hora de entrega" value={hora} onChange={(ev) => setHora(ev.target.value)} />
          <button className="principal">Guardar</button>
          {c.domicilio?.entrega && <button type="button" className="secundario" onClick={() => { sinc.emitir({ t: "domicilio", cuenta: c.id, entrega: null }); setEditando(false); }}>Sin hora</button>}
        </form>
      ) : (
        <button className="enlace" onClick={() => setEditando(true)}>
          ⏰ {c.domicilio?.entrega ? `Para las ${horaDe(c.domicilio.entrega)}` : "Sin hora de entrega"} · cambiar
        </button>
      )}
    </section>
  );
}

/**
 * Recordatorio (para comida): un domicilio pasó su hora sin entregarse. Aviso rojo arriba de
 * cualquier pantalla y timbre al atrasarse y cada 5 minutos mientras siga atrasado.
 */
export function AvisoDomicilios({ nav }: { nav: Nav }) {
  const [, refrescar] = useState(0);
  useEffect(() => { const t = setInterval(() => refrescar((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  const tarde = sinc.tieneArea("comida") ? domiciliosPendientes(Object.values(sinc.visible.cuentas)).filter((c) => atrasado(c)) : [];
  const clave = tarde.map((c) => c.id).join();
  const vistos = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (tarde.some((c) => !vistos.current.has(c.id))) sonar();
    vistos.current = new Set(tarde.map((c) => c.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  useEffect(() => {
    if (!tarde.length) return;
    const t = setInterval(() => sonar(), 5 * 60_000);
    return () => clearInterval(t);
  }, [tarde.length]);
  if (!tarde.length) return null;
  const c = tarde[0];
  return (
    <button className="aviso-despacho aviso-domicilio" role="alert" onClick={() => nav.ir({ v: "cuenta", id: c.id })}>
      <strong>⏰ {tarde.length === 1 ? "Domicilio atrasado" : `${tarde.length} domicilios atrasados`}</strong>
      <span>{c.nombre} · era para las {horaDe(c.domicilio!.entrega!)} · {nombreEstadoDomicilio[estadoDomicilio(c)]}</span>
    </button>
  );
}
