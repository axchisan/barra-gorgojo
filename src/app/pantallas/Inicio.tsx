import { useEffect, useState } from "react";
import { nombreArea } from "../../dominio/areas";
import { jornada, porDespachar, situacion, total, type Cuenta } from "../../dominio/estado";
import { horaDe, pesos } from "../../dominio/formato";
import { Apartados } from "../componentes/Apartados";
import { HojaSonido, PorDespachar } from "../componentes/Despacho";
import { EstadoConexion } from "../componentes/EstadoConexion";
import { TarjetaCuenta } from "../componentes/TarjetaCuenta";
import { ListaApartados } from "../componentes/ListaApartados";
import { useAtrasCierra, type Nav } from "../navegacion";
import { cerrarConEnter } from "../teclado";
import { useAtajos } from "../atajos";
import { sinc } from "../sincronizacion";
import { Cocina } from "./Cocina";
import { ElDia } from "./ElDia";
import { Detalle } from "./Detalle";

/**
 * Portátil (docs/18 fase 2): pantalla de 1300 px o más y que no sea táctil. Ahí el inicio va en dos
 * columnas: la lista y, al lado, la cuenta abierta. La tablet de la barra y los teléfonos
 * (táctiles o más angostos) siguen igual.
 */
const ANCHO = "(min-width: 1300px)";
/** Táctil como puntero principal (tablet, teléfono): esos se quedan con una columna. */
const TACTIL = "(pointer: coarse)";
/** La cuenta que estaba en el panel, para volver a mostrarla al regresar al inicio. */
let cuentaEnPanel: string | null = null;
const esPortatil = () => typeof matchMedia === "function" && matchMedia(ANCHO).matches && !matchMedia(TACTIL).matches;
function usePortatil() {
  const [es, setEs] = useState(esPortatil);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const ms = [matchMedia(ANCHO), matchMedia(TACTIL)];
    const cambio = () => setEs(esPortatil());
    for (const m of ms) m.addEventListener("change", cambio);
    return () => { for (const m of ms) m.removeEventListener("change", cambio); };
  }, []);
  return es;
}

