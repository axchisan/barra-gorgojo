// Bebidas pedidas desde comida que la barra tiene que despachar (docs/14, pieza 4).
// El aviso sale de lo que está en el estado (líneas «por despachar»), no de un mensaje:
// por eso no se pierde si la tablet estaba apagada o la app cerrada; aparece al abrirla y
// se queda hasta que alguien de la barra toque «Despachado».
import { useEffect, useRef, useState } from "react";
import { porDespachar, type Cuenta, type Linea, type Ronda } from "../../dominio/estado";
import { haceCuanto, horaDe, nombreRonda } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import { useAtrasCierra, type Nav } from "../navegacion";
import { esPropia } from "../propios";
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
export const LLAVE_SONIDO = "sonido-despacho";
export function leerModoSonido(): ModoSonido {
  try { const v = localStorage.getItem(LLAVE_SONIDO); return MODOS_SONIDO.some((m) => m.id === v) ? (v as ModoSonido) : "insistente"; } catch { return "insistente"; }
}
export function guardarModoSonido(m: ModoSonido) {
  try { localStorage.setItem(LLAVE_SONIDO, m); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(LLAVE_SONIDO));
}
/** Cada cuánto se repite el sonido mientras quede algo por despachar (null: no se repite). */
export const REPETIR: Record<ModoSonido, number | null> = { insistente: 4_000, minuto: 60_000, una: null, silencio: null };

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

/** El timbre del aviso, a escoger en cada aparato. */
export type Timbre = "campana" | "dingdong";
export const TIMBRES: { id: Timbre; nombre: string }[] = [
  { id: "campana", nombre: "Campana" },
  { id: "dingdong", nombre: "Ding-dong" },
];
const LLAVE_TIMBRE = "timbre-despacho";
export function leerTimbre(): Timbre {
  try { return localStorage.getItem(LLAVE_TIMBRE) === "dingdong" ? "dingdong" : "campana"; } catch { return "campana"; }
}
export function guardarTimbre(t: Timbre) { try { localStorage.setItem(LLAVE_TIMBRE, t); } catch { /* sin almacenamiento */ } }

/** Notas de cada timbre: frecuencia (Hz) y cuándo empieza (s). */
const NOTAS: Record<Timbre, [number, number][]> = {
  // Tres notas que suben (sol, si, re), claras y separadas: se distingue de cualquier ruido del local.
  campana: [[783.99, 0], [987.77, 0.2], [1174.66, 0.4]],
  // Mi y do, como el timbre de una casa.
  dingdong: [[659.25, 0], [523.25, 0.45]],
};

/**
 * Una nota de campana: un tono puro con dos armónicos suaves que se apagan antes que él
 * (por eso suena «limpio» y con cuerpo, no a pitido de juego viejo).
 */
function nota(ctx: AudioContext, salida: AudioNode, f: number, t: number, dura: number) {
  const parciales: [number, number, number][] = [[1, 0.6, dura], [2, 0.18, dura * 0.55], [3, 0.07, dura * 0.35]];
  for (const [mult, vol, d] of parciales) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f * mult;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008); // golpe suave, sin chasquido
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(salida);
    o.start(t);
    o.stop(t + d + 0.05);
  }
}

/**
 * Suena el timbre escogido: notas de campana con un eco corto que les da cuerpo, pasadas
 * por un compresor para que se oigan fuerte sin rajarse. Y una vibración larga.
 */
export function sonar(forzar = false, timbre: Timbre = leerTimbre()) {
  if (!forzar && leerModoSonido() === "silencio") { vibrarAviso(); return; }
  vibrarAviso();
  // Con un toque de por medio (Probar), se crea o reanuda el audio y suena apenas esté listo.
  if (forzar && !audio) {
    try { const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (Ctx) audio = new Ctx(); } catch { /* sin sonido */ }
  }
  if (!audio) return;
  if (audio.state !== "running") { if (forzar) void audio.resume().then(() => sonar(true, timbre)).catch(() => {}); return; }
  const ctx = audio;
  const t0 = ctx.currentTime + 0.02;
  // Volumen arriba y, al final, un limitador: lo más fuerte posible sin rajarse.
  const volumen = ctx.createGain();
  volumen.gain.value = 2.6;
  const compresor = ctx.createDynamicsCompressor();
  compresor.threshold.value = -4;
  compresor.knee.value = 4;
  compresor.ratio.value = 20;
  compresor.attack.value = 0.001;
  compresor.release.value = 0.25;
  volumen.connect(compresor).connect(ctx.destination);
  // Eco corto: la señal vuelve un poco más baja a los 0,11 s, como en un salón.
  const eco = ctx.createDelay(1);
  eco.delayTime.value = 0.11;
  const realimentar = ctx.createGain();
  realimentar.gain.value = 0.28;
  const mezcla = ctx.createGain();
  mezcla.gain.value = 0.35;
  eco.connect(realimentar).connect(eco);
  eco.connect(mezcla).connect(volumen);
  const entrada = ctx.createGain();
  entrada.connect(volumen);
  entrada.connect(eco);
  const dura = timbre === "campana" ? 1.3 : 1.6;
  for (const [f, cuando] of NOTAS[timbre]) nota(ctx, entrada, f, t0 + cuando, dura);
}
function vibrarAviso() { try { navigator.vibrate?.([400, 150, 400, 150, 400]); } catch { /* sin vibración */ } }

