// Una cuenta de un día anterior, solo para leer (docs/18 fase 3 b, docs/02 «Días
// anteriores»): cada pedida con su hora y quién la anotó, lo que se cambió, anuló o
// despachó, y cómo se pagó. Nada se toca desde aquí: el día ya pasó.
import { saldo, situacion, total, type Cuenta, type Linea, type Pago } from "../../dominio/estado";
import { fechaCorta, horaDe, nombreRonda, pesos } from "../../dominio/formato";
import { iconoTipo } from "../cuentas";
import { useAtrasCierra } from "../navegacion";
import { sinc } from "../sincronizacion";

const MEDIO: Record<Pago["medio"], string> = { efectivo: "💵 Efectivo", nequi: "📱 Nequi", breve: "📲 Breve", deuda: "📒 Fiado", comida: "🍽 Pasado a comida" };
const SITUACION: Record<ReturnType<typeof situacion>, string> = { abierta: "Quedó sin cobrar", cobrada: "Cobrada", comida: "Pasada a comida", anulada: "Anulada", juntada: "Juntada con otra" };

/** Lo que le pasó a una línea después de anotarla, en palabras. */
function historiaLinea(l: Linea): string[] {
  const h: string[] = [];
  if (l.agregada) h.push(`agregada por ${l.agregada.por} · ${horaDe(l.agregada.en)}`);
  if (l.editada) h.push(`era ${l.editada.antes}, la cambió ${l.editada.por} · ${horaDe(l.editada.en)}`);
  if (l.cambiada) h.push(`cambiada por otro producto · ${l.cambiada.por} · ${horaDe(l.cambiada.en)}`);
  if (l.despachada) h.push(`despachada por ${l.despachada.por} · ${horaDe(l.despachada.en)}`);
  if (l.rechazada) h.push(`no se pudo despachar: «${l.rechazada.motivo}» · ${l.rechazada.por}`);
  else if (l.anulada) h.push(`anulada por ${l.anulada.por} · ${horaDe(l.anulada.en)}`);
  if (l.cambio) h.push(`💱 cambio de plata (${l.cambio.caja === "comida" ? "cocina" : "barra"}) · ${l.cambio.por}`);
  return h;
}

export function CuentaPasada({ c, cerrar }: { c: Cuenta; cerrar: () => void }) {
  useAtrasCierra(true, cerrar);
  const deudas = sinc.visible.deudas ?? {};
  const s = situacion(c);
  const falta = saldo(c);
  const pagos = c.pagos;
  return (
    <div className="hoja cuenta-pasada-hoja" onClick={cerrar}>
      <div className="hoja-cuerpo cuenta-pasada" role="dialog" aria-label={`Cuenta ${c.nombre}`} onClick={(e) => e.stopPropagation()}>
        <header className="cabeza-hoja">
          <h2>{c.nombre}{iconoTipo(c) && !c.nombre.includes(iconoTipo(c)!) ? <small className="tenue"> · {iconoTipo(c)}</small> : null}</h2>
          <button className="cerrar-hoja" aria-label="Cerrar" onClick={cerrar}>✕</button>
        </header>
        <p className="cuenta-pasada-resumen">
          <strong>{pesos(total(c))}</strong>
          <span className={`estado-pasada ${s}`}>{SITUACION[s]}{s === "abierta" && falta > 0 ? ` · faltaban ${pesos(falta)}` : ""}</span>
        </p>
        <p className="tenue">
          Abierta {fechaCorta(c.abiertaEn)} a las {horaDe(c.abiertaEn)} por {c.abiertaPor}
          {c.juntadaA ? ` · se juntó con «${c.juntadaA.nombre}» (${c.juntadaA.por}, ${horaDe(c.juntadaA.en)})` : ""}
        </p>
        {c.anulacion && <p className="alerta">Anulada por {c.anulacion.por} a las {horaDe(c.anulacion.en)}{c.anulacion.motivo ? `: «${c.anulacion.motivo}»` : ""}</p>}

        {c.rondas.map((r) => {
          const lineas = c.lineas.filter((l) => l.ronda === r.id);
          if (!lineas.length) return null;
          return (
            <section key={r.id} className="pasada-ronda">
              <h3>
                {nombreRonda(c, r)} <span className="tenue">· {horaDe(r.en)} · {r.persona}{r.de ? ` · venía de «${r.de.nombre}»` : ""}</span>
              </h3>
              {r.detalle && <p className="tenue">📝 {r.detalle}</p>}
              {lineas.map((l) => {
                const historia = historiaLinea(l);
                return (
                  <div key={l.id} className={`pasada-linea${l.anulada ? " anulada" : ""}`}>
                    <span className="pasada-linea-que">
                      <span className="pasada-linea-texto">{l.cantidad} {l.nombre}{l.comida ? " 🍽" : ""}{l.nota ? <em> · {l.nota}</em> : null}</span>
                      {historia.length > 0 && <small>{historia.join(" · ")}</small>}
                    </span>
                    <span className="pasada-linea-valor">{l.anulada ? "—" : pesos(l.precio * l.cantidad)}</span>
                  </div>
                );
              })}
            </section>
          );
        })}

        <section className="pasada-pagos">
          <h3>Pagos</h3>
          {pagos.length === 0 && <p className="tenue">Sin pagos.</p>}
          {pagos.map((p) => (
            <div key={p.id} className={`pasada-pago${p.deshecho ? " deshecho" : ""}`}>
              <span>
                {MEDIO[p.medio]}{p.parcial ? " (abono)" : ""}
                {p.medio === "deuda" && p.deudor ? ` · ${deudas[p.deudor]?.nombre ?? p.deudor}` : ""}
                {p.pagador ? ` · pagó ${p.pagador}` : ""}
                <small>{horaDe(p.en)} · {p.persona} · caja de {p.area === "comida" ? "cocina" : "barra"}{p.recibido && p.recibido > p.monto ? ` · recibió ${pesos(p.recibido)}, cambio ${pesos(p.recibido - p.monto)}` : ""}{p.deshecho ? " · deshecho" : ""}</small>
              </span>
              <strong>{pesos(p.monto)}</strong>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