export function Inicio({ nav, pestana: pedida }: { nav: Nav; pestana: "cuentas" | "cocina" | "despacho" | "dia" }) {
  // «Cocina» ya no es pestaña (las pasadas a comida salen arriba de las cuentas): un
  // historial viejo que lleve allá abre las cuentas.
  // Sin el permiso de ver el día (docs/17), «El día» no está: un historial viejo lleva a las cuentas.
  const pestana = pedida === "cocina" || (pedida === "dia" && !sinc.veDia) ? "cuentas" : pedida;
  const cuentas = Object.values(sinc.visible.cuentas);
  const enCocina = cuentas.filter((c) => situacion(c) === "comida" && !c.comidaCobrada);
  const nDespacho = porDespachar(cuentas).length;
  const panel = sinc.panel;
  const [cambiar, setCambiar] = useState(false);
  const [sonido, setSonido] = useState(false);
  const barra = sinc.tieneArea("barra");
  // Ocultar lo que no es del panel (docs/14): en la barra, las cuentas de solo comida; en
  // comida, las de solo barra. Lo que mezcla las dos cosas siempre se ve. Cada aparato lo
  // recuerda por panel; comida empieza ocultando lo de la barra (como antes, plegado).
  const [ocultarPor, setOcultarPor] = useState(() => ({ barra: leerOcultar("barra"), comida: leerOcultar("comida") }));
  const ocultar = ocultarPor[panel];
  const setOcultar = (v: boolean) => { setOcultarPor((o) => ({ ...o, [panel]: v })); guardarOcultar(panel, v); };
  const ocultables = cuentas.filter((c) => situacion(c) === "abierta" && ajena(c, panel)).length;
  const verBotonOcultar = pestana === "cuentas" && (ocultables > 0 || ocultar);
  const queOculta = panel === "barra" ? "comida" : "barra";
  useAtrasCierra(cambiar, () => setCambiar(false));
  // Dos columnas en el portátil: la cuenta abierta en el panel de la derecha.
  const portatil = usePortatil();
  // Se recuerda mientras la app está abierta: al volver de anotar o cobrar, sigue en el panel.
  const [abierta, setAbiertaCruda] = useState<string | null>(() => cuentaEnPanel);
  const setAbierta = (id: string | null) => { cuentaEnPanel = id; setAbiertaCruda(id); };
  const dosColumnas = portatil && pestana === "cuentas";
  /** En la lista: abrir una cuenta la muestra en el panel. */
  const navLista: Nav = dosColumnas ? { ...nav, ir: (v, r) => (v.v === "cuenta" ? setAbierta(v.id) : nav.ir(v, r)) } : nav;
  /** En el panel: «volver» lo cierra; otra cuenta (juntada) se abre ahí mismo; lo demás, como siempre. */
  const navPanel: Nav = { ...nav, volver: () => setAbierta(null), aInicio: () => setAbierta(null), ir: (v, r) => (v.v === "cuenta" ? setAbierta(v.id) : nav.ir(v, r)) };
  // Teclado físico (docs/02): «/» busca, «N» abre una cuenta nueva, 1…9 abren la cuenta de la lista.
  const atajos: Record<string, () => boolean | void> = {
    "/": () => { const b = document.querySelector<HTMLInputElement>(".inicio input.buscar"); if (!b) return false; b.focus(); },
    n: () => nav.ir({ v: "anotar" }),
    // Esc cierra el panel de la cuenta, salvo que haya una hoja abierta (esa se cierra primero).
    escape: () => { if (!abierta || history.state?.capa) return false; setAbierta(null); },
  };
  for (let i = 1; i <= 9; i++) atajos[String(i)] = () => { const t = document.querySelectorAll<HTMLElement>(".inicio .tarjetas .tarjeta")[i - 1]; if (!t) return false; t.click(); };
  useAtajos(atajos, pestana === "cuentas" && !cambiar);

  return (
    <main className={`inicio pestana-${pestana}${sinc.panel === "comida" ? " con-pedido" : ""}`}>
      <header className={sinc.areas.length > 1 ? "barra-superior con-paneles" : "barra-superior"}>
        {sinc.areas.length > 1 ? (
          <div className="segmentos panel" role="group" aria-label="Área">
            {sinc.areas.map((a) => (
              <button key={a} className={panel === a ? `activo${a === "comida" ? " comida-chip" : ""}` : ""} aria-pressed={panel === a} aria-label={nombreArea(a)} onClick={() => sinc.ponerPanel(a)}>
                {a === "comida" ? "🍽" : "🍺"}<span className="largo"> {nombreArea(a)}</span>
              </button>
            ))}
          </div>
        ) : <strong>{nombreArea(panel)}</strong>}
        <EstadoConexion />
        {/* En el teléfono, con los dos paneles, el nombre largo no cabe: va corto («Admin.»). */}
        <button className="quien" aria-label={`${sinc.sesion!.persona} ▾`} onClick={() => setCambiar(!cambiar)}>
          <span className="largo">{sinc.sesion!.persona}</span><span className="corto">{nombreCorto(sinc.sesion!.persona)}</span> ▾
        </button>
        {/* A toda la derecha: ocultar o mostrar lo del otro panel. */}
        {verBotonOcultar && (
          <button className={ocultar ? "ocultar-comida activo" : "ocultar-comida"} aria-pressed={ocultar}
            aria-label={`${ocultar ? "Mostrar" : "Ocultar"} las cuentas de solo ${queOculta}`} onClick={() => setOcultar(!ocultar)}>
            {queOculta === "comida" ? "🍽" : "🍺"}<span className="largo"> {ocultar ? "Mostrar" : "Ocultar"}</span>{ocultar && ocultables ? <small>{ocultables}</small> : null}
          </button>
        )}
      </header>
      {cambiar && (
        <div className="menu-persona">
          {sinc.sesion?.horario && (
            <p className="horario-sesion">⏰ {sinc.sesion.fin ? `Su acceso de hoy termina a las ${horaDe(sinc.sesion.fin)}.` : sinc.sesion.horario}</p>
          )}
          {sinc.esAdministrador && (
            <>
              <button onClick={() => { setCambiar(false); nav.ir({ v: "productos" }); }}>Productos y precios</button>
              <button onClick={() => { setCambiar(false); nav.ir({ v: "personas" }); }}>Personas y celulares</button>
              <button onClick={() => { setCambiar(false); nav.ir({ v: "auditoria" }); }}>Auditoría</button>
            </>
          )}
          <button onClick={() => { setCambiar(false); nav.ir({ v: "deudas" }); }}>📒 Deudas</button>
          {barra && <button onClick={() => { setCambiar(false); setSonido(true); }}>🔔 Sonido de los avisos</button>}
          <button onClick={() => { setCambiar(false); nav.ir({ v: "mipin" }); }}>Cambiar mi PIN</button>
          <button onClick={() => sinc.salir()}>Cambiar de persona</button>
          <button onClick={() => setCambiar(false)}>Cerrar</button>
        </div>
      )}

      {sonido && <HojaSonido cerrar={() => setSonido(false)} />}
      <Apartados />
      {pestana === "cuentas" && (() => {
        const lista = (
          <>
            {enCocina.length > 0 && (
              <details className="pasadas-a-comida">
                <summary>🍽 {enCocina.length === 1 ? "1 mesa pasada" : `${enCocina.length} mesas pasadas`} a comida sin cobrar</summary>
                <Cocina nav={navLista} cuentas={enCocina} />
              </details>
            )}
            {/* Los apartados se manejan en comida (en la barra, la tarjeta dice «⏰ Apartado»). */}
            {panel === "comida" && <ListaApartados nav={navLista} cuentas={cuentas} />}
            <ListaCuentas nav={navLista} cuentas={cuentas} ocultar={ocultar} mostrar={() => setOcultar(false)} />
          </>
        );
        if (!dosColumnas) return lista;
        return (
          <div className="dos-columnas">
            <div className="col-lista">{lista}</div>
            <aside className="panel-cuenta" aria-label="Cuenta abierta">
              {abierta && sinc.visible.cuentas[abierta]
                ? <Detalle key={abierta} nav={navPanel} id={abierta} />
                : <p className="vacio panel-vacio">Escoja una cuenta de la lista (o un número del 1 al 9).</p>}
            </aside>
          </div>
        );
      })()}
      {pestana === "despacho" && <PorDespachar nav={nav} cuentas={cuentas} />}
      {pestana === "dia" && <ElDia nav={nav} cuentas={cuentas} />}

      <nav className="pestanas">
        <button className={pestana === "cuentas" ? "activa" : ""} onClick={() => nav.ir({ v: "inicio", pestana: "cuentas" }, true)}>Cuentas</button>
        {/* Aparece cuando hay algo por despachar (y el aviso de arriba lleva aquí). */}
        {nDespacho > 0 && (
          <button className={`${pestana === "despacho" ? "activa" : ""}${nDespacho ? " con-pendientes" : ""}`} onClick={() => nav.ir({ v: "inicio", pestana: "despacho" }, true)}>
            Despachar{nDespacho ? ` (${nDespacho})` : ""}
          </button>
        )}
        {sinc.veDia && <button className={pestana === "dia" ? "activa" : ""} onClick={() => nav.ir({ v: "inicio", pestana: "dia" }, true)}>El día</button>}
      </nav>
    </main>
  );
}

