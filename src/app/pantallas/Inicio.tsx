import { useState } from "react";
import { jornada, situacion, total, type Cuenta } from "../../dominio/estado";
import { horaDe, pesos } from "../../dominio/formato";
import { Apartados } from "../componentes/Apartados";
import { EstadoConexion } from "../componentes/EstadoConexion";
import { TarjetaCuenta } from "../componentes/TarjetaCuenta";
import { useAtrasCierra, type Nav } from "../navegacion";
import { cerrarConEnter } from "../teclado";
import { sinc } from "../sincronizacion";
import { Cocina } from "./Cocina";
import { ElDia } from "./ElDia";

export function Inicio({ nav, pestana }: { nav: Nav; pestana: "cuentas" | "cocina" | "dia" }) {
  const cuentas = Object.values(sinc.visible.cuentas);
  const enCocina = cuentas.filter((c) => situacion(c) === "comida" && !c.comidaCobrada);
  const [cambiar, setCambiar] = useState(false);
  useAtrasCierra(cambiar, () => setCambiar(false));

  return (
    <main className="inicio">
      <header className="barra-superior">
        <strong>Barra</strong>
        <EstadoConexion />
        <button className="quien" onClick={() => setCambiar(!cambiar)}>{sinc.sesion!.persona} ▾</button>
      </header>
      {cambiar && (
        <div className="menu-persona">
          {sinc.esAdministrador && (
            <>
              <button onClick={() => { setCambiar(false); nav.ir({ v: "productos" }); }}>Productos y precios</button>
              <button onClick={() => { setCambiar(false); nav.ir({ v: "personas" }); }}>Personas y celulares</button>
            </>
          )}
          <button onClick={() => { setCambiar(false); nav.ir({ v: "mipin" }); }}>Cambiar mi PIN</button>
          <button onClick={() => sinc.salir()}>Cambiar de persona</button>
          <button onClick={() => setCambiar(false)}>Cerrar</button>
        </div>
      )}

      <Apartados />
      {pestana === "cuentas" && <ListaCuentas nav={nav} cuentas={cuentas} />}
      {pestana === "cocina" && <Cocina nav={nav} cuentas={enCocina} />}
      {pestana === "dia" && <ElDia nav={nav} cuentas={cuentas} />}

      <nav className="pestanas">
        <button className={pestana === "cuentas" ? "activa" : ""} onClick={() => nav.ir({ v: "inicio", pestana: "cuentas" }, true)}>Cuentas</button>
        <button className={pestana === "cocina" ? "activa" : ""} onClick={() => nav.ir({ v: "inicio", pestana: "cocina" }, true)}>
          Cocina{enCocina.length ? ` (${enCocina.length})` : ""}
        </button>
        <button className={pestana === "dia" ? "activa" : ""} onClick={() => nav.ir({ v: "inicio", pestana: "dia" }, true)}>El día</button>
      </nav>
    </main>
  );
}

function ListaCuentas({ nav, cuentas }: { nav: Nav; cuentas: Cuenta[] }) {
  const [buscar, setBuscar] = useState("");
  const [verCerradas, setVerCerradas] = useState(false);
  const q = buscar.trim().toLowerCase();
  const coincide = (c: Cuenta) =>
    !q || c.nombre.toLowerCase().includes(q) || String(c.mesa ?? "") === q || (c.cancha ?? "") === q;
  const abiertas = cuentas
    .filter((c) => situacion(c) === "abierta" && (total(c) > 0 || Date.now() - c.abiertaEn < 3 * 3600_000))
    .filter(coincide)
    .sort((a, b) => b.ultima - a.ultima);
  const hoy = jornada(Date.now());
  const cerradas = cuentas
    .filter((c) => (situacion(c) === "cobrada" || situacion(c) === "comida") && jornada(c.ultima) === hoy)
    .filter(coincide)
    .sort((a, b) => b.ultima - a.ultima);

  return (
    <>
      <input className="buscar" type="search" enterKeyHint="search" autoCapitalize="off" autoCorrect="off" spellCheck={false} onKeyDown={cerrarConEnter}
        placeholder="Buscar cuenta, mesa o cancha" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      {abiertas.length === 0 && <p className="vacio">No hay cuentas abiertas.</p>}
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
