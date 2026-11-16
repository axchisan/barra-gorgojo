// Informe de una semana o un mes (2026-11-16, docs/02 «Informes», docs/18 fase 3 b): lo
// vendido y cómo va frente al periodo anterior, día por día (cada día se abre), promedios,
// cómo pagaron, lo más vendido, la caja y el fiado. Solo para leer; el CSV, por secciones.
// Los datos vienen del servidor (como los días anteriores): sin señal no se ven.
import { useEffect, useState } from "react";
import { jornada } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";
import {
  comparacion, DIAS_SEMANA, diaSemana, informe, nombrePeriodo, otroPeriodo, rango, relativo, sumarDias,
  type DiaInforme, type TipoPeriodo,
} from "../../dominio/informe";
import type { Medios, Parte } from "../../dominio/jornada";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";

const MEDIOS: { id: Medios; nombre: string; icono: string }[] = [
  { id: "efectivo", nombre: "Efectivo", icono: "💵" },
  { id: "nequi", nombre: "Nequi", icono: "📱" },
  { id: "breve", nombre: "Breve", icono: "📲" },
  { id: "deuda", nombre: "Fiado", icono: "📒" },
  { id: "comida", nombre: "Pasado a comida", icono: "🍽" },
];
const suma = (p: Parte) => p.barra + p.comida;
const corto = (f: string) => `${diaSemana(f).slice(0, 3)} ${Number(f.slice(8))}`;
const largo = (f: string) => `${diaSemana(f)} ${Number(f.slice(8))}`;

const puedeVer = () => sinc.esAdministrador || (sinc.veDia && sinc.veHistorial);

export function Informe({ nav, tipo, clave }: { nav: Nav; tipo: TipoPeriodo; clave: string }) {
  const [dias, setDias] = useState<DiaInforme[] | null>(null);
  const [error, setError] = useState("");
  const [area, setArea] = useState<"barra" | "comida">("barra");
  const [todos, setTodos] = useState(false);
  useEffect(() => {
    let vivo = true;
    void sinc.consultar<{ dias: DiaInforme[] }>(`informe?tipo=${tipo}&clave=${clave}`).then((r) => {
      if (!vivo) return;
      if (r.error) setError(r.error);
      else setDias(r.dias);
    });
    return () => { vivo = false; };
  }, [tipo, clave]);

  if (!puedeVer()) return <main className="vacio-pantalla"><p>Ver los informes necesita los permisos «Ve el día» e «Historial».</p><button className="secundario" onClick={nav.volver}>Volver</button></main>;

  const hoy = jornada(Date.now());
  const anterior = otroPeriodo(tipo, clave);
  const siguiente = otroPeriodo(tipo, clave, 1);
  const haySiguiente = rango(tipo, siguiente).desde <= hoy;
  const ir = (k: string) => nav.ir({ v: "informe", tipo, clave: k }, true);
  const descargar = async () => { const e = await sinc.descargar(`informe/csv?tipo=${tipo}&clave=${clave}`, `barra-${tipo}-${clave}.csv`); if (e) setError(e); };
  const palabra = tipo === "semana" ? "semana" : "mes";

  return (
    <main className="informe">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>{nombrePeriodo(tipo, clave)}</strong>
        <button className="chip" onClick={descargar} aria-label={`Descargar el CSV de este ${palabra}`}>CSV</button>
      </header>
      <nav className="informe-pasos" aria-label="Cambiar de periodo">
        <button className="chip" onClick={() => ir(anterior)} aria-label={`${tipo === "semana" ? "Semana" : "Mes"} anterior`}>‹ Anterior</button>
        <span>{relativo(tipo, clave, hoy) ?? ""}</span>
        <button className="chip" onClick={() => ir(siguiente)} disabled={!haySiguiente} aria-label={`${tipo === "semana" ? "Semana" : "Mes"} siguiente`}>Siguiente ›</button>
      </nav>
      {error && <p className="error" role="alert">{error}</p>}
      {!dias && !error && <p className="vacio">Cargando…</p>}
      {dias && <Cuerpo nav={nav} tipo={tipo} clave={clave} todosLosDias={dias} hoy={hoy} area={area} setArea={setArea} todos={todos} setTodos={setTodos} />}
    </main>
  );
}

