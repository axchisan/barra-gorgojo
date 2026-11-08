import { useState } from "react";
import { abonos, porPagarPorLinea, saldo, totalComida, type Cuenta, type Medio } from "../../dominio/estado";
import { horaDe, nombreRonda, pesos } from "../../dominio/formato";
import { sugerirPago } from "../../dominio/pago";
import { ponerAviso } from "../avisos";
import { Desglose } from "../componentes/Desglose";
import { NoExiste } from "../componentes/NoExiste";
import { VistaCliente } from "../componentes/VistaCliente";
import { useAtrasCierra, type Nav } from "../navegacion";
import { cerrarConEnter } from "../teclado";
import { sinc } from "../sincronizacion";

/** Qué se cobra: todo lo que falta (como siempre), unos productos o un valor (abonos). */
type Modo = "todo" | "productos" | "valor";

/** Una parte para cada uno, redondeada hacia arriba a los cien. */
export const parteDe = (falta: number, entre: number) => Math.ceil(falta / entre / 100) * 100;

export function Cobrar({ nav, id }: { nav: Nav; id: string }) {
  const c = sinc.visible.cuentas[id];
  const [medio, setMedio] = useState<Exclude<Medio, "comida">>("efectivo");
  const [recibido, setRecibido] = useState<number | null>(null);
  const [otro, setOtro] = useState("");
  const [modo, setModo] = useState<Modo>("todo");
  /** Abono por productos: línea → unidades escogidas. */
  const [escogidas, setEscogidas] = useState<Record<string, number>>({});
  const [valorLibre, setValorLibre] = useState("");
  /** Quién del grupo paga (opcional): queda en el pago para saber quién abonó. */
  const [pagador, setPagador] = useState("");
  // Mostrar al cliente (F3): el medio y el billete escogidos siguen aquí al volver.
  const [cliente, setCliente] = useState(false);
  useAtrasCierra(cliente, () => setCliente(false));
  // Dividir entre varios: entre cuántos y cuántos ya pagaron. Se recuerda en los pagos
  // (`entre`), así el siguiente que pague, aquí o en otro celular, ve cuántos faltan.
  // Lo escogido aquí manda; si no, lo que dicen los pagos (también los de otro celular).
  const vivos = c ? c.pagos.filter((p) => !p.deshecho) : [];
  const entreGuardado = [...vivos].reverse().find((p) => p.entre)?.entre ?? null;
  const [entreElegido, setEntre] = useState<number | null>(null);
  const [pagaronElegido, setPagaron] = useState<number | null>(null);
  const entre = entreElegido ?? entreGuardado;
  const pagaron = pagaronElegido ?? (entre ? Math.min(vivos.length, entre - 1) : vivos.length);
  if (!c) return <NoExiste nav={nav} />;
  const falta = saldo(c);
  if (falta <= 0) return <NoExiste nav={nav} />;

  const porPagar = porPagarPorLinea(c);
  const valorEscogido = Object.entries(escogidas).reduce((s, [l, k]) => s + (c.lineas.find((x) => x.id === l)?.precio ?? 0) * k, 0);
  const valor =
    modo === "todo" ? falta :
    modo === "productos" ? Math.min(valorEscogido, falta) :
    Math.min(Number(valorLibre) || 0, falta);
  const esAbono = modo !== "todo" && valor < falta;

  const billetes = valor > 0 ? sugerirPago(valor) : [];
  const cambio = medio === "efectivo" && recibido != null && valor > 0 ? recibido - valor : null;

  if (cliente) return <VistaCliente c={c} recibido={medio === "efectivo" ? recibido : null} cerrar={() => setCliente(false)} />;

  /** Pone entre cuántos y cuántos ya pagaron, y deja listo lo que le toca a cada uno. */
  const dividir = (n: number, p: number) => {
    const total = Math.max(2, Math.min(100, n));
    const ya = Math.max(0, Math.min(p, total - 1));
    setEntre(total);
    setPagaron(ya);
    setValorLibre(String(parteDe(falta, total - ya)));
    setRecibido(null);
    setOtro("");
  };

  const limpiar = () => { setEscogidas({}); setValorLibre(""); setRecibido(null); setOtro(""); setPagador(""); };

  const cobrar = (m: Medio) => {
    if (m !== "comida" && !(valor > 0)) return;
    const pago = crypto.randomUUID();
    const lineas = modo === "productos" ? Object.entries(escogidas).filter(([, k]) => k > 0).map(([linea, cantidad]) => ({ linea, cantidad })) : undefined;
    const monto = m !== "comida" && modo === "valor" ? valor : undefined;
    sinc.emitir({
      t: "cobrar", cuenta: c.id, pago, medio: m,
      recibido: m === "efectivo" ? recibido ?? undefined : undefined,
      ...(m !== "comida" && lineas?.length ? { lineas } : {}),
      ...(monto ? { monto } : {}),
      ...(m !== "comida" && pagador.trim() ? { pagador: pagador.trim() } : {}),
      ...(m !== "comida" && modo === "valor" && entre ? { entre } : {}),
    });
    const cobrado = m === "comida" ? falta : valor;
    const de = m !== "comida" && pagador.trim() ? ` de ${pagador.trim()}` : "";
    const deshacer = () => sinc.emitir({ t: "deshacer_pago", cuenta: c.id, pago });
    if (m !== "comida" && esAbono) {
      // Abono: se queda aquí con lo que falta, para el siguiente que pague.
      limpiar();
      setModo("todo");
      // El siguiente que pague: ya pagó uno más (lo cuentan los pagos).
      setPagaron(null);
      ponerAviso({ texto: `${c.nombre}: abono${de} ${pesos(cobrado)} · falta ${pesos(falta - cobrado)}`, deshacer });
      return;
    }
    nav.aInicio();
    ponerAviso({ texto: m === "comida" ? `${c.nombre}: pasada a comida · ${pesos(cobrado)}` : `${c.nombre}: cobrada · ${pesos(cobrado)}`, deshacer });
  };

  const yaAbonado = abonos(c);
  const abonado = yaAbonado.reduce((s, p) => s + p.monto, 0);

  return (
    <main className={modo === "todo" ? "cobrar" : "cobrar parte"}>
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>Cobrar · {c.nombre}</strong>
        {/* Arriba: en el celular dice «Ver cliente», para dejar la fila de abajo a «qué se cobra». */}
        <button className="mostrar-cliente arriba" aria-label="Mostrar al cliente" onClick={() => setCliente(true)}>
          <span className="largo">Mostrar al cliente</span><span className="corto">Ver cliente</span>
        </button>
      </header>
      <p className="total">{pesos(falta)}</p>
      {abonado > 0 && (
        <p className="abonado">
          Ya abonaron {pesos(abonado)}{yaAbonado.some((p) => p.pagador) ? ` (${yaAbonado.map((p) => `${p.pagador ?? "sin nombre"} ${pesos(p.monto)}`).join(", ")})` : ""} · falta {pesos(falta)}
        </p>
      )}
      {totalComida(c) > 0 && <Desglose c={c} />}

      <div className="segmentos modo-cobro" role="group" aria-label="Qué se cobra">
        {([["todo", "Todo"], ["productos", "Productos"], ["valor", "Valor"]] as const).map(([m, texto]) => (
          <button key={m} className={modo === m ? "activo" : ""} aria-pressed={modo === m} onClick={() => {
            setModo(m); setRecibido(null); setOtro("");
            // Si la cuenta ya se está dividiendo, «Valor» trae de una lo que le toca al siguiente.
            if (m === "valor" && entre) setValorLibre(String(parteDe(falta, entre - pagaron)));
          }}>{texto}</button>
        ))}
      </div>

      {modo === "productos" && <EscogerProductos c={c} porPagar={porPagar} escogidas={escogidas} setEscogidas={setEscogidas} />}
      {modo === "valor" && (
        <section className="abono-valor">
          <input inputMode="numeric" enterKeyHint="done" onKeyDown={cerrarConEnter} placeholder="Valor del abono" aria-label="Valor del abono"
            value={valorLibre} onChange={(e) => { setValorLibre(e.target.value.replace(/\D/g, "")); setRecibido(null); setOtro(""); }} />
          {entre == null ? (
            <button className="chip dividir-boton" onClick={() => dividir(Math.max(2, vivos.length + 1), vivos.length)}>👥 Dividir entre varios</button>
          ) : (
            <div className="dividir-cuenta">
              <div className="paso" role="group" aria-label="Entre cuántas personas">
                <span>Personas</span>
                <button aria-label="Una persona menos" onClick={() => dividir(entre - 1, pagaron)} disabled={entre <= Math.max(2, pagaron + 1)}>−</button>
                <b>{entre}</b>
                <button aria-label="Una persona más" onClick={() => dividir(entre + 1, pagaron)}>＋</button>
              </div>
              <div className="paso" role="group" aria-label="Cuántos ya pagaron">
                <span>Ya pagaron</span>
                <button aria-label="Uno menos ya pagó" onClick={() => dividir(entre, pagaron - 1)} disabled={pagaron <= 0}>−</button>
                <b>{pagaron}</b>
                <button aria-label="Uno más ya pagó" onClick={() => dividir(entre, pagaron + 1)} disabled={pagaron >= entre - 1}>＋</button>
              </div>
              <p className="cada-uno">
                {entre - pagaron === 1 ? "Falta 1: paga todo lo que queda" : `Faltan ${entre - pagaron} · cada uno`} <strong>{pesos(parteDe(falta, entre - pagaron))}</strong>
              </p>
            </div>
          )}
        </section>
      )}

      {(modo !== "todo" || yaAbonado.length > 0) && (
        <div className="quien-paga">
          <input placeholder="¿Quién paga? (opcional)" aria-label="Quién paga" value={pagador} maxLength={40}
            enterKeyHint="done" onKeyDown={cerrarConEnter} onChange={(e) => setPagador(e.target.value)} />
          {/* Los que ya abonaron en esta cuenta, para no volver a escribirlos. */}
          {[...new Set(yaAbonado.map((p) => p.pagador).filter((x): x is string => !!x))].map((n) => (
            <button key={n} className={pagador === n ? "chip activo" : "chip"} onClick={() => setPagador(n)}>{n}</button>
          ))}
        </div>
      )}
      <div className="opciones medios">
        {(["efectivo", "nequi", "breve"] as const).map((m) => (
          <button key={m} className={medio === m ? "chip activo" : "chip"} onClick={() => setMedio(m)}>
            {m === "efectivo" ? "Efectivo" : m === "nequi" ? "Nequi" : "Breve"}
          </button>
        ))}
      </div>
      {medio === "efectivo" && valor > 0 && (
        <section className="recibido">
          <p>¿Con cuánto paga?</p>
          <div className="opciones">
            <button className={recibido === valor ? "chip activo" : "chip"} onClick={() => { setRecibido(valor); setOtro(""); }}>Exacto</button>
            {billetes.map((b) => (
              <button key={b} className={recibido === b ? "chip activo" : "chip"} onClick={() => { setRecibido(b); setOtro(""); }}>{pesos(b)}</button>
            ))}
          </div>
          <input inputMode="numeric" enterKeyHint="done" onKeyDown={cerrarConEnter} placeholder="Otro valor" value={otro} onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            setOtro(v);
            setRecibido(v ? Number(v) : null);
          }} />
        </section>
      )}
      {/* Fuera de la sección: girado, va en la columna izquierda, bajo los medios de pago. */}
      {cambio != null && (
        <p className={cambio < 0 ? "cambio falta" : "cambio"}>
          {cambio < 0 ? `Faltan ${pesos(-cambio)}` : `Cambio: ${pesos(cambio)}`}
        </p>
      )}
      <div className="pie-fijo">
        {modo !== "todo" ? (
          <button className="principal grande" onClick={() => cobrar(medio)} disabled={!(valor > 0) || (cambio != null && cambio < 0)}>
            {esAbono ? `Abonar ${pesos(valor)}` : `Cobrar ${pesos(valor)}`}
          </button>
        ) : (
          // «Pasar a comida» se quitó (2026-11-08): la cocina anota y cobra la misma cuenta.
          // Lo pasado antes sigue valiendo (regla 4); el dominio aún lo acepta.
          <button className="principal grande" onClick={() => cobrar(medio)} disabled={cambio != null && cambio < 0}>Cobrar {pesos(falta)}</button>
        )}
      </div>
    </main>
  );
}

