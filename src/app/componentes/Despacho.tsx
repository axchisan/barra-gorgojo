// Bebidas pedidas desde comida que la barra tiene que despachar (docs/14, pieza 4).
// El aviso sale de lo que está en el estado (líneas «por despachar»), no de un mensaje:
// por eso no se pierde si la tablet estaba apagada o la app cerrada; aparece al abrirla y
// se queda hasta que alguien de la barra toque «Despachado».
import { useEffect, useRef } from "react";
import { porDespachar, type Cuenta } from "../../dominio/estado";
import { haceCuanto } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";

/** Cada cuánto se recuerda con sonido mientras quede algo por despachar. */
const RECORDAR_CADA = 90_000;

let audio: AudioContext | null = null;
/** El navegador solo deja sonar después de un toque: se prepara con el primero. */
function prepararSonido() {
  if (typeof window === "undefined") return;
  const preparar = () => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!audio && Ctx) audio = new Ctx();
      void audio?.resume();
    } catch { /* sin sonido */ }
  };
  window.addEventListener("pointerdown", preparar, { passive: true });
}
prepararSonido();

/** Tres pitidos y una vibración larga. */
function sonar() {
  try { navigator.vibrate?.([300, 120, 300, 120, 300]); } catch { /* sin vibración */ }
  if (!audio || audio.state !== "running") return;
  const t0 = audio.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = "square";
    o.frequency.value = i === 2 ? 1320 : 990;
    g.gain.setValueAtTime(0.0001, t0 + i * 0.22);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.22 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.18);
    o.connect(g).connect(audio.destination);
    o.start(t0 + i * 0.22);
    o.stop(t0 + i * 0.22 + 0.2);
  }
}

const textoLineas = (ls: { cantidad: number; nombre: string }[]) => ls.map((l) => `${l.cantidad} ${l.nombre}`).join(", ");
/** Los detalles de los pedidos a la barra de esas líneas («para el limón»). */
const detallesDe = (c: Cuenta, ls: { ronda: string }[]) =>
  [...new Set(ls.map((l) => c.rondas.find((r) => r.id === l.ronda)?.detalle).filter((d): d is string => !!d))];

/** Lo que ve la barra arriba de cualquier pantalla mientras haya bebidas por despachar. */
export function AvisoDespacho({ nav }: { nav: Nav }) {
  const pendientes = sinc.tieneArea("barra") ? porDespachar(Object.values(sinc.visible.cuentas)) : [];
  const ids = pendientes.flatMap((p) => p.lineas.map((l) => l.id));
  const vistos = useRef<Set<string> | null>(null);
  const clave = ids.join();

  // Suena cuando llega algo nuevo (y al abrir la app, si ya había algo esperando).
  useEffect(() => {
    const antes = vistos.current;
    vistos.current = new Set(ids);
    if (ids.some((id) => !antes?.has(id))) sonar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  // Mientras quede algo, recuerda cada rato.
  useEffect(() => {
    if (!ids.length) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") sonar(); }, RECORDAR_CADA);
    return () => clearInterval(t);
  }, [ids.length]);

  if (!pendientes.length) return null;
  const enDespacho = nav.vista.v === "inicio" && nav.vista.pestana === "despacho";
  if (enDespacho) return null;
  const primera = pendientes[0];
  return (
    <button className="aviso-despacho" role="alert" onClick={() => nav.ir({ v: "inicio", pestana: "despacho" })}>
      <strong>🔔 {pendientes.length === 1 ? "Bebidas por despachar" : `${pendientes.length} cuentas con bebidas por despachar`}</strong>
      <span>{primera.cuenta.nombre}: {textoLineas(primera.lineas)}{detallesDe(primera.cuenta, primera.lineas).map((d) => ` · ${d}`).join("")}{pendientes.length > 1 ? " · …" : ""}</span>
    </button>
  );
}

/** La lista «Por despachar» de la barra: cada cuenta con lo que pidieron desde comida. */
export function PorDespachar({ nav, cuentas }: { nav: Nav; cuentas: Cuenta[] }) {
  const pendientes = porDespachar(cuentas);
  const puede = sinc.tieneArea("barra");
  return (
    <section className="por-despachar">
      <p className="nota">Bebidas que pidieron desde comida. Al entregarlas, toque «Despachado».</p>
      {pendientes.length === 0 && <p className="vacio">Nada por despachar.</p>}
      {pendientes.map(({ cuenta: c, lineas }) => {
        const rondas = new Map(c.rondas.map((r) => [r.id, r]));
        const primera = Math.min(...lineas.map((l) => rondas.get(l.ronda)?.en ?? Date.now()));
        const quienes = [...new Set(lineas.map((l) => rondas.get(l.ronda)?.persona).filter(Boolean))].join(", ");
        return (
          <article key={c.id} className="caja despacho">
            <header onClick={() => nav.ir({ v: "cuenta", id: c.id })}>
              <strong>{c.nombre}</strong>
              <span className="tenue">{haceCuanto(primera)}</span>
            </header>
            {detallesDe(c, lineas).map((d) => <p key={d} className="detalle-pedido">📝 {d}</p>)}
            <ul>{lineas.map((l) => <li key={l.id}><b>{l.cantidad}</b> {l.nombre}</li>)}</ul>
            {quienes && <p className="tenue">Lo pidió {quienes}</p>}
            {puede && (
              <button className="principal" onClick={() => {
                sinc.emitir({ t: "despachar", cuenta: c.id, lineas: lineas.map((l) => l.id) });
                ponerAviso({ texto: `${c.nombre}: despachado` });
              }}>Despachado</button>
            )}
          </article>
        );
      })}
    </section>
  );
}
