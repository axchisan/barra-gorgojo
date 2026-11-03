import { useEffect, useState } from "react";
import type { Evento } from "../../dominio/auditoria";
import { jornada } from "../../dominio/estado";
import { horaDe } from "../../dominio/formato";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";

interface Rechazo { id: string; persona: string; motivo: string; en: number; t: string }
interface Respuesta { fecha: string; eventos: Evento[]; rechazadas: Rechazo[]; limitado: boolean }

const DIA = 24 * 3600_000;
const moverDia = (f: string, n: number) => new Date(Date.parse(`${f}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/**
 * Auditoría (RF-74, E4): quién anotó, anuló, cobró, reabrió o cambió qué, día por día.
 * Solo el administrador; los datos vienen del servidor (el registro completo).
 */
export function Auditoria({ nav }: { nav: Nav }) {
  const hoy = jornada(Date.now());
  const [fecha, setFecha] = useState(hoy);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState("");
  const [persona, setPersona] = useState<string | null>(null);
  const [soloRevisar, setSoloRevisar] = useState(false);

  useEffect(() => {
    setDatos(null);
    setError("");
    void sinc.admin<Respuesta>(`auditoria?fecha=${fecha}`).then((r) => (r.error ? setError(r.error) : setDatos(r)));
  }, [fecha]);

  if (!sinc.esAdministrador) return <main className="vacio-pantalla"><p>Solo el administrador.</p></main>;

  const personas = [...new Set((datos?.eventos ?? []).map((e) => e.persona))].sort();
  const eventos = (datos?.eventos ?? []).filter((e) => (!persona || e.persona === persona) && (!soloRevisar || e.atencion));
  const porRevisar = (datos?.eventos ?? []).filter((e) => e.atencion).length;

  return (
    <main className="auditoria">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>Auditoría</strong>
      </header>

      <div className="fecha-auditoria">
        <button className="chip" onClick={() => setFecha(moverDia(fecha, -1))} aria-label="Día anterior">◀</button>
        <strong>{fecha === hoy ? "Hoy" : fechaLarga(fecha)}</strong>
        <button className="chip" onClick={() => setFecha(moverDia(fecha, 1))} disabled={fecha >= hoy} aria-label="Día siguiente">▶</button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!datos && !error && <p className="vacio">Cargando…</p>}

      {datos && (
        <>
          <div className="chips">
            <button className={!soloRevisar ? "chip activo" : "chip"} onClick={() => setSoloRevisar(false)}>Todo · {datos.eventos.length}</button>
            <button className={soloRevisar ? "chip activo" : "chip"} onClick={() => setSoloRevisar(true)}>Para revisar · {porRevisar}</button>
          </div>
          {personas.length > 1 && (
            <div className="chips">
              <button className={!persona ? "chip activo" : "chip"} onClick={() => setPersona(null)}>Todas</button>
              {personas.map((p) => (
                <button key={p} className={persona === p ? "chip activo" : "chip"} onClick={() => setPersona(p)}>{p}</button>
              ))}
            </div>
          )}

          {datos.rechazadas.length > 0 && (
            <section className="caja rechazos-auditoria">
              <h2>No se aceptó ({datos.rechazadas.length})</h2>
              {datos.rechazadas.map((r) => (
                <p key={`${r.id}-${r.en}`}><span className="hora">{horaDe(r.en)}</span> <b>{r.persona}</b>: {r.motivo}</p>
              ))}
            </section>
          )}

          {eventos.length === 0 && <p className="vacio">{datos.eventos.length ? "Nada con ese filtro." : "No hubo movimiento ese día."}</p>}
          <ol className="eventos">
            {eventos.map((e) => (
              <li key={e.seq} className={e.atencion ? "evento revisar" : "evento"}>
                <span className="hora">{horaDe(e.en)}</span>
                <span className="quien">{e.persona}</span>
                {e.cuentaNombre && <span className="cuenta-evento">{e.cuentaNombre}</span>}
                <span className="texto-evento">{e.texto}</span>
              </li>
            ))}
          </ol>
          {datos.limitado && <p className="tenue">Se muestran las 3.000 operaciones más recientes del día.</p>}
        </>
      )}
    </main>
  );
}
