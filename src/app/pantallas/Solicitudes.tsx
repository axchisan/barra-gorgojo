// Pedidos de los clientes por QR (docs/20): el aviso con timbre arriba de cualquier
// pantalla y la lista para aceptarlos (todo o una parte) o decir «No se puede» con motivo.
// Al aceptar, se anota una pedida normal en la cuenta abierta del lugar (o en una nueva).
import { useEffect, useRef, useState } from "react";
import { situacion, total, type Cuenta } from "../../dominio/estado";
import { haceCuanto, pesos } from "../../dominio/formato";
import { solicitudesPendientes, valorSolicitud, type Solicitud } from "../../dominio/solicitudes";
import { ponerAviso } from "../avisos";
import { leerModoSonido, LLAVE_SONIDO, REPETIR, sonar, useMantenerDespierta, type ModoSonido } from "../componentes/Despacho";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";

const MOTIVOS = ["Se acabó", "No hay fría", "Ya cerramos la cocina", "Pídalo en la barra"];

/** Arriba de cualquier pantalla mientras haya pedidos por QR sin atender. */
export function AvisoSolicitudes({ nav }: { nav: Nav }) {
  const pendientes = solicitudesPendientes(sinc.visible.solicitudes);
  const ids = pendientes.map((s) => s.id);
  const vistos = useRef<Set<string> | null>(null);
  const clave = ids.join();
  useEffect(() => {
    const antes = vistos.current;
    vistos.current = new Set(ids);
    if (ids.some((id) => !antes?.has(id))) sonar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  const [modo, setModo] = useState<ModoSonido>(() => leerModoSonido());
  useEffect(() => {
    const cambio = () => setModo(leerModoSonido());
    window.addEventListener(LLAVE_SONIDO, cambio);
    return () => window.removeEventListener(LLAVE_SONIDO, cambio);
  }, []);
  useEffect(() => {
    const cada = REPETIR[modo];
    if (!ids.length || !cada) return;
    const t = setInterval(() => sonar(), cada);
    return () => clearInterval(t);
  }, [ids.length, modo]);
  useMantenerDespierta(ids.length > 0);

  if (!pendientes.length || nav.vista.v === "solicitudes") return null;
  const primera = pendientes[0];
  return (
    <button className="aviso-despacho aviso-qr" role="alert" onClick={() => nav.ir({ v: "solicitudes" })}>
      <strong>📱 {pendientes.length === 1 ? "Pedido por QR" : `${pendientes.length} pedidos por QR`}</strong>
      <span>{primera.lugar.nombre}: {primera.lineas.map((l) => `${l.cantidad} ${l.nombre}`).join(", ")}{pendientes.length > 1 ? " · …" : ""}</span>
    </button>
  );
}

/** La cuenta abierta del lugar del QR, si la hay (la más reciente). */
function cuentaDelLugar(s: Solicitud): Cuenta | undefined {
  return Object.values(sinc.visible.cuentas)
    .filter((c) => situacion(c) === "abierta" && !c.anulada && (s.lugar.tipo === "mesa" ? c.tipo === "mesa" && c.mesa === s.lugar.numero : c.tipo === "cancha" && c.cancha === s.lugar.cancha))
    .sort((a, b) => b.ultima - a.ultima)[0];
}

export function Solicitudes({ nav }: { nav: Nav }) {
  const pendientes = solicitudesPendientes(sinc.visible.solicitudes);
  return (
    <main className="solicitudes">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>📱 Pedidos por QR</strong>
      </header>
      {!pendientes.length && <p className="vacio">No hay pedidos por atender.</p>}
      {pendientes.map((s) => <TarjetaSolicitud key={s.id} s={s} />)}
    </main>
  );
}

function TarjetaSolicitud({ s }: { s: Solicitud }) {
  const [quitadas, setQuitadas] = useState<Set<string>>(new Set());
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const destino = cuentaDelLugar(s);
  const aceptadas = s.lineas.filter((l) => !quitadas.has(l.id));
  const parcial = aceptadas.length < s.lineas.length;
  // Aceptar en parte o rechazar piden el motivo (lo ve el cliente).
  const faltaMotivo = (parcial || rechazando) && !motivo.trim();

  const aceptar = () => {
    if (!aceptadas.length || faltaMotivo) return;
    let cuenta = destino?.id;
    if (!cuenta) {
      cuenta = crypto.randomUUID();
      sinc.emitir({
        t: "abrir", cuenta, nombre: s.cliente ? `${s.lugar.nombre} · ${s.cliente}` : s.lugar.nombre, tipo: s.lugar.tipo,
        ...(s.lugar.tipo === "mesa" ? { mesa: s.lugar.numero } : { cancha: s.lugar.cancha }),
      });
    }
    sinc.emitir({
      t: "anotar", cuenta, ronda: crypto.randomUUID(), area: sinc.panel,
      detalle: ["📱 QR", s.cliente, s.nota].filter(Boolean).join(" · ").slice(0, 80),
      lineas: aceptadas.map((l) => ({ id: crypto.randomUUID(), producto: l.producto, cantidad: l.cantidad, ...(l.nota ? { nota: l.nota } : {}) })),
    });
    sinc.emitir({ t: "aceptar_solicitud", solicitud: s.id, cuenta, ...(parcial ? { aceptadas: aceptadas.map((l) => l.id), motivo: motivo.trim() } : {}) });
    ponerAviso({ texto: `${s.lugar.nombre}: pedido aceptado${destino ? ` en ${destino.nombre}` : ""}` });
  };
  const rechazar = () => {
    if (!motivo.trim()) return;
    sinc.emitir({ t: "rechazar_solicitud", solicitud: s.id, motivo: motivo.trim() });
    ponerAviso({ texto: `${s.lugar.nombre}: le avisamos que no se puede — «${motivo.trim()}»` });
  };

  return (
    <article className="caja solicitud">
      <header>
        <strong>{s.lugar.nombre}{s.cliente ? ` · ${s.cliente}` : ""}</strong>
        <span className="tenue">{haceCuanto(s.en)}</span>
      </header>
      {s.nota && <p className="detalle-pedido">📝 {s.nota}</p>}
      <p className="nota">Toque un producto para quitarlo si no lo hay.</p>
      <div className="chips">
        {s.lineas.map((l) => {
          const on = !quitadas.has(l.id);
          return (
            <button key={l.id} className={on ? "chip activo" : "chip tachado"} aria-pressed={on}
              onClick={() => setQuitadas((q) => { const n = new Set(q); if (on) n.add(l.id); else n.delete(l.id); return n; })}>
              {l.cantidad} {l.nombre}{l.nota ? ` (${l.nota})` : ""} · {pesos(l.precio * l.cantidad)}
            </button>
          );
        })}
      </div>
      <p className="tenue">
        {destino ? `Va a la cuenta abierta «${destino.nombre}» (${pesos(total(destino))}).` : `Se abre la cuenta «${s.lugar.nombre}».`} Total pedido: {pesos(valorSolicitud({ lineas: aceptadas }))}
      </p>
      {(parcial || rechazando) && (
        <>
          <p className="etiqueta">{rechazando ? "¿Por qué no se puede?" : "¿Por qué no hay lo que quitó?"} (lo ve el cliente)</p>
          <div className="chips">
            {MOTIVOS.map((m) => <button key={m} className={motivo === m ? "chip activo" : "chip"} aria-pressed={motivo === m} onClick={() => setMotivo(m)}>{m}</button>)}
          </div>
          <input maxLength={80} placeholder="Otro motivo" aria-label="Motivo" value={MOTIVOS.includes(motivo) ? "" : motivo} onChange={(e) => setMotivo(e.target.value)} />
        </>
      )}
      <div className="fila-botones">
        {rechazando ? (
          <>
            <button className="secundario" onClick={() => { setRechazando(false); setMotivo(""); }}>Volver</button>
            <button className="peligro" disabled={!motivo.trim()} onClick={rechazar}>No se puede · avisar</button>
          </>
        ) : (
          <>
            <button className="secundario" onClick={() => setRechazando(true)}>🚫 No se puede</button>
            <button className="principal" disabled={!aceptadas.length || faltaMotivo} onClick={aceptar}>
              Aceptar{parcial ? ` ${aceptadas.length} de ${s.lineas.length}` : ""}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
