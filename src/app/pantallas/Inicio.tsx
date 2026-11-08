import { useState } from "react";
import { nombreArea } from "../../dominio/areas";
import { jornada, porDespachar, situacion, total, type Cuenta } from "../../dominio/estado";
import { horaDe, pesos } from "../../dominio/formato";
import { Apartados } from "../componentes/Apartados";
import { PorDespachar } from "../componentes/Despacho";
import { EstadoConexion } from "../componentes/EstadoConexion";
import { TarjetaCuenta } from "../componentes/TarjetaCuenta";
import { useAtrasCierra, type Nav } from "../navegacion";
import { cerrarConEnter } from "../teclado";
import { sinc } from "../sincronizacion";
import { Cocina } from "./Cocina";
import { ElDia } from "./ElDia";

export function Inicio({ nav, pestana }: { nav: Nav; pestana: "cuentas" | "cocina" | "despacho" | "dia" }) {
  const cuentas = Object.values(sinc.visible.cuentas);
  const enCocina = cuentas.filter((c) => situacion(c) === "comida" && !c.comidaCobrada);
  const nDespacho = porDespachar(cuentas).length;
  const panel = sinc.panel;
  const barra = sinc.tieneArea("barra");
  const [cambiar, setCambiar] = useState(false);
  useAtrasCierra(cambiar, () => setCambiar(false));

  return (
    <main className={`inicio pestana-${pestana}`}>
      <header className="barra-superior">
        {sinc.areas.length > 1 ? (
          <div className="segmentos panel" role="group" aria-label="Área">
            {sinc.areas.map((a) => (
              <button key={a} className={panel === a ? `activo${a === "comida" ? " comida-chip" : ""}` : ""} aria-pressed={panel === a} onClick={() => sinc.ponerPanel(a)}>
                {a === "comida" ? "🍽" : "🍺"} {nombreArea(a)}
              </button>
            ))}
          </div>
        ) : <strong>{nombreArea(panel)}</strong>}
        <EstadoConexion />
        <button className="quien" onClick={() => setCambiar(!cambiar)}>{sinc.sesion!.persona} ▾</button>
      </header>
      {cambiar && (
        <div className="menu-persona">
          {sinc.esAdministrador && (
            <>
              <button onClick={() => { setCambiar(false); nav.ir({ v: "productos" }); }}>Productos y precios</button>
              <button onClick={() => { setCambiar(false); nav.ir({ v: "personas" }); }}>Personas y celulares</button>
              <button onClick={() => { setCambiar(false); nav.ir({ v: "auditoria" }); }}>Auditoría</button>
            </>
          )}
          <button onClick={() => { setCambiar(false); nav.ir({ v: "mipin" }); }}>Cambiar mi PIN</button>
          <button onClick={() => sinc.salir()}>Cambiar de persona</button>
          <button onClick={() => setCambiar(false)}>Cerrar</button>
        </div>
      )}

      <Apartados />
      {pestana === "cuentas" && <ListaCuentas nav={nav} cuentas={cuentas} />}
      {pestana === "despacho" && <PorDespachar nav={nav} cuentas={cuentas} />}
      {pestana === "cocina" && <Cocina nav={nav} cuentas={enCocina} />}
      {pestana === "dia" && <ElDia nav={nav} cuentas={cuentas} />}

      <nav className="pestanas">
        <button className={pestana === "cuentas" ? "activa" : ""} onClick={() => nav.ir({ v: "inicio", pestana: "cuentas" }, true)}>Cuentas</button>
        {/* Aparece cuando hay algo por despachar (y el aviso de arriba lleva aquí). */}
        {nDespacho > 0 && (
          <button className={`${pestana === "despacho" ? "activa" : ""}${nDespacho ? " con-pendientes" : ""}`} onClick={() => nav.ir({ v: "inicio", pestana: "despacho" }, true)}>
            Despachar{nDespacho ? ` (${nDespacho})` : ""}
          </button>
        )}
        {(barra && (panel === "barra" || enCocina.length > 0)) && (
          <button className={pestana === "cocina" ? "activa" : ""} onClick={() => nav.ir({ v: "inicio", pestana: "cocina" }, true)}>
            Cocina{enCocina.length ? ` (${enCocina.length})` : ""}
          </button>
        )}
        <button className={pestana === "dia" ? "activa" : ""} onClick={() => nav.ir({ v: "inicio", pestana: "dia" }, true)}>El día</button>
      </nav>
    </main>
  );
}

