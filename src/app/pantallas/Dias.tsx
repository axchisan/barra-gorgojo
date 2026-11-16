// Días anteriores (RF-52, docs/18 fase 3 b): la lista de días con su resumen, y cada día
// abierto como «El día», con sus cuentas y pedidas, solo para leer. El CSV sigue (RF-53).
// Para el administrador y para quien ve el día y el historial (docs/17). Los datos vienen
// del servidor: sin señal no se ven.
import { useEffect, useState } from "react";
import type { CierreJornada, Cuenta } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";
import type { ResumenJornada } from "../../dominio/jornada";
import { CuentaPasada } from "../componentes/CuentaPasada";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";
import { ElDia } from "./ElDia";

type Dia = Omit<ResumenJornada, "porProducto"> & { cierres: CierreJornada[] };

export const fechaLarga = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const puedeVer = () => sinc.esAdministrador || (sinc.veDia && sinc.veHistorial);

/** El cierre de un día en una línea: «Barra: contado $ X, cuadró · Cocina: …». */
function textoCierres(cierres: CierreJornada[]): string {
  if (!cierres.length) return "Sin cerrar";
  const ultimos = new Map<string, CierreJornada>();
  for (const c of cierres) ultimos.set(c.area ?? "todo", c);
  return [...ultimos.entries()].map(([area, c]) => {
    const como = c.contado === c.esperado ? "cuadró" : c.contado > c.esperado ? `sobraban ${pesos(c.contado - c.esperado)}` : `faltaban ${pesos(c.esperado - c.contado)}`;
    return `${area === "comida" ? "Cocina" : area === "barra" ? "Barra" : "Caja"}: contado ${pesos(c.contado)}, ${como}`;
  }).join(" · ");
}

export function Dias({ nav }: { nav: Nav }) {
  const [dias, setDias] = useState<Dia[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void sinc.consultar<{ dias: Dia[] }>("dias").then((r) => (r.error ? setError(r.error) : setDias(r.dias)));
  }, []);
  if (!puedeVer()) return <main className="vacio-pantalla"><p>Ver los días anteriores necesita los permisos «Ve el día» e «Historial».</p><button className="secundario" onClick={nav.volver}>Volver</button></main>;
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
        const sinCerrar = !d.cierres.length;
        const descuadre = d.cierres.some((c) => c.contado !== c.esperado);
        return (
          <button key={d.fecha} className="caja dia-pasado" onClick={() => nav.ir({ v: "dia", fecha: d.fecha })} aria-label={`${fechaLarga(d.fecha)}: ${pesos(d.vendido)}`}>
            <span className="dia-pasado-cabeza">
              <strong className="dia-pasado-fecha">{fechaLarga(d.fecha)}</strong>
              <strong>{pesos(d.vendido)}</strong>
            </span>
            <span className="tenue">
              {d.cuentas} {d.cuentas === 1 ? "cuenta" : "cuentas"}
              {d.vendidoComida ? ` · 🍺 ${pesos(d.vendido - d.vendidoComida)} · 🍽 ${pesos(d.vendidoComida)}` : ""}
            </span>
            <span className="tenue">
              {[["💵", d.porMedio.efectivo], ["📱", d.porMedio.nequi], ["📲", d.porMedio.breve], ["📒", d.porMedio.deuda]].filter(([, v]) => (v as number) > 0).map(([i, v]) => `${i} ${pesos(v as number)}`).join(" · ") || "Sin cobros"}
            </span>
            <span className={sinCerrar ? "tenue" : descuadre ? "cierre-hecho falta" : "cierre-hecho"}>{textoCierres(d.cierres)}</span>
            <span className="dia-pasado-ver" aria-hidden>Ver el día ›</span>
          </button>
        );
      })}
    </main>
  );
}

/** Un día anterior, como «El día»: lo vendido, cómo pagaron, entre cajas, el cuadre, las cuentas y por producto. */
export function DiaPasado({ nav, fecha }: { nav: Nav; fecha: string }) {
  const [datos, setDatos] = useState<{ cuentas: Cuenta[]; cierres: CierreJornada[] } | null>(null);
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState<Cuenta | null>(null);
  useEffect(() => {
    let vivo = true;
    void sinc.consultar<{ cuentas: Cuenta[]; cierres: CierreJornada[] }>(`dia?fecha=${fecha}`).then((r) => {
      if (!vivo) return;
      if (r.error) setError(r.error);
      else setDatos({ cuentas: r.cuentas, cierres: r.cierres });
    });
    return () => { vivo = false; };
  }, [fecha]);
  if (!puedeVer()) return <main className="vacio-pantalla"><p>Ver los días anteriores necesita los permisos «Ve el día» e «Historial».</p><button className="secundario" onClick={nav.volver}>Volver</button></main>;
  const descargar = async () => { const e = await sinc.descargar(`dia/csv?fecha=${fecha}`, `barra-${fecha}.csv`); if (e) setError(e); };
  return (
    <main className="dia-pasado-pantalla">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>{fechaLarga(fecha)}</strong>
        <button className="chip" onClick={descargar} aria-label="Descargar el CSV de este día">CSV</button>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {!datos && !error && <p className="vacio">Cargando…</p>}
      {datos && <ElDia nav={nav} cuentas={datos.cuentas} fecha={fecha} cierres={datos.cierres} verCuenta={setAbierta} />}
      {abierta && <CuentaPasada c={abierta} cerrar={() => setAbierta(null)} />}
    </main>
  );
}
