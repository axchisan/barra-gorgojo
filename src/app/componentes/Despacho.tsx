// Bebidas pedidas desde comida que la barra tiene que despachar (docs/14, pieza 4).
// El aviso sale de lo que está en el estado (líneas «por despachar»), no de un mensaje:
// por eso no se pierde si la tablet estaba apagada o la app cerrada; aparece al abrirla y
// se queda hasta que alguien de la barra toque «Despachado».
import { useEffect, useRef, useState } from "react";
import { porDespachar, type Cuenta } from "../../dominio/estado";
import { haceCuanto } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";

/**
 * Cómo suena el aviso en este aparato (se escoge en el menú, «Sonido de los avisos»):
 * insistente (cada 4 s hasta despachar), cada minuto, una vez, o sin sonido.
 */
export type ModoSonido = "insistente" | "minuto" | "una" | "silencio";
export const MODOS_SONIDO: { id: ModoSonido; nombre: string; detalle: string }[] = [
  { id: "insistente", nombre: "Insistente", detalle: "Suena cada 4 segundos hasta que despachen" },
  { id: "minuto", nombre: "Cada minuto", detalle: "Al llegar y luego cada minuto" },
  { id: "una", nombre: "Una vez", detalle: "Solo cuando llega el pedido" },
  { id: "silencio", nombre: "Sin sonido", detalle: "Solo la franja y la vibración" },
];
const LLAVE_SONIDO = "sonido-despacho";
export function leerModoSonido(): ModoSonido {
  try { const v = localStorage.getItem(LLAVE_SONIDO); return MODOS_SONIDO.some((m) => m.id === v) ? (v as ModoSonido) : "insistente"; } catch { return "insistente"; }
}
export function guardarModoSonido(m: ModoSonido) {
  try { localStorage.setItem(LLAVE_SONIDO, m); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(LLAVE_SONIDO));
}
/** Cada cuánto se repite el sonido mientras quede algo por despachar (null: no se repite). */
const REPETIR: Record<ModoSonido, number | null> = { insistente: 4_000, minuto: 60_000, una: null, silencio: null };

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

/**
 * Timbre fuerte: dos tonos que suben, dos veces (como un timbre de cocina), pasado por un
 * compresor para que suene lo más alto posible sin rajarse. Y una vibración larga.
 */
export function sonar(forzar = false) {
  if (!forzar && leerModoSonido() === "silencio") { vibrarAviso(); return; }
  vibrarAviso();
  if (!audio || audio.state !== "running") return;
  const t0 = audio.currentTime;
  const compresor = audio.createDynamicsCompressor();
  compresor.threshold.value = -12;
  compresor.ratio.value = 8;
  compresor.connect(audio.destination);
  const notas = [880, 1175, 1568, 880, 1175, 1568];
  notas.forEach((f, i) => {
    const t = t0 + i * 0.16 + (i >= 3 ? 0.18 : 0);
    for (const [tipo, mult, vol] of [["square", 1, 0.55], ["sawtooth", 2, 0.25]] as const) {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = tipo;
      o.frequency.value = f * mult;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(compresor);
      o.start(t);
      o.stop(t + 0.15);
    }
  });
}
function vibrarAviso() { try { navigator.vibrate?.([400, 150, 400, 150, 400]); } catch { /* sin vibración */ } }

/** Con algo por despachar, que la pantalla no se apague sola (la tablet de la barra). */
function useMantenerDespierta(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    type Candado = { release: () => Promise<void> };
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Candado> } }).wakeLock;
    if (!wl) return;
    let candado: Candado | null = null;
    let vivo = true;
    const pedir = () => { if (document.visibilityState === "visible") wl.request("screen").then((c) => { if (vivo) candado = c; else void c.release(); }).catch(() => {}); };
    pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => { vivo = false; document.removeEventListener("visibilitychange", pedir); void candado?.release().catch(() => {}); };
  }, [activo]);
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
  // Mientras quede algo, se repite según el modo escogido en este aparato.
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
            <div className="fila-botones">
              <CancelarPedido c={c} lineas={lineas} />
              {puede && (
                <button className="principal" onClick={() => {
                  sinc.emitir({ t: "despachar", cuenta: c.id, lineas: lineas.map((l) => l.id) });
                  ponerAviso({ texto: `${c.nombre}: despachado` });
                }}>Despachado</button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

/** Escoger cómo suena el aviso de despacho en este aparato, y probarlo. */
export function HojaSonido({ cerrar }: { cerrar: () => void }) {
  const [modo, setModo] = useState<ModoSonido>(() => leerModoSonido());
  return (
    <div className="hoja" onClick={cerrar}>
      <div className="hoja-cuerpo" onClick={(e) => e.stopPropagation()}>
        <header className="cabeza-hoja">
          <h2>🔔 Sonido de los avisos</h2>
          <button className="cerrar-hoja" aria-label="Cerrar" onClick={cerrar}>✕</button>
        </header>
        <p className="nota">Para las bebidas por despachar. Se guarda en este aparato (la tablet de la barra puede ir en «Insistente» y un celular en «Una vez»).</p>
        <div className="modos-sonido" role="radiogroup" aria-label="Cómo suena el aviso">
          {MODOS_SONIDO.map((m) => (
            <button key={m.id} role="radio" aria-checked={modo === m.id} className={modo === m.id ? "modo-sonido activo" : "modo-sonido"}
              onClick={() => { setModo(m.id); guardarModoSonido(m.id); }}>
              <strong>{m.nombre}</strong><small>{m.detalle}</small>
            </button>
          ))}
        </div>
        <button className="secundario grande" onClick={() => sonar(true)}>▶ Probar sonido</button>
        <p className="nota">Suba el volumen del aparato. El navegador solo deja sonar después de tocar la pantalla una vez al abrir la app.</p>
      </div>
    </div>
  );
}

/**
 * Cancelar un pedido a la barra que aún no se despacha: anula esas bebidas (no se puede
 * deshacer, por eso pide confirmar). Comida puede porque son bebidas que pidió ella.
 */
export function CancelarPedido({ c, lineas }: { c: Cuenta; lineas: { id: string; cantidad: number; nombre: string }[] }) {
  const [seguro, setSeguro] = useState(false);
  if (!seguro) return <button className="secundario" onClick={() => setSeguro(true)}>Cancelar pedido</button>;
  return (
    <>
      <button className="secundario" onClick={() => setSeguro(false)}>No</button>
      <button className="peligro" onClick={() => {
        for (const l of lineas) sinc.emitir({ t: "anular", cuenta: c.id, linea: l.id });
        ponerAviso({ texto: `${c.nombre}: pedido cancelado · ${textoLineas(lineas)}` });
      }}>Sí, cancelar</button>
    </>
  );
}