function ListaCuentas({ nav, cuentas }: { nav: Nav; cuentas: Cuenta[] }) {
  const [buscar, setBuscar] = useState("");
  const [verCerradas, setVerCerradas] = useState(false);
  // La barra ve lo que pasa en comida (docs/14): filtro de cuentas con platos o con cerveza pedida desde comida.
  const [filtro, setFiltro] = useState<"todas" | "comida">("todas");
  const deComida = (c: Cuenta) => c.lineas.some((l) => !l.anulada && (l.comida || l.porDespachar || l.despachada));
  const q = buscar.trim().toLowerCase();
  const coincide = (c: Cuenta) =>
    !q || c.nombre.toLowerCase().includes(q) || String(c.mesa ?? "") === q || (c.cancha ?? "") === q;
  const abiertas = cuentas
    .filter((c) => situacion(c) === "abierta" && (total(c) > 0 || Date.now() - c.abiertaEn < 3 * 3600_000))
    .filter(coincide)
    .filter((c) => filtro === "todas" || deComida(c))
    .sort((a, b) => b.ultima - a.ultima);
  const hayComida = cuentas.some((c) => situacion(c) === "abierta" && deComida(c));
  const hoy = jornada(Date.now());
  const cerradas = cuentas
    .filter((c) => (situacion(c) === "cobrada" || situacion(c) === "comida") && jornada(c.ultima) === hoy)
    .filter(coincide)
    .sort((a, b) => b.ultima - a.ultima);

  return (
    <>
      {/* El filtro de comida va en la misma fila del buscador: no quita espacio a las cuentas. */}
      <div className="fila-buscar">
        <input className="buscar" type="search" enterKeyHint="search" autoCapitalize="off" autoCorrect="off" spellCheck={false} onKeyDown={cerrarConEnter}
          placeholder="Buscar cuenta, mesa o cancha" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        {(hayComida || filtro === "comida") && (
          <button className={filtro === "comida" ? "chip filtro-comida activo" : "chip filtro-comida"} aria-pressed={filtro === "comida"}
            aria-label="Solo cuentas con comida" onClick={() => setFiltro(filtro === "comida" ? "todas" : "comida")}>🍽</button>
        )}
      </div>
      {abiertas.length === 0 && <p className="vacio">{filtro === "comida" ? "No hay cuentas abiertas con comida." : "No hay cuentas abiertas."}</p>}
      <div className="tarjetas">
        {abiertas.map((c) => <TarjetaCuenta key={c.id} c={c} nav={nav} />)}
      </div>
      {cerradas.length > 0 && (
        <section className="cerradas">
          <button className="enlace" onClick={() => setVerCerradas(!verCerradas)}>
            {verCerradas ? "▾" : "▸"} Cerradas hoy ({cerradas.length})
          </button>
          {verCerradas && (
            <div className="tarjetas">
              {cerradas.map((c) => (
                <button key={c.id} className="tarjeta cerrada" onClick={() => nav.ir({ v: "cuenta", id: c.id })}>
                  <span className="nombre">{c.nombre}</span>
                  <span className="valor">{pesos(total(c))}</span>
                  <span className={situacion(c) === "comida" ? "estado comida" : "estado cobrada"}>
                    {situacion(c) === "comida" ? "Pasada a comida" : "Cobrada"} · {horaDe(c.ultima)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      <div className="pie-fijo">
        <button className="principal grande" onClick={() => nav.ir({ v: "anotar" })}>＋ Nueva cuenta</button>
      </div>
    </>
  );
}