function Cuerpo({ nav, tipo, clave, todosLosDias, hoy, area, setArea, todos, setTodos }: {
  nav: Nav; tipo: TipoPeriodo; clave: string; todosLosDias: DiaInforme[]; hoy: string;
  area: "barra" | "comida"; setArea: (a: "barra" | "comida") => void; todos: boolean; setTodos: (t: boolean) => void;
}) {
  const inf = informe(tipo, clave, todosLosDias, hoy);
  const comp = comparacion(inf, todosLosDias, hoy);
  const palabra = tipo === "semana" ? "la semana pasada" : "el mes pasado";
  if (!inf.dias.length) return <p className="vacio">Sin ventas {tipo === "semana" ? "esta semana" : "este mes"}{inf.enCurso ? " todavía" : ""}.</p>;

  // Día por día: la semana entera (los días sin ventas también, para ver cuándo no se abrió);
  // el mes, solo los días con ventas.
  const filas: { fecha: string; d?: DiaInforme }[] = tipo === "semana"
    ? Array.from({ length: 7 }, (_, i) => sumarDias(inf.desde, i)).filter((f) => f <= hoy).map((f) => ({ fecha: f, d: inf.dias.find((x) => x.fecha === f) }))
    : inf.dias.map((d) => ({ fecha: d.fecha, d }));
  const tope = Math.max(1, ...inf.dias.map((d) => d.vendido));
  const conVentas = inf.dias.filter((d) => d.vendido > 0).length;

  // En el mes: cuánto se vende en promedio cada día de la semana (lunes primero).
  const porDiaSemana = tipo === "mes"
    ? [1, 2, 3, 4, 5, 6, 0].map((n) => {
        const ds = inf.dias.filter((d) => d.vendido > 0 && new Date(`${d.fecha}T12:00:00Z`).getUTCDay() === n);
        return { n, dias: ds.length, promedio: ds.length ? Math.round(ds.reduce((t, d) => t + d.vendido, 0) / ds.length) : 0 };
      })
    : [];
  const topeSemana = Math.max(1, ...porDiaSemana.map((x) => x.promedio));

  const productos = inf.productos.filter((x) => (area === "comida") === !!x.comida);
  const hayComida = inf.productos.some((x) => x.comida);
  const visibles = todos ? productos : productos.slice(0, 8);
  const topeProducto = Math.max(1, ...productos.map((x) => x.valor));
  const filasMedio = MEDIOS.filter((m) => m.id === "efectivo" || suma(inf.porMedio[m.id]) > 0);
  const cobrado = filasMedio.reduce((t, m) => ({ barra: t.barra + inf.porMedio[m.id].barra, comida: t.comida + inf.porMedio[m.id].comida }), { barra: 0, comida: 0 });
  const { caja } = inf;

  return (
    <div className="informe-cuerpo">
      {/* 1. Lo vendido y cómo va frente al periodo anterior. */}
      <article className="dia-hero">
        <span className="dia-hero-titulo">Vendido {relativo(tipo, clave, hoy) ?? (tipo === "semana" ? "esa semana" : "ese mes")}</span>
        <strong className="dia-hero-total">{pesos(inf.vendido)}</strong>
        {comp.cambio !== null ? (
          <span className={`informe-comparacion ${comp.cambio >= 0 ? "sube" : "baja"}`}>
            {comp.cambio === 0 ? `＝ Casi igual que ${comp.parcial ? `los mismos días de ${palabra}` : palabra}` : `${comp.cambio > 0 ? "▲" : "▼"} ${Math.abs(comp.cambio)} % ${comp.cambio > 0 ? "más" : "menos"} que ${comp.parcial ? `los mismos días de ${palabra}` : palabra}`} ({pesos(comp.anterior)})
          </span>
        ) : <span className="dia-hero-sub">Sin ventas {palabra} para comparar</span>}
        <span className="dia-hero-sub">{conVentas} {conVentas === 1 ? "día" : "días"} con ventas · {inf.cuentas} cuentas{inf.cambios > 0 ? ` · 💱 sin contar ${pesos(inf.cambios)} de cambios` : ""}</span>
        <div className="dia-hero-areas">
          <div><span>🍺 Barra</span><strong>{pesos(inf.vendido - inf.vendidoComida)}</strong></div>
          <div className="de-comida"><span>🍽 Comida</span><strong>{pesos(inf.vendidoComida)}</strong></div>
        </div>
      </article>

      <div className="dia-columnas">
        <div className="dia-col">
          {/* 2. Día por día: cada barra se toca y abre ese día. */}
          <article className="caja informe-dias">
            <h2>Día por día</h2>
            {filas.map(({ fecha, d }) => (
              <button key={fecha} className={`informe-dia${!d || !d.vendido ? " sin" : ""}${inf.masFuerte?.fecha === fecha ? " fuerte" : ""}`}
                disabled={!d} onClick={() => nav.ir({ v: "dia", fecha })} aria-label={`${largo(fecha)}: ${d ? pesos(d.vendido) : "sin ventas"}`}>
                <span className="informe-dia-fecha">{corto(fecha)}</span>
                <span className="informe-dia-barra" aria-hidden>
                  {d && d.vendido > 0 && (
                    <span style={{ width: `${(d.vendido / tope) * 100}%` }}>
                      <i style={{ width: `${(d.vendidoComida / d.vendido) * 100}%` }} />
                    </span>
                  )}
                </span>
                <span className="informe-dia-valor">{d && d.vendido > 0 ? pesos(d.vendido) : fecha === hoy ? "hoy" : "—"}</span>
              </button>
            ))}
            <p className="tenue informe-leyenda"><i className="punto punto-barra" /> Barra <i className="punto punto-comida" /> Comida · toque un día para verlo</p>
          </article>

          {/* 3. Promedios. */}
          <article className="informe-cifras">
            <div><span>Promedio por día</span><strong>{pesos(inf.promedioDia)}</strong></div>
            <div><span>Cuentas por día</span><strong>{inf.promedioCuentas}</strong></div>
            {inf.masFuerte && <div><span>El día más fuerte</span><strong>{largo(inf.masFuerte.fecha)}</strong><small>{pesos(inf.masFuerte.vendido)}</small></div>}
          </article>

          {tipo === "mes" && porDiaSemana.some((x) => x.dias > 1) && (
            <article className="caja informe-semana">
              <h2>¿Qué día se vende más?</h2>
              <p className="tenue">Lo vendido en promedio cada día de la semana.</p>
              {porDiaSemana.map((x) => (
                <div key={x.n} className={`informe-dia${x.dias ? "" : " sin"}`}>
                  <span className="informe-dia-fecha">{DIAS_SEMANA[x.n].slice(0, 3)}</span>
                  <span className="informe-dia-barra" aria-hidden>{x.promedio > 0 && <span style={{ width: `${(x.promedio / topeSemana) * 100}%` }} />}</span>
                  <span className="informe-dia-valor">{x.dias ? pesos(x.promedio) : "—"}</span>
                </div>
              ))}
            </article>
          )}

          {/* 4. La caja: cuadres y días sin cerrar. */}
          <article className="caja informe-caja">
            <h2>Caja</h2>
            {caja.cuadraron > 0 && <p className="cierre-hecho">✓ Cuadró {caja.cuadraron} {caja.cuadraron === 1 ? "día" : "días"}</p>}
            {caja.sobro.dias > 0 && <p className="informe-sobro">Sobró en {caja.sobro.dias} {caja.sobro.dias === 1 ? "día" : "días"}: {pesos(caja.sobro.valor)}</p>}
            {caja.falto.dias > 0 && <p className="cierre-hecho falta">Faltó en {caja.falto.dias} {caja.falto.dias === 1 ? "día" : "días"}: {pesos(caja.falto.valor)}</p>}
            {caja.sinCerrar.length > 0 && (
              <p className="tenue">
                Sin cerrar:{" "}
                {caja.sinCerrar.map((f, i) => (
                  <span key={f}>{i > 0 && ", "}<button className="enlace" onClick={() => nav.ir({ v: "dia", fecha: f })}>{largo(f)}</button></span>
                ))}
              </p>
            )}
            {!caja.cuadraron && !caja.sobro.dias && !caja.falto.dias && !caja.sinCerrar.length && <p className="tenue">Todavía no se ha cerrado la caja.</p>}
          </article>
        </div>

        <div className="dia-col">
          {/* 5. Cómo pagaron, como en «El día». */}
          <article className="caja informe-medios">
            <h2>¿Cómo pagaron?</h2>
            {filasMedio.map((m) => (
              <div key={m.id} className={`informe-medio fila-${m.id}`}>
                <span>{m.icono} {m.nombre}</span>
                <strong>{pesos(suma(inf.porMedio[m.id]))}</strong>
                <small>🍺 {pesos(inf.porMedio[m.id].barra)} · <span className="de-comida">🍽 {pesos(inf.porMedio[m.id].comida)}</span></small>
              </div>
            ))}
            <div className="informe-medio cobrado">
              <span>Cobrado</span>
              <strong>{pesos(suma(cobrado))}</strong>
              <small>🍺 {pesos(cobrado.barra)} · <span className="de-comida">🍽 {pesos(cobrado.comida)}</span></small>
            </div>
            {suma(inf.porCobrar) > 0 && (
              <div className="informe-medio por-cobrar">
                <span>Quedó por cobrar</span>
                <strong>{pesos(suma(inf.porCobrar))}</strong>
                <small>🍺 {pesos(inf.porCobrar.barra)} · 🍽 {pesos(inf.porCobrar.comida)}</small>
              </div>
            )}
          </article>

          {/* 6. Lo más vendido. */}
          <article className="caja informe-productos">
            <h2>Lo más vendido</h2>
            {hayComida && (
              <div className="segmentos">
                <button className={area === "barra" ? "activo" : ""} onClick={() => { setArea("barra"); setTodos(false); }}>🍺 Barra</button>
                <button className={area === "comida" ? "activo comida-chip" : ""} onClick={() => { setArea("comida"); setTodos(false); }}>🍽 Comida</button>
              </div>
            )}
            {!productos.length && <p className="tenue">Nada vendido.</p>}
            <ol>
              {visibles.map((x) => (
                <li key={`${x.producto}:${x.nombre}`}>
                  <span className="informe-producto-nombre"><b>{x.cantidad}</b> {x.nombre}</span>
                  <strong>{pesos(x.valor)}</strong>
                  <span className={`informe-producto-barra${x.comida ? " comida" : ""}`} style={{ width: `${(x.valor / topeProducto) * 100}%` }} aria-hidden />
                </li>
              ))}
            </ol>
            {productos.length > 8 && <button className="enlace" onClick={() => setTodos(!todos)}>{todos ? "Ver menos" : `Ver todos (${productos.length})`}</button>}
          </article>

          {/* 7. Fiado. */}
          {(inf.fiado > 0 || inf.pagosDeudas.total > 0) && (
            <article className="caja informe-fiado">
              <h2>📒 Fiado</h2>
              <div className="informe-cifras">
                <div><span>Se fió</span><strong>{pesos(inf.fiado)}</strong></div>
                <div><span>Pagaron de deudas</span><strong>{pesos(inf.pagosDeudas.total)}</strong></div>
              </div>
              {sinc.esAdministrador && <button className="enlace" onClick={() => nav.ir({ v: "deudas" })}>Ver las deudas ›</button>}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
