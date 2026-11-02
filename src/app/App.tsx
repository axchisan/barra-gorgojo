import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CATEGORIAS, MEDIO_PETACO, PERSONAS, PETACO, PRODUCTOS, SECCIONES, TOPE_VALOR_LIBRE,
  type Categoria, type Producto,
} from "../dominio/catalogo";
import {
  catalogo, jornada, precioPara, producto as productoDe, saldo, situacion, total, totalComida, unidades,
  type Cancha, type Cuenta, type Linea, type Medio, type Paquete, type TipoCuenta,
} from "../dominio/estado";
import { haceCuanto, horaDe, nombreCancha, palabraRonda, pesos } from "../dominio/formato";
import { sinc } from "./sincronizacion";

// ── Navegación con el botón «atrás» del celular ────────────────────────

type Vista =
  | { v: "inicio"; pestana: "cuentas" | "cocina" | "dia" }
  | { v: "anotar"; cuenta?: string; repetir?: boolean }
  | { v: "cuenta"; id: string }
  | { v: "cobrar"; id: string }
  | { v: "productos" }
  | { v: "producto"; id?: string };

const INICIO: Vista = { v: "inicio", pestana: "cuentas" };

function useNavegacion() {
  const [vista, setVista] = useState<Vista>(() => (history.state?.vista as Vista) ?? INICIO);
  useEffect(() => {
    if (!history.state?.vista) history.replaceState({ vista: INICIO, d: 0 }, "");
    const alVolver = (e: PopStateEvent) => setVista((e.state?.vista as Vista) ?? INICIO);
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, []);
  const profundidad = (): number => history.state?.d ?? 0;
  const ir = (v: Vista, reemplazar = false) => {
    if (reemplazar) history.replaceState({ vista: v, d: profundidad() }, "");
    else history.pushState({ vista: v, d: profundidad() + 1 }, "");
    setVista(v);
    window.scrollTo(0, 0);
  };
  const volver = () => history.back();
  /** Vuelve a la raíz del historial, para que «atrás» no muestre pantallas viejas. */
  const aInicio = () => {
    const d = profundidad();
    if (d > 0) history.go(-d);
    else ir(INICIO, true);
  };
  return { vista, ir, volver, aInicio };
}
type Nav = ReturnType<typeof useNavegacion>;

// ── Aviso con «Deshacer» ───────────────────────────────────────────────

type Aviso = { texto: string; deshacer?: () => void; id: number };
let ponerAviso: (a: Omit<Aviso, "id">) => void = () => {};

function Avisos() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  useEffect(() => {
    ponerAviso = (a) => setAviso({ ...a, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.deshacer ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [aviso]);
  if (!aviso) return null;
  return (
    <div className="aviso" role="status">
      <span>{aviso.texto}</span>
      {aviso.deshacer && (
        <button onClick={() => { aviso.deshacer!(); setAviso(null); }}>Deshacer</button>
      )}
    </div>
  );
}

const vibrar = () => { try { navigator.vibrate?.(12); } catch { /* sin vibración */ } };

// ── Aplicación ─────────────────────────────────────────────────────────

export function App() {
  useSyncExternalStore(sinc.suscribir, sinc.instantanea);
  const nav = useNavegacion();
  const [, refrescar] = useState(0);
  useEffect(() => {
    const t = setInterval(() => refrescar((x) => x + 1), 30_000); // «hace N min»
    return () => clearInterval(t);
  }, []);

  if (!sinc.sesion) return <Entrada />;

  const { vista } = nav;
  return (
    <>
      {vista.v === "inicio" && <Inicio nav={nav} pestana={vista.pestana} />}
      {vista.v === "anotar" && <Anotar nav={nav} cuentaId={vista.cuenta} repetir={vista.repetir} />}
      {vista.v === "cuenta" && <Detalle nav={nav} id={vista.id} />}
      {vista.v === "cobrar" && <Cobrar nav={nav} id={vista.id} />}
      {vista.v === "productos" && <Productos nav={nav} />}
      {vista.v === "producto" && <EditarProducto nav={nav} id={vista.id} />}
      <Avisos />
    </>
  );
}

function EstadoConexion() {
  const n = sinc.pendientes.length;
  if (sinc.conexion === "conectado") {
    return <span className="conexion ok">● {n ? `Enviando ${n}…` : "Todo al día"}</span>;
  }
  return <span className="conexion sin">● Sin señal{n ? ` · ${n} por enviar` : ""}</span>;
}

// ── Entrada ────────────────────────────────────────────────────────────

function Entrada() {
  const guardada = sinc.claveGuardada;
  const [persona, setPersona] = useState<string | null>(null);
  const [clave, setClave] = useState(guardada);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async (p: string, c: string) => {
    setCargando(true);
    setError("");
    const e = await sinc.entrar(p, c);
    setCargando(false);
    if (e) setError(e);
  };

  return (
    <main className="entrada">
      <img src="/icono-192.png" alt="" width={96} height={96} />
      <h1>Barra del Gorgojo</h1>
      <p>¿Quién va a anotar?</p>
      <div className="personas">
        {PERSONAS.map((p) => (
          <button
            key={p}
            className={persona === p ? "persona activa" : "persona"}
            onClick={() => {
              setPersona(p);
              if (guardada) entrar(p, guardada);
            }}
          >
            {p}
          </button>
        ))}
      </div>
      {(!guardada || error) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (persona) entrar(persona, clave);
            else setError("Toque su nombre primero.");
          }}
        >
          <label>
            Clave del negocio
            <input type="password" inputMode="text" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
          <button className="principal" disabled={cargando}>{cargando ? "Entrando…" : "Entrar"}</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      {sinc.pendientes.length > 0 && (
        <p className="nota">Hay {sinc.pendientes.length} anotaciones guardadas en este celular. Se envían al entrar.</p>
      )}
    </main>
  );
}

// ── Inicio ─────────────────────────────────────────────────────────────

const iconoTipo = (c: Cuenta) =>
  c.tipo === "mesa" ? `🍽 Mesa ${c.mesa}` : c.tipo === "cancha" ? `🎯 Cancha ${nombreCancha(c.cancha!)}` : null;

function Inicio({ nav, pestana }: { nav: Nav; pestana: "cuentas" | "cocina" | "dia" }) {
  const cuentas = Object.values(sinc.visible.cuentas);
  const enCocina = cuentas.filter((c) => situacion(c) === "comida" && !c.comidaCobrada);
  const [cambiar, setCambiar] = useState(false);

  return (
    <main className="inicio">
      <header className="barra-superior">
        <strong>Barra</strong>
        <EstadoConexion />
        <button className="quien" onClick={() => setCambiar(!cambiar)}>{sinc.sesion!.persona} ▾</button>
      </header>
      {cambiar && (
        <div className="menu-persona">
          {sinc.sesion!.persona === "Administrador" && (
            <button onClick={() => { setCambiar(false); nav.ir({ v: "productos" }); }}>Productos y precios</button>
          )}
          <button onClick={() => sinc.salir()}>Cambiar de persona</button>
          <button onClick={() => setCambiar(false)}>Cerrar</button>
        </div>
      )}

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

function TarjetaCuenta({ c, nav }: { c: Cuenta; nav: Nav }) {
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const largo = useRef(false);
  const tipo = iconoTipo(c);
  return (
    <button
      className={`tarjeta ${c.tipo}${c.reabierta ? " reabierta" : ""}`}
      onPointerDown={() => {
        largo.current = false;
        temporizador.current = setTimeout(() => {
          largo.current = true;
          vibrar();
          nav.ir({ v: "anotar", cuenta: c.id });
        }, 450);
      }}
      onPointerUp={() => clearTimeout(temporizador.current)}
      onPointerLeave={() => clearTimeout(temporizador.current)}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (!largo.current) nav.ir({ v: "cuenta", id: c.id }); }}
    >
      <span className="nombre">{c.nombre}</span>
      {tipo && c.nombre !== tipo.slice(3) && <span className="tipo">{tipo}</span>}
      <span className="valor">{pesos(saldo(c))}</span>
      <span className="meta">{unidades(c)} · {haceCuanto(c.ultima)}</span>
      {c.reabierta && <span className="alerta">Anotaron después del cobro</span>}
    </button>
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
      <input className="buscar" type="search" placeholder="Buscar cuenta, mesa o cancha" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
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

// ── Anotar pedida / chico ──────────────────────────────────────────────

const VALORES_MECATO = [1000, 1500, 2000, 2500, 3000, 5000];

/** Un petaco o medio petaco en armado: qué cervezas lleva y cuántas. */
type PaqueteEnArmado = Paquete & { items: Record<string, number> };

const nombrePaquete = (pq: Pick<Paquete, "tipo" | "mixto">) =>
  `${pq.tipo === "petaco" ? "Petaco" : "Medio petaco"}${pq.mixto ? " mixto" : ""}`;

/** Agrupa las líneas por paquete. Las sueltas quedan aparte. */
function porPaquete(lineas: Linea[]) {
  const sueltas: Linea[] = [];
  const grupos = new Map<string, { paquete: Paquete; lineas: Linea[] }>();
  for (const l of lineas) {
    if (!l.paquete) { sueltas.push(l); continue; }
    const g = grupos.get(l.paquete.id) ?? { paquete: l.paquete, lineas: [] };
    g.lineas.push(l);
    grupos.set(l.paquete.id, g);
  }
  return { sueltas, grupos: [...grupos.values()] };
}

/** «Petaco Águila, Petaco mixto, 2 Light»: para el botón de repetir. */
function describir(lineas: Linea[]) {
  const { sueltas, grupos } = porPaquete(lineas);
  return [
    ...grupos.map((g) => g.paquete.mixto ? nombrePaquete(g.paquete) : `${nombrePaquete(g.paquete)} ${g.lineas[0].nombre}`),
    ...sueltas.map((l) => `${l.cantidad} ${l.nombre}`),
  ].join(", ");
}

/** Cuántos petacos y medios petacos hay en estas líneas (los anulados del todo no cuentan). */
function contarPaquetes(lineas: Linea[]) {
  const vivos = new Map<string, Paquete>();
  for (const l of lineas) if (l.paquete && !l.anulada) vivos.set(l.paquete.id, l.paquete);
  let petacos = 0, medios = 0;
  for (const pq of vivos.values()) pq.tipo === "petaco" ? petacos++ : medios++;
  return { petacos, medios };
}

const textoPaquetes = ({ petacos, medios }: { petacos: number; medios: number }) =>
  [petacos && `${petacos} ${petacos === 1 ? "petaco" : "petacos"}`, medios && `${medios} ${medios === 1 ? "medio petaco" : "medios petacos"}`]
    .filter(Boolean).join(" y ");

function Anotar({ nav, cuentaId, repetir }: { nav: Nav; cuentaId?: string; repetir?: boolean }) {
  const cuenta = cuentaId ? sinc.visible.cuentas[cuentaId] : undefined;
  const ultima = useMemo(() => {
    if (!cuenta) return null;
    for (let i = cuenta.rondas.length - 1; i >= 0; i--) {
      const lineas = cuenta.lineas.filter((l) => l.ronda === cuenta.rondas[i].id && !l.anulada);
      if (lineas.length) return lineas;
    }
    return null;
  }, [cuenta]);

  const [cant, setCant] = useState<Record<string, number>>({});
  // Productos de valor libre: el mecato (solo valor) y «Otro» (nombre y valor).
  const [libres, setLibres] = useState<{ producto: string; nombre?: string; precio: number; comida?: boolean }[]>([]);
  const [esComida, setEsComida] = useState(false);
  const [hoja, setHoja] = useState<"mecato" | "otro" | null>(null);
  const [otroValor, setOtroValor] = useState("");
  const [otroNombre, setOtroNombre] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCuenta>("grupo");
  const [mesa, setMesa] = useState("");
  const [cancha, setCancha] = useState<Cancha | null>(null);
  const [error, setError] = useState("");
  // Las cervezas se pueden anotar por unidad, por medio petaco (15) o por petaco (30).
  const [paso, setPaso] = useState<1 | 15 | 30>(1);
  const [mixto, setMixto] = useState<15 | 30 | null>(null);
  const [mezcla, setMezcla] = useState<Record<string, number>>({});
  const productos = catalogo(sinc.visible);
  const cervezas = productos.filter((p) => p.activo && p.categoria === "cerveza" && !p.libre);
  const enMezcla = Object.values(mezcla).reduce((a, b) => a + b, 0);
  const pasoDe = (p: Producto) => (p.categoria === "cerveza" ? paso : 1);
  const [paquetes, setPaquetes] = useState<PaqueteEnArmado[]>([]);
  const enPaquetes = (id: string) => paquetes.reduce((s, pq) => s + (pq.items[id] ?? 0), 0);

  const cargarUltima = () => {
    if (!ultima) return;
    const c: Record<string, number> = {};
    const l: { producto: string; nombre?: string; precio: number }[] = [];
    const pqs = new Map<string, PaqueteEnArmado>();
    for (const x of ultima) {
      if (x.paquete) {
        // Se repite el paquete tal cual, con identificador nuevo.
        const pq = pqs.get(x.paquete.id) ?? { ...x.paquete, id: crypto.randomUUID(), items: {} };
        pq.items[x.producto] = (pq.items[x.producto] ?? 0) + x.cantidad;
        pqs.set(x.paquete.id, pq);
      } else if (productoDe(sinc.visible, x.producto)?.libre) {
        for (let i = 0; i < x.cantidad; i++) l.push({ producto: x.producto, nombre: x.nombre, precio: x.precio });
      }
      else c[x.producto] = (c[x.producto] ?? 0) + x.cantidad;
    }
    setCant(c);
    setLibres(l);
    setPaquetes([...pqs.values()]);
    vibrar();
  };
  useEffect(() => { if (repetir) cargarUltima(); /* solo al entrar */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cuentaId && !cuenta) return <NoExiste nav={nav} />;

  const sumar = (id: string, d: number) => {
    vibrar();
    setCant((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) }));
  };
  // En las canchas rige el precio de cancha de cada producto (si lo tiene).
  const tipoCuenta = cuenta?.tipo ?? tipo;
  const precioVisto = (p: Producto) => precioPara(p, tipoCuenta);
  const precioDe = (id: string) => { const p = productoDe(sinc.visible, id); return p ? precioVisto(p) ?? 0 : 0; };
  const n =
    Object.values(cant).reduce((a, b) => a + b, 0) + libres.length +
    paquetes.reduce((s, pq) => s + Object.values(pq.items).reduce((a, b) => a + b, 0), 0);
  const valor =
    Object.entries(cant).reduce((s, [id, k]) => s + precioDe(id) * k, 0) +
    libres.reduce((a, b) => a + b.precio, 0) +
    paquetes.reduce((s, pq) => s + Object.entries(pq.items).reduce((t, [id, k]) => t + precioDe(id) * k, 0), 0);

  const agregarPaquete = (id: string) => {
    vibrar();
    setPaquetes((ps) => [...ps, { id: crypto.randomUUID(), tipo: paso === PETACO ? "petaco" : "medio", mixto: false, items: { [id]: paso } }]);
  };
  /** El «−» de una cerveza: en modo petaco quita el último petaco de esa marca; si no hay, una unidad. */
  const quitar = (p: Producto) => {
    if (pasoDe(p) > 1) {
      let i = paquetes.length - 1;
      while (i >= 0 && !(!paquetes[i].mixto && (paquetes[i].items[p.id] ?? 0) > 0)) i--;
      if (i >= 0) { vibrar(); return setPaquetes((ps) => ps.filter((_, j) => j !== i)); }
    }
    if ((cant[p.id] ?? 0) > 0) sumar(p.id, -1);
  };

  const palabra = palabraRonda(cuenta ?? { tipo });

  const lineas = () => {
    const ls = Object.entries(cant)
      .filter(([, k]) => k > 0)
      .map(([producto, cantidad]) => ({ id: crypto.randomUUID(), producto, cantidad, precio: precioDe(producto) || undefined }));
    const agrupados = new Map<string, { producto: string; nombre?: string; precio: number; cantidad: number }>();
    for (const x of libres) {
      const k = `${x.producto}|${x.nombre ?? ""}|${x.precio}|${x.comida ? 1 : 0}`;
      const g = agrupados.get(k) ?? { ...x, cantidad: 0 };
      g.cantidad++;
      agrupados.set(k, g);
    }
    const lsLibres = [...agrupados.values()].map((g) => ({ id: crypto.randomUUID(), ...g }));
    const lsPaquetes = paquetes.flatMap((pq) =>
      Object.entries(pq.items).filter(([, k]) => k > 0).map(([producto, cantidad]) => ({
        id: crypto.randomUUID(), producto, cantidad, precio: precioDe(producto) || undefined,
        paquete: { id: pq.id, tipo: pq.tipo, mixto: pq.mixto },
      })),
    );
    return [...ls, ...lsLibres, ...lsPaquetes];
  };

  const confirmar = (cobrarYa = false) => {
    if (n === 0) return setError(`Toque los productos de la ${palabra}.`);
    let id = cuentaId;
    if (!id) {
      if (tipo === "mesa" && !(Number(mesa) > 0)) return setError("Escriba el número de la mesa.");
      if (tipo === "cancha" && !cancha) return setError("Escoja la cancha.");
      id = crypto.randomUUID();
      const abiertasHoy = Object.values(sinc.visible.cuentas).filter((c) => jornada(c.abiertaEn) === jornada(Date.now())).length;
      const auto =
        tipo === "mesa" ? `Mesa ${Number(mesa)}` :
        tipo === "cancha" ? `Cancha ${nombreCancha(cancha!)}` :
        cobrarYa ? "Venta rápida" : `Cuenta ${abiertasHoy + 1}`;
      sinc.emitir({
        t: "abrir", cuenta: id, nombre: nombre.trim() || auto,
        tipo: cobrarYa && tipo === "grupo" ? "rapida" : tipo,
        mesa: tipo === "mesa" ? Number(mesa) : undefined,
        cancha: tipo === "cancha" ? cancha! : undefined,
      });
    }
    const ls = lineas();
    sinc.emitir({ t: "anotar", cuenta: id, ronda: crypto.randomUUID(), lineas: ls });
    const cuentaFinal = id;
    if (cobrarYa) return nav.ir({ v: "cobrar", id: cuentaFinal }, true);
    if (cuentaId) nav.volver();
    else nav.aInicio();
    ponerAviso({
      texto: `Anotado · ${n} · ${pesos(valor)}`,
      deshacer: () => { for (const l of ls) sinc.emitir({ t: "anular", cuenta: cuentaFinal, linea: l.id }); },
    });
  };

  return (
    <main className="anotar">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>{cuenta ? cuenta.nombre : "Nueva cuenta"}</strong>
        {cuenta && <span className="valor-chico">{pesos(saldo(cuenta))}</span>}
      </header>

      {!cuenta && (
        <section className="nueva">
          <input placeholder="Nombre (opcional): Grupo de Juan" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <div className="chips">
            {(["grupo", "persona", "mesa", "cancha"] as const).map((t) => (
              <button key={t} className={tipo === t ? "chip activo" : "chip"} onClick={() => { setTipo(t); setError(""); }}>
                {t === "grupo" ? "Grupo" : t === "persona" ? "Persona" : t === "mesa" ? "🍽 Mesa" : "🎯 Cancha"}
              </button>
            ))}
          </div>
          {tipo === "mesa" && (
            <input className="numero" inputMode="numeric" placeholder="N.º de mesa" value={mesa} onChange={(e) => setMesa(e.target.value.replace(/\D/g, ""))} autoFocus />
          )}
          {tipo === "cancha" && (
            <div className="chips">
              {(["1", "2", "pequena"] as const).map((k) => (
                <button key={k} className={cancha === k ? "chip activo" : "chip"} onClick={() => setCancha(k)}>Cancha {nombreCancha(k)}</button>
              ))}
            </div>
          )}
        </section>
      )}

      {ultima && (
        <button className="repetir" onClick={cargarUltima}>
          ↻ Repetir {palabra}: {describir(ultima)}
        </button>
      )}

      {SECCIONES.map((s) => (
        <section key={s.titulo}>
          <h2 className="seccion">{s.titulo}</h2>
          {s.categorias.includes("cerveza") && (
            <div className="petacos">
              <button className={paso === 1 ? "chip activo" : "chip"} onClick={() => setPaso(1)}>Por unidad</button>
              <button className={paso === MEDIO_PETACO ? "chip activo" : "chip"} onClick={() => setPaso(MEDIO_PETACO)}>Medio petaco · {MEDIO_PETACO}</button>
              <button className={paso === PETACO ? "chip activo" : "chip"} onClick={() => setPaso(PETACO)}>Petaco · {PETACO}</button>
              <button className="chip mixto" onClick={() => { setMezcla({}); setMixto(PETACO); setError(""); }}>Petaco mixto</button>
            </div>
          )}
          <div className="productos">
            {productos.filter((p) => p.activo && s.categorias.includes(p.categoria)).map((p) => {
              const k = p.libre ? libres.filter((x) => x.producto === p.id).length : (cant[p.id] ?? 0) + enPaquetes(p.id);
              return (
                <div key={p.id} className="producto-celda">
                  <button
                    className={p.conNombre ? "producto otro" : "producto"}
                    style={{ background: p.fondo, color: p.texto }}
                    onClick={() => (p.libre ? setHoja(p.conNombre ? "otro" : "mecato") : pasoDe(p) > 1 ? agregarPaquete(p.id) : sumar(p.id, 1))}
                  >
                    <span className="corto">{p.corto}</span>
                    <span className="precio">
                      {p.conNombre ? "nombre y valor" : p.libre ? "valor" : pasoDe(p) > 1 ? `${pasoDe(p)} por ${pesos(precioVisto(p)! * pasoDe(p))}` : pesos(precioVisto(p)!)}
                    </span>
                  </button>
                  {k > 0 && (
                    <button
                      className="contador"
                      aria-label={`Quitar una ${p.nombre}`}
                      onClick={() => {
                        if (!p.libre) return quitar(p);
                        const i = libres.map((x) => x.producto).lastIndexOf(p.id);
                        setLibres((l) => l.filter((_, j) => j !== i));
                      }}
                    >
                      {k}<small>−</small>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {s.categorias.includes("cerveza") && paquetes.length > 0 && (
            <div className="paquetes-armados">
              <h2 className="seccion">Petacos en esta {palabra}</h2>
              {paquetes.map((pq) => (
                <div key={pq.id} className="paquete-armado">
                  <span>
                    <b>{nombrePaquete(pq)}</b> · {Object.entries(pq.items).map(([id, k]) => `${k} ${productoDe(sinc.visible, id)?.nombre ?? id}`).join(", ")}
                  </span>
                  <button aria-label="Quitar este petaco" onClick={() => setPaquetes((ps) => ps.filter((x) => x.id !== pq.id))}>✕</button>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      {mixto && (
        <div className="hoja" onClick={() => setMixto(null)}>
          <div className="hoja-cuerpo" onClick={(e) => e.stopPropagation()}>
            <h2>Petaco mixto</h2>
            <div className="opciones">
              <button className={mixto === MEDIO_PETACO ? "chip activo" : "chip"} onClick={() => setMixto(MEDIO_PETACO)}>Medio · {MEDIO_PETACO}</button>
              <button className={mixto === PETACO ? "chip activo" : "chip"} onClick={() => setMixto(PETACO)}>Petaco · {PETACO}</button>
            </div>
            <p className={enMezcla === mixto ? "cambio" : enMezcla > mixto ? "cambio falta" : "nota centrada"}>
              {enMezcla === mixto ? `Completo: ${enMezcla} cervezas` : enMezcla > mixto ? `Sobran ${enMezcla - mixto}` : `Lleva ${enMezcla} · faltan ${mixto - enMezcla}`}
            </p>
            <div className="productos">
              {cervezas.map((p) => (
                <div key={p.id} className="producto-celda">
                  <button className="producto" style={{ background: p.fondo, color: p.texto }} onClick={() => { vibrar(); setMezcla((m) => ({ ...m, [p.id]: (m[p.id] ?? 0) + 1 })); }}>
                    <span className="corto">{p.corto}</span>
                    <span className="precio">+1</span>
                  </button>
                  {(mezcla[p.id] ?? 0) > 0 && (
                    <button className="contador" aria-label={`Quitar una ${p.nombre}`} onClick={() => setMezcla((m) => ({ ...m, [p.id]: Math.max(0, (m[p.id] ?? 0) - 1) }))}>
                      {mezcla[p.id]}<small>−</small>
                    </button>
                  )}
                  <button className="mas-cinco" onClick={() => { vibrar(); setMezcla((m) => ({ ...m, [p.id]: (m[p.id] ?? 0) + 5 })); }}>+5</button>
                </div>
              ))}
            </div>
            <div className="fila-botones">
              <button className="secundario" onClick={() => setMezcla({})}>Limpiar</button>
              <button className="principal grande" disabled={enMezcla !== mixto} onClick={() => {
                const items = Object.fromEntries(Object.entries(mezcla).filter(([, k]) => k > 0));
                setPaquetes((ps) => [...ps, { id: crypto.randomUUID(), tipo: mixto === PETACO ? "petaco" : "medio", mixto: true, items }]);
                setMixto(null);
                setMezcla({});
                vibrar();
              }}>Agregar petaco mixto</button>
            </div>
          </div>
        </div>
      )}

      {hoja && (
        <div className="hoja" onClick={() => setHoja(null)}>
          <div className="hoja-cuerpo" onClick={(e) => e.stopPropagation()}>
            <h2>{hoja === "otro" ? "Otro producto" : "Mecato · escoja el valor"}</h2>
            {error && <p className="error">{error}</p>}
            {hoja === "otro" && (
              <>
                <input
                  placeholder="¿Qué es? Ej.: Agua con gas, Picada, Almuerzo"
                  value={otroNombre}
                  onChange={(e) => setOtroNombre(e.target.value)}
                  autoFocus
                />
                <div className="opciones">
                  <button className={esComida ? "chip" : "chip activo"} onClick={() => setEsComida(false)}>🍺 Barra</button>
                  <button className={esComida ? "chip activo comida-chip" : "chip"} onClick={() => setEsComida(true)}>🍽 Es comida</button>
                </div>
              </>
            )}
            <div className="productos">
              {VALORES_MECATO.map((v) => (
                <button key={v} className="producto neutro" onClick={() => {
                  if (hoja === "otro" && !otroNombre.trim()) return setError("Escriba qué producto es.");
                  vibrar();
                  setLibres((l) => [...l, { producto: hoja, nombre: hoja === "otro" ? otroNombre.trim() : undefined, precio: v, comida: hoja === "otro" && esComida }]);
                  setHoja(null);
                  setEsComida(false);
                  setError("");
                }}>
                  <span className="corto">{pesos(v)}</span>
                </button>
              ))}
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const v = Number(otroValor);
              if (hoja === "otro" && !otroNombre.trim()) return setError("Escriba qué producto es.");
              if (v > 0 && v <= TOPE_VALOR_LIBRE) {
                setLibres((l) => [...l, { producto: hoja, nombre: hoja === "otro" ? otroNombre.trim() : undefined, precio: v, comida: hoja === "otro" && esComida }]);
                setEsComida(false);
                setOtroValor("");
                setHoja(null);
                setError("");
              }
            }}>
              <input inputMode="numeric" placeholder="Otro valor" value={otroValor} onChange={(e) => setOtroValor(e.target.value.replace(/\D/g, ""))} />
              <button className="principal">Agregar</button>
            </form>
            {libres.length > 0 && (
              <p className="nota">En esta {palabra}: {libres.map((x) => `${x.comida ? "🍽 " : ""}${x.nombre ?? "Mecato"} ${pesos(x.precio)}`).join(" + ")}</p>
            )}
          </div>
        </div>
      )}


      {error && <p className="error flotante">{error}</p>}
      <div className="pie-fijo">
        {!cuenta && (
          <button className="secundario" onClick={() => confirmar(true)} disabled={n === 0}>Cobrar ya</button>
        )}
        {n > 0 && <button className="secundario chico" onClick={() => { setCant({}); setLibres([]); setPaquetes([]); }}>Limpiar</button>}
        <button className="principal grande" onClick={() => confirmar(false)} disabled={n === 0}>
          {cuenta ? `Anotar ${palabra}` : "Abrir y anotar"} {n > 0 && `· ${n} · ${pesos(valor)}`}
        </button>
      </div>
    </main>
  );
}

// ── Detalle de la cuenta ───────────────────────────────────────────────

function NoExiste({ nav }: { nav: Nav }) {
  return (
    <main className="vacio-pantalla">
      <p>Esta cuenta ya no está en este celular.</p>
      <button className="principal" onClick={() => nav.aInicio()}>Ir a cuentas</button>
    </main>
  );
}

interface Renglon { producto: string; nombre: string; cantidad: number; precio?: number; valor: number; comida?: boolean }

function resumen(c: Cuenta): Renglon[] {
  const m = new Map<string, Renglon>();
  for (const l of c.lineas) {
    if (l.anulada) continue;
    const k = `${l.producto}:${l.nombre}:${l.precio}:${l.comida ? 1 : 0}`;
    const x = m.get(k) ?? { producto: l.producto, nombre: l.nombre, precio: l.precio, cantidad: 0, valor: 0, comida: l.comida };
    x.cantidad += l.cantidad;
    x.valor += l.cantidad * l.precio;
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

/** Mismo color del botón de anotar: el ojo reconoce el producto antes de leerlo. */
const colorDe = (producto: string) => {
  const p = productoDe(sinc.visible, producto);
  return p ? { background: p.fondo, color: p.texto } : undefined;
};

function TarjetasProducto({ items }: { items: Renglon[] }) {
  if (!items.length) return <p className="vacio">Todavía no hay nada anotado.</p>;
  return (
    <div className="prod-tarjetas">
      {items.map((r) => (
        <div key={`${r.producto}:${r.nombre}:${r.precio}:${r.comida}`} className={`prod-tarjeta${r.producto === "otro" ? " otro" : ""}${r.comida ? " es-comida" : ""}`} style={r.comida ? undefined : colorDe(r.producto)}>
          <span className="cant">{r.cantidad}</span>
          <span className="nom">{r.comida ? "🍽 " : ""}{r.nombre}</span>
          {r.precio != null && <span className="unit">× {pesos(r.precio)}</span>}
          <strong className="sub">{pesos(r.valor)}</strong>
        </div>
      ))}
    </div>
  );
}

function Detalle({ nav, id }: { nav: Nav; id: string }) {
  const c = sinc.visible.cuentas[id];
  const [modo, setModo] = useState<"resumen" | "rondas">("resumen");
  const [anulando, setAnulando] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [renombrar, setRenombrar] = useState<string | null>(null);
  const [cliente, setCliente] = useState(false);
  if (!c) return <NoExiste nav={nav} />;

  const s = situacion(c);
  const palabra = palabraRonda(c);
  const plural = palabra === "chico" ? "chicos" : "pedidas";
  const tipo = iconoTipo(c);

  if (cliente) {
    return (
      <main className="cliente" onClick={() => setCliente(false)}>
        <h1>{c.nombre}</h1>
        {resumen(c).map((r) => (
          <p key={`${r.producto}:${r.nombre}:${r.precio}`}><span>{r.cantidad} {r.nombre}</span><span>{pesos(r.valor)}</span></p>
        ))}
        {totalComida(c) > 0 && (
          <>
            <p className="parte"><span>Barra</span><span>{pesos(total(c) - totalComida(c))}</span></p>
            <p className="parte"><span>🍽 Comida</span><span>{pesos(totalComida(c))}</span></p>
          </>
        )}
        <p className="total-cliente"><span>Total</span><span>{pesos(saldo(c))}</span></p>
        <small>Toque para volver</small>
      </main>
    );
  }

  return (
    <main className="detalle">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>{c.nombre}</strong>
        <button className="quien" onClick={() => setMenu(!menu)} aria-label="Más opciones">⋮</button>
      </header>
      {menu && (
        <div className="menu-persona">
          <button onClick={() => { setRenombrar(c.nombre); setMenu(false); }}>Cambiar nombre</button>
          <button onClick={() => { setCliente(true); setMenu(false); }}>Mostrar al cliente</button>
          {s === "abierta" && (
            <button className="peligro" onClick={() => {
              sinc.emitir({ t: "anular_cuenta", cuenta: c.id });
              nav.aInicio();
              ponerAviso({ texto: "Cuenta anulada", deshacer: () => sinc.emitir({ t: "reabrir", cuenta: c.id }) });
            }}>Anular cuenta</button>
          )}
        </div>
      )}
      {renombrar !== null && (
        <form className="renombrar" onSubmit={(e) => {
          e.preventDefault();
          if (renombrar.trim()) sinc.emitir({ t: "renombrar", cuenta: c.id, nombre: renombrar });
          setRenombrar(null);
        }}>
          <input value={renombrar} onChange={(e) => setRenombrar(e.target.value)} autoFocus />
          <button className="principal">Guardar</button>
        </form>
      )}

      <section className="cabeza-total">
        {tipo && <span className="tipo">{tipo}</span>}
        <span className="total">{pesos(s === "abierta" ? saldo(c) : total(c))}</span>
        <span className="meta">{unidades(c)} productos · {c.rondas.length} {c.rondas.length === 1 ? palabra : plural}</span>
        {totalComida(c) > 0 && <Desglose c={c} />}
        {s === "cobrada" && <span className="estado cobrada">Cobrada · {c.pagos.filter((p) => !p.deshecho).map((p) => `${p.medio} por ${p.persona}`).join(", ")}</span>}
        {s === "comida" && <span className="estado comida">Pasada a comida{c.comidaCobrada ? " · ya cobrada allá" : " · falta cobrar en comida"}</span>}
        {s === "anulada" && <span className="estado anulada">Anulada</span>}
        {c.reabierta && <span className="alerta">Se anotó después del cobro. Falta cobrar {pesos(saldo(c))}</span>}
      </section>

      <div className="chips centro">
        <button className={modo === "resumen" ? "chip activo" : "chip"} onClick={() => setModo("resumen")}>Resumen</button>
        <button className={modo === "rondas" ? "chip activo" : "chip"} onClick={() => setModo("rondas")}>{palabra === "chico" ? "Chicos" : "Pedidas"}</button>
      </div>

      {modo === "resumen" ? (
        <>
          {textoPaquetes(contarPaquetes(c.lineas)) && (
            <p className="incluye">Incluye {textoPaquetes(contarPaquetes(c.lineas))}</p>
          )}
          <TarjetasProducto items={resumen(c)} />
        </>
      ) : (
        <>
          {s === "abierta" && <p className="nota centrada">Toque un producto para cambiar la cantidad o anularlo.</p>}
          {[...c.rondas].reverse().map((r) => {
            const lineas = c.lineas.filter((l) => l.ronda === r.id);
            const sub = lineas.reduce((t, l) => t + (l.anulada ? 0 : l.cantidad * l.precio), 0);
            const elegida = lineas.find((l) => l.id === anulando);
            return (
              <section key={r.id} className="ronda-tarjeta">
                <header>
                  <strong>{palabra === "chico" ? "Chico" : "Pedida"} {r.numero}</strong>
                  <span className="tenue">{horaDe(r.en)} · {r.persona}</span>
                  <strong className="sub">{pesos(sub)}</strong>
                </header>
                {(() => {
                  const ficha = (l: Linea) => (
                    <button
                      key={l.id}
                      className={`ficha${l.anulada ? " anulada" : ""}${anulando === l.id ? " elegida" : ""}`}
                      style={l.anulada ? undefined : colorDe(l.producto)}
                      disabled={!!l.anulada || (s !== "abierta" && !productoDe(sinc.visible, l.producto)?.conNombre)}
                      onClick={() => setAnulando(anulando === l.id ? null : l.id)}
                    >
                      <b>{l.cantidad}</b> {l.comida ? "🍽 " : ""}{l.nombre}{l.editada && !l.anulada ? " ✎" : ""}
                    </button>
                  );
                  const { sueltas, grupos } = porPaquete(lineas);
                  return (
                    <>
                      {grupos.map((g) => (
                        <div key={g.paquete.id} className="paquete">
                          <span className="etiqueta-paquete">
                            📦 {nombrePaquete(g.paquete)} · {g.lineas.reduce((t, l) => t + (l.anulada ? 0 : l.cantidad), 0)}
                          </span>
                          <div className="fichas">{g.lineas.map(ficha)}</div>
                        </div>
                      ))}
                      {sueltas.length > 0 && <div className="fichas">{sueltas.map(ficha)}</div>}
                    </>
                  );
                })()}
                {elegida && <EditarLinea c={c} l={elegida} soloEtiqueta={s !== "abierta"} cerrar={() => setAnulando(null)} />}
              </section>
            );
          })}
        </>
      )}

      <div className="pie-fijo">
        {s === "abierta" && (
          <>
            <button className="secundario" onClick={() => nav.ir({ v: "anotar", cuenta: c.id })}>＋ {palabra === "chico" ? "Chico" : "Pedida"}</button>
            {c.rondas.length > 0 && <button className="secundario" onClick={() => nav.ir({ v: "anotar", cuenta: c.id, repetir: true })}>↻ Repetir</button>}
            <button className="principal grande" disabled={saldo(c) <= 0} onClick={() => nav.ir({ v: "cobrar", id: c.id })}>Cobrar</button>
          </>
        )}
        {s === "comida" && !c.comidaCobrada && (
          <button className="principal grande" onClick={() => sinc.emitir({ t: "comida_cobrada", cuenta: c.id, valor: true })}>Ya se cobró en comida</button>
        )}
        {(s === "cobrada" || s === "comida" || s === "anulada") && (
          <button className="secundario" onClick={() => sinc.emitir({ t: "reabrir", cuenta: c.id })}>Reabrir</button>
        )}
      </div>
    </main>
  );
}

/** Total partido en barra y comida, para cuando la barra cobra la cuenta completa. */
function Desglose({ c }: { c: Cuenta }) {
  const comida = totalComida(c);
  return (
    <div className="desglose">
      <span>🍺 Barra <b>{pesos(total(c) - comida)}</b></span>
      <span>🍽 Comida <b>{pesos(comida)}</b></span>
    </div>
  );
}

/** Cambiar la cantidad de un producto ya anotado, o anularlo. */
function EditarLinea({ c, l, cerrar, soloEtiqueta }: { c: Cuenta; l: Linea; cerrar: () => void; soloEtiqueta?: boolean }) {
  const [n, setN] = useState(l.cantidad);
  return (
    <div className="editar-fila">
      <span className="titulo">{l.nombre}{l.paquete ? ` · ${nombrePaquete(l.paquete)}` : ""}</span>
      {l.editada && <span className="tenue">Antes eran {l.editada.antes} · cambió {l.editada.por}</span>}
      {productoDe(sinc.visible, l.producto)?.conNombre && (
        <div className="opciones">
          <button className={l.comida ? "chip" : "chip activo"} onClick={() => sinc.emitir({ t: "comida_linea", cuenta: c.id, linea: l.id, valor: false })}>🍺 Barra</button>
          <button className={l.comida ? "chip activo comida-chip" : "chip"} onClick={() => sinc.emitir({ t: "comida_linea", cuenta: c.id, linea: l.id, valor: true })}>🍽 Es comida</button>
        </div>
      )}
      {soloEtiqueta ? (
        <div className="fila-botones">
          <button className="secundario grande" onClick={cerrar}>Listo</button>
        </div>
      ) : (<>
      <div className="cantidad">
        <button aria-label="Uno menos" onClick={() => { vibrar(); setN((x) => Math.max(1, x - 1)); }}>−</button>
        <span>
          <b>{n}</b>
          <small>{pesos(n * l.precio)}</small>
        </span>
        <button aria-label="Uno más" onClick={() => { vibrar(); setN((x) => x + 1); }}>+</button>
      </div>
      <div className="fila-botones">
        <button className="secundario" onClick={cerrar}>Cancelar</button>
        <button className="peligro" onClick={() => { sinc.emitir({ t: "anular", cuenta: c.id, linea: l.id }); cerrar(); }}>Anular</button>
        <button className="principal grande" disabled={n === l.cantidad} onClick={() => {
          const antes = l.cantidad;
          sinc.emitir({ t: "cantidad", cuenta: c.id, linea: l.id, cantidad: n });
          cerrar();
          ponerAviso({
            texto: `${l.nombre}: ${antes} → ${n}`,
            deshacer: () => sinc.emitir({ t: "cantidad", cuenta: c.id, linea: l.id, cantidad: antes }),
          });
        }}>Guardar</button>
      </div>
      </>)}
    </div>
  );
}

// ── Cobrar ─────────────────────────────────────────────────────────────

function Cobrar({ nav, id }: { nav: Nav; id: string }) {
  const c = sinc.visible.cuentas[id];
  const [medio, setMedio] = useState<Exclude<Medio, "comida">>("efectivo");
  const [recibido, setRecibido] = useState<number | null>(null);
  const [otro, setOtro] = useState("");
  if (!c) return <NoExiste nav={nav} />;
  const valor = saldo(c);
  if (valor <= 0) return <NoExiste nav={nav} />;

  const billetes = [10_000, 20_000, 50_000, 100_000].filter((b) => b > valor).slice(0, 3);
  const cambio = medio === "efectivo" && recibido != null ? recibido - valor : null;

  const cobrar = (m: Medio) => {
    sinc.emitir({ t: "cobrar", cuenta: c.id, pago: crypto.randomUUID(), medio: m, recibido: m === "efectivo" ? recibido ?? undefined : undefined });
    nav.aInicio();
    ponerAviso({
      texto: m === "comida" ? `${c.nombre}: pasada a comida · ${pesos(valor)}` : `${c.nombre}: cobrada · ${pesos(valor)}`,
      deshacer: () => sinc.emitir({ t: "reabrir", cuenta: c.id }),
    });
  };

  return (
    <main className="cobrar">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>Cobrar · {c.nombre}</strong>
      </header>
      <p className="total">{pesos(valor)}</p>
      {totalComida(c) > 0 && <Desglose c={c} />}
      <div className="opciones">
        {(["efectivo", "nequi", "breve"] as const).map((m) => (
          <button key={m} className={medio === m ? "chip activo" : "chip"} onClick={() => setMedio(m)}>
            {m === "efectivo" ? "Efectivo" : m === "nequi" ? "Nequi" : "Breve"}
          </button>
        ))}
      </div>
      {medio === "efectivo" && (
        <section className="recibido">
          <p>¿Con cuánto paga?</p>
          <div className="opciones">
            <button className={recibido === valor ? "chip activo" : "chip"} onClick={() => { setRecibido(valor); setOtro(""); }}>Exacto</button>
            {billetes.map((b) => (
              <button key={b} className={recibido === b ? "chip activo" : "chip"} onClick={() => { setRecibido(b); setOtro(""); }}>{pesos(b)}</button>
            ))}
          </div>
          <input inputMode="numeric" placeholder="Otro valor" value={otro} onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            setOtro(v);
            setRecibido(v ? Number(v) : null);
          }} />
          {cambio != null && (
            <p className={cambio < 0 ? "cambio falta" : "cambio"}>
              {cambio < 0 ? `Faltan ${pesos(-cambio)}` : `Cambio: ${pesos(cambio)}`}
            </p>
          )}
        </section>
      )}
      <div className="pie-fijo">
        {c.tipo === "mesa" ? (
          <>
            <button className="principal grande" onClick={() => cobrar(medio)} disabled={cambio != null && cambio < 0}>Cobrar aquí</button>
            <button className="comida grande" onClick={() => cobrar("comida")}>Pasar a comida</button>
          </>
        ) : (
          <button className="principal grande" onClick={() => cobrar(medio)} disabled={cambio != null && cambio < 0}>Cobrar {pesos(valor)}</button>
        )}
      </div>
    </main>
  );
}

// ── Cocina ─────────────────────────────────────────────────────────────

function Cocina({ nav, cuentas }: { nav: Nav; cuentas: Cuenta[] }) {
  return (
    <section className="cocina">
      <p className="nota">Bebidas de mesas que se pasaron a la cuenta de comida y todavía no se han cobrado allá.</p>
      {cuentas.length === 0 && <p className="vacio">Nada pendiente en comida.</p>}
      {cuentas.sort((a, b) => (a.mesa ?? 0) - (b.mesa ?? 0)).map((c) => (
        <article key={c.id} className="caja">
          <header onClick={() => nav.ir({ v: "cuenta", id: c.id })}>
            <strong>{c.nombre}</strong>
            <strong>{pesos(total(c))}</strong>
          </header>
          <p className="tenue">{resumen(c).map((r) => `${r.cantidad} ${r.nombre}`).join(", ")}</p>
          <button className="principal" onClick={() => {
            sinc.emitir({ t: "comida_cobrada", cuenta: c.id, valor: true });
            ponerAviso({ texto: `${c.nombre}: cobrada en comida`, deshacer: () => sinc.emitir({ t: "comida_cobrada", cuenta: c.id, valor: false }) });
          }}>Ya se cobró en comida</button>
        </article>
      ))}
    </section>
  );
}

// ── El día y cierre de caja ────────────────────────────────────────────

function ElDia({ nav, cuentas }: { nav: Nav; cuentas: Cuenta[] }) {
  const hoy = jornada(Date.now());
  const [contado, setContado] = useState("");
  const porMedio: Record<Medio, number> = { efectivo: 0, nequi: 0, breve: 0, comida: 0 };
  const porProducto = new Map<string, Renglon>();
  let vendido = 0;
  let vendidoComida = 0;
  let recibidoEfectivo = 0;

  for (const c of cuentas) {
    if (c.anulada) continue;
    for (const p of c.pagos) {
      if (p.deshecho || jornada(p.en) !== hoy) continue;
      porMedio[p.medio] += p.monto;
      if (p.medio === "efectivo") recibidoEfectivo += p.monto;
    }
    const rondasHoy = new Set(c.rondas.filter((r) => jornada(r.en) === hoy).map((r) => r.id));
    for (const l of c.lineas) {
      if (l.anulada || !rondasHoy.has(l.ronda)) continue;
      vendido += l.precio * l.cantidad;
      if (l.comida) vendidoComida += l.precio * l.cantidad;
      const clave = `${l.producto}:${l.nombre}`;
      const x = porProducto.get(clave) ?? { producto: l.producto, nombre: l.nombre, cantidad: 0, valor: 0 };
      x.cantidad += l.cantidad;
      x.valor += l.precio * l.cantidad;
      porProducto.set(clave, x);
    }
  }
  const paquetesHoy = contarPaquetes(
    cuentas.filter((c) => !c.anulada).flatMap((c) => {
      const rondasHoy = new Set(c.rondas.filter((r) => jornada(r.en) === hoy).map((r) => r.id));
      return c.lineas.filter((l) => rondasHoy.has(l.ronda));
    }),
  );
  const abiertas = cuentas.filter((c) => situacion(c) === "abierta" && saldo(c) > 0);
  const porCobrar = abiertas.reduce((s, c) => s + saldo(c), 0);
  const diferencia = contado ? Number(contado) - recibidoEfectivo : null;

  return (
    <section className="dia">
      <div className="cifras">
        <div className="cifra grande"><span>Vendido hoy</span><strong>{pesos(vendido)}</strong></div>
        <div className="cifra"><span>Efectivo</span><strong>{pesos(porMedio.efectivo)}</strong></div>
        <div className="cifra"><span>Nequi</span><strong>{pesos(porMedio.nequi)}</strong></div>
        <div className="cifra"><span>Breve</span><strong>{pesos(porMedio.breve)}</strong></div>
        <div className="cifra en-comida"><span>Pasado a comida</span><strong>{pesos(porMedio.comida)}</strong></div>
        {(paquetesHoy.petacos > 0 || paquetesHoy.medios > 0) && (
          <div className="cifra"><span>Petacos vendidos</span><strong>{textoPaquetes(paquetesHoy)}</strong></div>
        )}
        {vendidoComida > 0 && (
          <>
            <div className="cifra"><span>🍺 Barra</span><strong>{pesos(vendido - vendidoComida)}</strong></div>
            <div className="cifra en-comida"><span>🍽 Comida cobrada en barra</span><strong>{pesos(vendidoComida)}</strong></div>
          </>
        )}
        <div className="cifra pendiente"><span>Por cobrar · {abiertas.length} {abiertas.length === 1 ? "cuenta" : "cuentas"}</span><strong>{pesos(porCobrar)}</strong></div>
      </div>

      <article className="caja">
        <h2>Cuadre de caja</h2>
        <p className="tenue">El efectivo que debería haber por ventas de hoy (sin contar la base): <strong>{pesos(recibidoEfectivo)}</strong></p>
        <input inputMode="numeric" placeholder="Efectivo contado" value={contado} onChange={(e) => setContado(e.target.value.replace(/\D/g, ""))} />
        {diferencia != null && (
          <p className={diferencia === 0 ? "cambio" : "cambio falta"}>
            {diferencia === 0 ? "Cuadra exacto" : diferencia > 0 ? `Sobran ${pesos(diferencia)}` : `Faltan ${pesos(-diferencia)}`}
          </p>
        )}
        {abiertas.length > 0 && (
          <p className="alerta">Quedan {abiertas.length} cuentas abiertas: {abiertas.map((c) => c.nombre).join(", ")}</p>
        )}
      </article>

      <article className="caja">
        <h2>Por producto</h2>
        <TarjetasProducto items={[...porProducto.values()].sort((a, b) => b.cantidad - a.cantidad)} />
      </article>
      <button className="enlace" onClick={() => nav.ir({ v: "inicio", pestana: "cuentas" }, true)}>Ver cuentas</button>
    </section>
  );
}

// ── Productos y precios (solo administrador) ───────────────────────────

const COLORES = [
  "#F2C230", "#9CC9EC", "#C8312A", "#2F7D3A", "#F6E7B8", "#7A1F1C", "#5B3A1E", "#E4002B",
  "#F5A04A", "#DCEFF7", "#1F4E8C", "#6B5744", "#A99681", "#F0E9DE", "#3A2C1E", "#8E44AD",
];

/** Texto oscuro o claro según qué se lee mejor sobre el fondo. */
function textoPara(fondo: string): string {
  const n = parseInt(fondo.slice(1), 16);
  const canal = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  return l > 0.35 ? "#241206" : "#FFFFFF";
}

function Productos({ nav }: { nav: Nav }) {
  const lista = catalogo(sinc.visible);
  const [ordenando, setOrdenando] = useState(false);
  /** Mueve un producto un puesto dentro de su sección y guarda el orden completo. */
  const mover = (p: Producto, d: -1 | 1) => {
    const ids = lista.map((x) => x.id);
    const seccion = SECCIONES.find((sec) => sec.categorias.includes(p.categoria))!;
    const vecinos = lista.filter((x) => seccion.categorias.includes(x.categoria));
    const j = vecinos.findIndex((x) => x.id === p.id) + d;
    if (j < 0 || j >= vecinos.length) return;
    const a = ids.indexOf(p.id), b = ids.indexOf(vecinos[j].id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    vibrar();
    sinc.emitir({ t: "orden", ids });
  };
  return (
    <main className="productos-admin">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>Productos y precios</strong>
      </header>
      <div className="opciones">
        <button className={ordenando ? "chip" : "chip activo"} onClick={() => setOrdenando(false)}>Editar</button>
        <button className={ordenando ? "chip activo" : "chip"} onClick={() => setOrdenando(true)}>Ordenar</button>
      </div>
      <p className="nota centrada">
        {ordenando ? "Use las flechas para mover cada botón. Así queda para todos al anotar." : "Toque un producto para cambiar su precio, nombre o color, u ocultarlo."}
      </p>
      {SECCIONES.map((s) => (
        <section key={s.titulo}>
          <h2 className="seccion">{s.titulo}</h2>
          <div className="productos">
            {lista.filter((p) => s.categorias.includes(p.categoria)).map((p) => (
              <div key={p.id} className="producto-celda">
                <button
                  className={`producto${p.conNombre ? " otro" : ""}${p.activo ? "" : " inactivo"}`}
                  style={{ background: p.fondo, color: p.texto }}
                  onClick={() => !ordenando && nav.ir({ v: "producto", id: p.id })}
                >
                  <span className="corto">{p.corto}</span>
                  <span className="precio">{!p.activo ? "oculto" : p.libre ? "valor libre" : pesos(p.precio!)}</span>
                  {p.activo && !p.libre && p.precioCancha ? <span className="precio-cancha">🎯 {pesos(p.precioCancha)}</span> : null}
                </button>
                {ordenando && (
                  <div className="flechas">
                    <button aria-label={`Mover ${p.nombre} antes`} onClick={() => mover(p, -1)}>◀</button>
                    <button aria-label={`Mover ${p.nombre} después`} onClick={() => mover(p, 1)}>▶</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="pie-fijo">
        <button className="principal grande" onClick={() => nav.ir({ v: "producto" })}>＋ Nuevo producto</button>
      </div>
    </main>
  );
}

function EditarProducto({ nav, id }: { nav: Nav; id?: string }) {
  const actual = id ? productoDe(sinc.visible, id) : undefined;
  const [nombre, setNombre] = useState(actual?.nombre ?? "");
  const [corto, setCorto] = useState(actual?.corto ?? "");
  const [categoria, setCategoria] = useState<Categoria>(actual?.categoria ?? "cerveza");
  const [precio, setPrecio] = useState(actual?.precio ? String(actual.precio) : "");
  const [precioCancha, setPrecioCancha] = useState(actual?.precioCancha ? String(actual.precioCancha) : "");
  const [fondo, setFondo] = useState(actual?.fondo ?? COLORES[0]);
  const [activo, setActivo] = useState(actual?.activo ?? true);
  const [error, setError] = useState("");
  const libre = !!actual?.libre;

  if (sinc.sesion?.persona !== "Administrador") {
    return <main className="vacio-pantalla"><p>Solo el administrador cambia productos y precios.</p></main>;
  }

  const guardar = () => {
    const n = nombre.trim();
    const v = Number(precio);
    if (!n) return setError("Escriba el nombre del producto.");
    if (!libre && activo && !(v > 0)) return setError("Escriba el precio.");
    if (v > TOPE_VALOR_LIBRE || Number(precioCancha) > TOPE_VALOR_LIBRE) return setError("Ese precio es demasiado alto.");
    const nuevoId = actual?.id ??
      `${n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "producto"}-${crypto.randomUUID().slice(0, 4)}`;
    const p: Producto = {
      id: nuevoId,
      nombre: n,
      corto: (corto.trim() || n).toUpperCase().slice(0, 16),
      categoria,
      precio: libre ? null : v > 0 ? Math.floor(v) : null,
      precioCancha: libre ? null : Number(precioCancha) > 0 ? Math.floor(Number(precioCancha)) : null,
      activo,
      fondo,
      texto: textoPara(fondo),
    };
    sinc.emitir({ t: "producto", producto: p });
    nav.volver();
    ponerAviso({ texto: actual ? `${n}: guardado` : `${n}: creado` });
  };

  return (
    <main className="editar-producto">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>{actual ? `Editar · ${actual.nombre}` : "Nuevo producto"}</strong>
      </header>

      <div className="vista-previa">
        <div className="producto" style={{ background: fondo, color: textoPara(fondo) }}>
          <span className="corto">{(corto.trim() || nombre.trim() || "PRODUCTO").toUpperCase().slice(0, 16)}</span>
          <span className="precio">{libre ? "valor libre" : precio ? pesos(Number(precio)) : "$ —"}</span>
          {!libre && Number(precioCancha) > 0 && <span className="precio-cancha">🎯 {pesos(Number(precioCancha))}</span>}
        </div>
      </div>

      <label className="campo">Nombre
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Club Colombia dorada" autoFocus={!actual} />
      </label>
      <label className="campo">Texto del botón (corto)
        <input value={corto} onChange={(e) => setCorto(e.target.value)} placeholder="Ej.: CLUB" maxLength={16} />
      </label>
      {!libre && (
        <label className="campo">Precio por unidad
          <input inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ""))} placeholder="Ej.: 3500" />
        </label>
      )}
      {!libre && (
        <label className="campo">Precio en cancha de tejo (opcional)
          <input inputMode="numeric" value={precioCancha} onChange={(e) => setPrecioCancha(e.target.value.replace(/\D/g, ""))} placeholder="Vacío = el mismo precio" />
          <small className="tenue">Se cobra en las cuentas de tipo cancha. Si lo deja vacío, se cobra el precio normal.</small>
        </label>
      )}
      <p className="etiqueta">Sección</p>
      <div className="chips">
        {CATEGORIAS.map((c) => (
          <button key={c.id} className={categoria === c.id ? "chip activo" : "chip"} onClick={() => setCategoria(c.id)}>{c.nombre}</button>
        ))}
      </div>
      <p className="etiqueta">Color del botón</p>
      <div className="colores">
        {COLORES.map((c) => (
          <button key={c} className={fondo === c ? "color activo" : "color"} style={{ background: c }} onClick={() => setFondo(c)} aria-label={`Color ${c}`} />
        ))}
        <input type="color" value={fondo} onChange={(e) => setFondo(e.target.value.toUpperCase())} aria-label="Otro color" />
      </div>
      <label className="interruptor">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        {activo ? "Visible para anotar" : "Oculto (no aparece al anotar)"}
      </label>
      {actual && PRODUCTOS.has(actual.id) && !libre && (
        <p className="nota">Cambiar el precio solo afecta lo que se anote de ahora en adelante. Lo ya anotado conserva su precio.</p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="pie-fijo">
        <button className="principal grande" onClick={guardar}>{actual ? "Guardar cambios" : "Crear producto"}</button>
      </div>
    </main>
  );
}