/** Abono por productos: cada pedida con sus productos por pagar; se toca la pedida o el producto. */
function EscogerProductos({ c, porPagar, escogidas, setEscogidas }: {
  c: Cuenta; porPagar: Map<string, number>; escogidas: Record<string, number>; setEscogidas: (e: Record<string, number>) => void;
}) {
  const rondas = c.rondas
    .map((r) => ({ r, lineas: c.lineas.filter((l) => l.ronda === r.id && porPagar.has(l.id)) }))
    .filter((x) => x.lineas.length);
  if (!rondas.length) return <p className="vacio">Todo lo anotado ya está pagado: queda un saldo sin productos (cobre por valor).</p>;
  const poner = (linea: string, k: number) => setEscogidas({ ...escogidas, [linea]: Math.max(0, Math.min(k, porPagar.get(linea) ?? 0)) });
  return (
    <section className="abono-productos">
      {rondas.map(({ r, lineas }) => {
        const todas = lineas.every((l) => (escogidas[l.id] ?? 0) === porPagar.get(l.id));
        return (
          <div key={r.id} className="abono-ronda">
            <button className={todas ? "abono-ronda-cabeza activa" : "abono-ronda-cabeza"} aria-pressed={todas}
              onClick={() => { const e = { ...escogidas }; for (const l of lineas) e[l.id] = todas ? 0 : porPagar.get(l.id)!; setEscogidas(e); }}>
              <span>{todas ? "☑" : "☐"} {nombreRonda(c, r)}</span>
              <small>{horaDe(r.en)} · {r.persona}</small>
            </button>
            {lineas.map((l) => {
              const max = porPagar.get(l.id)!;
              const k = escogidas[l.id] ?? 0;
              return (
                <div key={l.id} className={k > 0 ? "abono-linea escogida" : "abono-linea"}>
                  <button className="abono-linea-nombre" onClick={() => poner(l.id, k > 0 ? 0 : max)}>
                    <span>{l.nombre}</span>
                    <small>{max}{max < l.cantidad ? ` de ${l.cantidad}` : ""} × {pesos(l.precio)}</small>
                  </button>
                  <div className="cantidad">
                    <button aria-label={`Una ${l.nombre} menos`} onClick={() => poner(l.id, k - 1)} disabled={k <= 0}>−</button>
                    <strong>{k}</strong>
                    <button aria-label={`Una ${l.nombre} más`} onClick={() => poner(l.id, k + 1)} disabled={k >= max}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