/** El nombre para la cabecera angosta: la primera palabra, y si es larga, recortada con punto. */
function nombreCorto(nombre: string) {
  const primera = nombre.trim().split(/\s+/)[0] ?? nombre;
  return primera.length > 9 ? `${primera.slice(0, 5)}.` : primera;
}

/** Si este aparato oculta lo del otro panel (preferencia local). Comida empieza ocultando lo de la barra. */
function leerOcultar(panel: "barra" | "comida") {
  try { const v = localStorage.getItem(`ocultar-${panel}`); return v == null ? panel === "comida" : v === "1"; } catch { return panel === "comida"; }
}
function guardarOcultar(panel: "barra" | "comida", v: boolean) { try { localStorage.setItem(`ocultar-${panel}`, v ? "1" : "0"); } catch { /* sin almacenamiento */ } }

/** Con algo de comida: platos, o bebidas pedidas desde comida. */
const deComida = (c: Cuenta) => c.lineas.some((l) => !l.anulada && (l.comida || l.porDespachar || l.despachada));
/** Con productos y todos de comida (sin bebidas). */
const soloComida = (c: Cuenta) => { const vivas = c.lineas.filter((l) => !l.anulada); return vivas.length > 0 && vivas.every((l) => l.comida); };
/** Lo que un panel puede ocultar: en la barra, lo de solo comida; en comida, lo que no tiene nada de comida. */
const ajena = (c: Cuenta, panel: "barra" | "comida") => (panel === "barra" ? soloComida(c) : !deComida(c));

