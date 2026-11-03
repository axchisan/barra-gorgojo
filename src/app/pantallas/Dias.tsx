import { useEffect, useState } from "react";
import type { CierreJornada } from "../../dominio/estado";
import { horaDe, pesos } from "../../dominio/formato";
import type { ResumenJornada } from "../../dominio/jornada";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";

type Dia = Omit<ResumenJornada, "porProducto"> & { cierres: CierreJornada[] };

const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Días anteriores (RF-52) y su CSV (RF-53). Solo el administrador: los datos vienen del servidor. */
export function Dias({ nav }: { nav: Nav }) {
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void sinc.admin<{ dias: Dia[] }>("jornadas").then((r) => (r.error ? setError(r.error) : setDias(r.dias)));
  }, []);
  if (!sinc.esAdministrador) return <main className="vacio-pantalla"><p>Solo el administrador.</p></main>;
  return (
    <main className="dias">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>Días anteriores</strong>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {!dias && !error && <p className="vacio">Cargando…</p>}
      {dias?.length === 0 && <p className="vacio">Todavía no hay días con ventas.</p>}
      {dias?.map((d) => {
        const cierre = d.cierres[d.cierres.length - 1];
        return (
          <article key={d.fecha} className="caja dia-pasado">
            <header>
              <strong>{fechaLarga(d.fecha)}</strong>
              <strong>{pesos(d.vendido)}</strong>
            </header>
            <p className="tenue">
              {d.cuentas} {d.cuentas === 1 ? "cuenta" : "cuentas"} · efectivo {pesos(d.porMedio.efectivo)} · Nequi {pesos(d.porMedio.nequi)} · Breve {pesos(d.porMedio.breve)}
              {d.porMedio.comida ? ` · a comida ${pesos(d.porMedio.comida)}` : ""}
            </p>
            <p className={cierre ? (cierre.contado === cierre.esperado ? "cierre-hecho" : "cierre-hecho falta") : "tenue"}>
              {cierre
                ? `Cerrado ${horaDe(cierre.en)} por ${cierre.por}: contado ${pesos(cierre.contado)}, ${cierre.contado === cierre.esperado ? "cuadró" : cierre.contado > cierre.esperado ? `sobraban ${pesos(cierre.contado - cierre.esperado)}` : `faltaban ${pesos(cierre.esperado - cierre.contado)}`}`
                : "Sin cerrar"}
            </p>
            <button className="secundario" onClick={async () => { const e = await sinc.descargarAdmin(`jornadas/csv?fecha=${d.fecha}`, `barra-${d.fecha}.csv`); if (e) setError(e); }}>
              Descargar CSV
            </button>
          </article>
        );
      })}
    </main>
  );
}