/** Con algo por despachar, que la pantalla no se apague sola (la tablet de la barra). */
export function useMantenerDespierta(activo: boolean) {
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

/**
 * Lo que este aparato tiene que avisar: lo por despachar que NO se anotó aquí. Quien pide
 * bebidas a la barra desde su celular no necesita que le suene su propio pedido aunque
 * también tenga la barra (2026-11-15); en la lista «Despachar» sí lo ve.
 */
function pendientesAjenos(cuentas: Iterable<Cuenta>) {
  return porDespachar(cuentas)
    .map((p) => ({ ...p, lineas: p.lineas.filter((l) => !esPropia(l.id)) }))
    .filter((p) => p.lineas.length > 0);
}

/** Lo que la barra ya despachó o no pudo despachar en las últimas 2 horas (para no confundirse). */
export function despachosRecientes(cuentas: Iterable<Cuenta>, ahora = Date.now()) {
  const r: { cuenta: Cuenta; linea: Linea; en: number }[] = [];
  for (const c of cuentas) {
    if (c.anulada) continue;
    for (const l of c.lineas) {
      const en = l.despachada?.en ?? l.rechazada?.en;
      if (en && ahora - en < 2 * 3600_000) r.push({ cuenta: c, linea: l, en });
    }
  }
  return r.sort((a, b) => b.en - a.en);
}

/** Lo que ve la barra arriba de cualquier pantalla mientras haya bebidas por despachar. */
export function AvisoDespacho({ nav }: { nav: Nav }) {
  const pendientes = sinc.tieneArea("barra") ? pendientesAjenos(Object.values(sinc.visible.cuentas)) : [];
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

const lineaConNota = (l: Linea) => `${l.nombre}${l.nota ? ` · ${l.nota}` : ""}`;

/**
 * La lista «Despachar»: cada pedida a la barra por separado, con quién la pidió, a qué hora,
 * para qué cuenta y las notas. Quien la pidió la puede cancelar; la barra la despacha o dice
 * «No se puede». Abajo, lo despachado o rechazado en las últimas 2 horas.
 */
export function PorDespachar({ nav, cuentas }: { nav: Nav; cuentas: Cuenta[] }) {
  const pendientes = porDespachar(cuentas);
  const puede = sinc.tieneArea("barra");
  const yo = sinc.sesion?.persona;
  const [rechazando, setRechazando] = useState<{ c: Cuenta; lineas: Linea[] } | null>(null);
  const recientes = despachosRecientes(cuentas);
  // Una tarjeta por pedida (no por cuenta): si piden dos veces, se ven las dos con su hora.
  const pedidas: { c: Cuenta; r: Ronda | undefined; lineas: Linea[] }[] = [];
  for (const { cuenta: c, lineas } of pendientes) {
    const porRonda = new Map<string, Linea[]>();
    for (const l of lineas) porRonda.set(l.ronda, [...(porRonda.get(l.ronda) ?? []), l]);
    for (const [ronda, ls] of porRonda) pedidas.push({ c, r: c.rondas.find((x) => x.id === ronda), lineas: ls });
  }
  pedidas.sort((a, b) => (a.r?.en ?? 0) - (b.r?.en ?? 0));
  return (
    <section className="por-despachar">
      {rechazando && <HojaRechazo c={rechazando.c} lineas={rechazando.lineas} cerrar={() => setRechazando(null)} />}
      <p className="nota">Bebidas que pidieron desde comida. Al entregarlas, toque «Despachado».</p>
      {pedidas.length === 0 && <p className="vacio">Nada por despachar.</p>}
      {pedidas.map(({ c, r, lineas }) => {
        // Quien la pidió (en este aparato o con su nombre) la cancela; no se la rechaza a sí mismo.
        const mia = lineas.every((l) => esPropia(l.id)) || (!!yo && r?.persona === yo);
        return (
          <article key={`${c.id}-${r?.id}`} className="caja despacho">
            <header onClick={() => nav.ir({ v: "cuenta", id: c.id })}>
              <strong>{c.nombre}{c.tipo === "mesa" && c.mesa && !/\d/.test(c.nombre) ? ` · Mesa ${c.mesa}` : ""}</strong>
              <span className="tenue">{r ? `${horaDe(r.en)} · ${haceCuanto(r.en)}` : ""}</span>
            </header>
            {r?.detalle && <p className="detalle-pedido">📝 {r.detalle}</p>}
            <ul className="lineas-despacho">{lineas.map((l) => <li key={l.id}><b>{l.cantidad}</b> {lineaConNota(l)}</li>)}</ul>
            <p className="tenue">{r ? `${nombreRonda(c, r)} · la pidió ${r.persona === yo ? "usted" : r.persona}` : ""}</p>
            <div className="fila-botones">
              {mia || !puede ? <CancelarPedido c={c} lineas={lineas} /> : <button className="secundario" onClick={() => setRechazando({ c, lineas })}>🚫 No se puede</button>}
              {puede && (
                <button className="principal" onClick={() => {
                  sinc.emitir({ t: "despachar", cuenta: c.id, lineas: lineas.map((l) => l.id) });
                  ponerAviso({ texto: `${c.nombre}: despachado · ${textoLineas(lineas)}` });
                }}>Despachado</button>
              )}
            </div>
          </article>
        );
      })}
      {recientes.length > 0 && (
        <>
          <h3 className="etiqueta">Últimas 2 horas</h3>
          <ul className="despachos-recientes">
            {recientes.map(({ cuenta: c, linea: l }) => (
              <li key={l.id} className={l.rechazada ? "rechazado" : "despachado"} onClick={() => nav.ir({ v: "cuenta", id: c.id })}>
                <span><b>{l.cantidad}</b> {lineaConNota(l)} · {c.nombre}</span>
                <small>
                  {l.despachada
                    ? `✓ Despachado · ${l.despachada.por} · ${horaDe(l.despachada.en)}`
                    : `🚫 ${l.rechazada!.motivo} · ${l.rechazada!.por} · ${horaDe(l.rechazada!.en)}`}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Escoger cómo suena el aviso de despacho en este aparato, y probarlo. */
export function HojaSonido({ cerrar }: { cerrar: () => void }) {
  const [modo, setModo] = useState<ModoSonido>(() => leerModoSonido());
  const [timbre, setTimbre] = useState<Timbre>(() => leerTimbre());
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
        <p className="etiqueta">Timbre</p>
        <div className="segmentos timbres" role="radiogroup" aria-label="Timbre">
          {TIMBRES.map((t) => (
            <button key={t.id} role="radio" aria-checked={timbre === t.id} className={timbre === t.id ? "activo" : ""}
              onClick={() => { setTimbre(t.id); guardarTimbre(t.id); sonar(true, t.id); }}>{t.nombre}</button>
          ))}
        </div>
        <button className="secundario grande" onClick={() => sonar(true, timbre)}>▶ Probar sonido</button>
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
        // Si la cuenta solo tenía ese pedido, no se queda abierta en $ 0: se anula también.
        const quitadas = new Set(lineas.map((l) => l.id));
        const vacia = !c.anulada && c.lineas.every((l) => l.anulada || quitadas.has(l.id)) && !c.pagos.some((p) => !p.deshecho);
        if (vacia) sinc.emitir({ t: "anular_cuenta", cuenta: c.id, motivo: "Pedido cancelado" });
        ponerAviso({ texto: `${c.nombre}: pedido cancelado · ${textoLineas(lineas)}${vacia ? " (la cuenta quedó vacía y se anuló)" : ""}` });
      }}>Sí, cancelar</button>
    </>
  );
}

/** Motivos rápidos para no poder despachar; «Otro» se escribe. */
const MOTIVOS = ["Se acabó", "No hay fría", "No hay en ese tamaño"];

/**
 * La barra no puede despachar (docs/04 «Rechazar un pedido»): escoge qué productos no hay
 * (de entrada, todos) y por qué. Quedan anulados como rechazados y comida recibe el aviso.
 */
function HojaRechazo({ c, lineas, cerrar }: { c: Cuenta; lineas: Linea[]; cerrar: () => void }) {
  useAtrasCierra(true, cerrar);
  const [cuales, setCuales] = useState<Set<string>>(() => new Set(lineas.map((l) => l.id)));
  const [motivo, setMotivo] = useState("");
  const [otro, setOtro] = useState(false);
  const elegidas = lineas.filter((l) => cuales.has(l.id));
  const listo = elegidas.length > 0 && motivo.trim().length > 0;
  const enviar = () => {
    if (!listo) return;
    sinc.emitir({ t: "rechazar_despacho", cuenta: c.id, lineas: elegidas.map((l) => l.id), motivo: motivo.trim() });
    ponerAviso({ texto: `${c.nombre}: avisado a comida · ${textoLineas(elegidas)} — «${motivo.trim()}»` });
    cerrar();
  };
  return (
    <div className="hoja" onClick={cerrar}>
      <div className="hoja-cuerpo hoja-rechazo" role="dialog" aria-label={`No se puede despachar en ${c.nombre}`} onClick={(e) => e.stopPropagation()}>
        <header className="cabeza-hoja">
          <h2>🚫 No se puede · {c.nombre}</h2>
          <button className="cerrar-hoja" aria-label="Cerrar" onClick={cerrar}>✕</button>
        </header>
        <p className="etiqueta">¿Qué no se puede despachar?</p>
        <div className="chips">
          {lineas.map((l) => {
            const on = cuales.has(l.id);
            return (
              <button key={l.id} className={on ? "chip activo" : "chip"} aria-pressed={on}
                onClick={() => setCuales((s) => { const n = new Set(s); if (on) n.delete(l.id); else n.add(l.id); return n; })}>
                {on ? "✓ " : ""}{l.cantidad} {l.nombre}
              </button>
            );
          })}
        </div>
        <p className="etiqueta">¿Por qué?</p>
        <div className="chips">
          {MOTIVOS.map((m) => (
            <button key={m} className={!otro && motivo === m ? "chip activo" : "chip"} aria-pressed={!otro && motivo === m}
              onClick={() => { setOtro(false); setMotivo(m); }}>{m}</button>
          ))}
          <button className={otro ? "chip activo" : "chip"} aria-pressed={otro} onClick={() => { setOtro(true); setMotivo(""); }}>Otro…</button>
        </div>
        {otro && (
          <input autoFocus maxLength={80} placeholder="Escriba por qué" aria-label="Por qué no se puede" value={motivo}
            enterKeyHint="send" onChange={(e) => setMotivo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />
        )}
        <p className="nota">Se anulan de la cuenta y a comida le llega el aviso con el motivo.</p>
        <button className="peligro grande" disabled={!listo} onClick={enviar}>
          {elegidas.length ? `No se puede · avisar a comida` : "Escoja qué no se puede"}
        </button>
      </div>
    </div>
  );
}

/**
 * Lo que la barra no pudo despachar, para quien tiene comida (docs/04): un aviso rojo que
 * se queda hasta «Entendido». Sale del estado (líneas rechazadas de las últimas 3 horas que
 * este aparato no ha visto), así que no se pierde aunque la app estuviera cerrada.
 */
export function AvisoRechazo() {
  const [vistos, setVistos] = useState<Set<string>>(leerVistos);
  if (!sinc.tieneArea("comida")) return null;
  const ahora = Date.now();
  const yo = sinc.sesion?.persona;
  const nuevos: { c: Cuenta; l: Linea }[] = [];
  for (const c of Object.values(sinc.visible.cuentas)) {
    for (const l of c.lineas) {
      if (l.rechazada && ahora - l.rechazada.en < 3 * 3600_000 && !vistos.has(l.id) && l.rechazada.por !== yo) nuevos.push({ c, l });
    }
  }
  if (!nuevos.length) return null;
  const entendido = () => {
    const n = new Set(vistos);
    for (const { l } of nuevos) n.add(l.id);
    guardarVistos(n);
    setVistos(n);
  };
  return (
    <div className="aviso-rechazo" role="alert">
      <div>
        <strong>🚫 La barra no pudo despachar</strong>
        {nuevos.map(({ c, l }) => <span key={l.id}>{l.cantidad} {l.nombre} · {c.nombre} — «{l.rechazada!.motivo}»</span>)}
      </div>
      <button className="principal" onClick={entendido}>Entendido</button>
    </div>
  );
}

const LLAVE_VISTOS = "rechazos-vistos";
function leerVistos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LLAVE_VISTOS) ?? "[]")); } catch { return new Set(); }
}
function guardarVistos(s: Set<string>) {
  // Solo los últimos: los de hace más de 3 horas ya no salen.
  try { localStorage.setItem(LLAVE_VISTOS, JSON.stringify([...s].slice(-200))); } catch { /* sin almacenamiento */ }
}