function ListaCuentas({ nav, cuentas, ocultar, mostrar }: { nav: Nav; cuentas: Cuenta[]; ocultar: boolean; mostrar: () => void }) {
  const [buscar, setBuscar] = useState("");
  const [verCerradas, setVerCerradas] = useState(false);
  // La barra ve lo que pasa en comida (docs/14), pero puede ocultar las cuentas de solo
  // comida para anotar más cómodo. Las de comida con bebidas siguen a la vista. Cada
  // aparato lo recuerda.
  const q = buscar.trim().toLowerCase();
  const coincide = (c: Cuenta) =>
    !q || c.nombre.toLowerCase().includes(q) || String(c.mesa ?? "") === q || (c.cancha ?? "") === q;
  const abiertas = cuentas
    .filter((c) => situacion(c) === "abierta" && (total(c) > 0 || Date.now() - c.abiertaEn < 3 * 3600_000))
    .filter(coincide)
    .sort((a, b) => b.ultima - a.ultima);
  const panel = sinc.panel;
  const ocultas = ocultar ? abiertas.filter((c) => ajena(c, panel)) : [];
  const principales = ocultar ? abiertas.filter((c) => !ajena(c, panel)) : abiertas;
  const hoy = jornada(Date.now());
  const cerradas = cuentas
    .filter((c) => (situacion(c) === "cobrada" || situacion(c) === "comida" || situacion(c) === "juntada") && jornada(c.ultima) === hoy)
    .filter(coincide)
    .sort((a, b) => b.ultima - a.ultima);

  return (
    <>
      {/* El filtro de comida va en la misma fila del buscador: no quita espacio a las cuentas. */}
      <div className="fila-buscar">
        <input className="buscar" type="search" enterKeyHint="search" autoCapitalize="off" autoCorrect="off" spellCheck={false} onKeyDown={cerrarConEnter}
          placeholder="Buscar cuenta, mesa o cancha" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      </div>
      {principales.length === 0 && !ocultas.length && <p className="vacio">No hay cuentas abiertas.</p>}
      <div className="tarjetas">
        {principales.map((c) => <TarjetaCuenta key={c.id} c={c} nav={nav} />)}
      </div>
      {/* Lo oculto se avisa: en el celular el botón de arriba es solo un ícono. */}
      {ocultas.length > 0 && (
        <button className="enlace ocultas" onClick={mostrar}>
          {ocultas.length === 1 ? "1 cuenta" : `${ocultas.length} cuentas`} de solo {panel === "barra" ? "comida" : "barra"} {ocultas.length === 1 ? "oculta" : "ocultas"} · Mostrar
        </button>
      )}
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
                  <span className={situacion(c) === "comida" ? "estado comida" : situacion(c) === "juntada" ? "estado juntas" : "estado cobrada"}>
                    {situacion(c) === "comida" ? "Pasada a comida" : situacion(c) === "juntada" ? `Junto con ${c.juntadaA!.nombre}` : "Cobrada"} · {horaDe(c.ultima)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      <div className="pie-fijo">
        {/* Pedido rápido a la barra (docs/14): lo que necesitan llevar, sin ir hasta allá. */}
        {sinc.panel === "comida" && (
          <button className="secundario pedir-barra" aria-label="Pedir a la barra" onClick={() => nav.ir({ v: "anotar", despacho: true })}>
            🔔 Pedir<span className="largo"> a la barra</span>
          </button>
        )}
        <button className="principal grande" onClick={() => nav.ir({ v: "anotar" })}>＋ Nueva cuenta</button>
      </div>
    </>
  );
}
