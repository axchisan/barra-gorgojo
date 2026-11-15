import { useEffect, useMemo, useState } from "react";
import { MEDIO_PETACO, PETACO, SECCIONES, SECCIONES_COMIDA, type Producto } from "../../dominio/catalogo";
import {
  catalogo, jornada, precioPara, producto as productoDe, saldo, situacion,
  type Cancha, type ModoPrecio, type TipoCuenta,
} from "../../dominio/estado";
import { nombreCancha, palabraRonda, pesos } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import { HojaLibre, type Libre } from "../componentes/HojaLibre";
import { HojaMixto } from "../componentes/HojaMixto";
import { HojaNota, HojaPlato } from "../componentes/HojaNota";
import { NoExiste } from "../componentes/NoExiste";
import type { Nav } from "../navegacion";
import { describir, nombrePaquete, type PaqueteEnArmado } from "../paquetes";
import { sinc } from "../sincronizacion";
import { cerrarConEnter } from "../teclado";
import { vibrar } from "../vibrar";

// En el carrito, un plato con nota va aparte: la clave es «producto|nota».
const idDe = (clave: string) => clave.split("|")[0];
const notaDe = (clave: string) => (clave.includes("|") ? clave.slice(clave.indexOf("|") + 1) : undefined);

const TIPOS = [["grupo", "👥", "Grupo"], ["persona", "👤", "Persona"], ["mesa", "🍽", "Mesa"], ["cancha", "🎯", "Cancha"]] as const;

export function Anotar({ nav, cuentaId, repetir, despacho = false }: { nav: Nav; cuentaId?: string; repetir?: boolean; despacho?: boolean }) {
  const cuenta = cuentaId ? sinc.visible.cuentas[cuentaId] : undefined;
  // «Repetir» trae la última pedida. En las canchas, el último chico: los adicionales
  // (algo suelto después del chivo) solo si no hay ningún chico.
  const ultima = useMemo(() => {
    if (!cuenta) return null;
    const buscar = (sirve: (adicional: boolean) => boolean) => {
      for (let i = cuenta.rondas.length - 1; i >= 0; i--) {
        if (!sirve(!!cuenta.rondas[i].adicional)) continue;
        const lineas = cuenta.lineas.filter((l) => l.ronda === cuenta.rondas[i].id && !l.anulada);
        if (lineas.length) return lineas;
      }
      return null;
    };
    return (cuenta.tipo === "cancha" ? buscar((ad) => !ad) : null) ?? buscar(() => true);
  }, [cuenta]);

  // El panel de comida (docs/14): platos primero, con notas; las bebidas quedan por despachar.
  // Quien tiene comida anota con dos pestañas, Comida y Bebidas: en su panel abre en Comida,
  // en el de la barra en Bebidas. Quien solo tiene barra ve las bebidas, como siempre.
  const enComida = sinc.panel === "comida";
  const conComida = sinc.tieneArea("comida");
  const [vista, setVista] = useState<"comida" | "bebidas">(enComida && !despacho ? "comida" : "bebidas");
  // Pedido rápido a la barra (docs/14): solo bebidas, con detalles, a una cuenta nueva o abierta.
  const [detalle, setDetalle] = useState("");
  const [destino, setDestino] = useState<string | null>(null);
  const destinoCuenta = despacho && destino ? sinc.visible.cuentas[destino] : undefined;
  const secciones = !conComida ? SECCIONES : vista === "comida" ? SECCIONES_COMIDA.filter((x) => x.categorias.includes("comida")) : SECCIONES;
  const [conNota, setConNota] = useState<Producto | null>(null);
  const [platoLibre, setPlatoLibre] = useState(false);
  const [cant, setCant] = useState<Record<string, number>>({});
  // Productos de valor libre: el mecato (solo valor) y «Otro» (nombre y valor).
  const [libres, setLibres] = useState<Libre[]>([]);
  const [esComida, setEsComida] = useState(false);
  const [hoja, setHoja] = useState<"mecato" | "otro" | null>(null);
  const [otroValor, setOtroValor] = useState("");
  const [otroNombre, setOtroNombre] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCuenta>(enComida ? "mesa" : "grupo");
  const [mesa, setMesa] = useState("");
  const [cancha, setCancha] = useState<Cancha | null>(null);
  const [error, setError] = useState("");
  // Las cervezas se pueden anotar por unidad, por medio petaco (15) o por petaco (30).
  const [paso, setPaso] = useState<1 | 15 | 30>(1);
  const [mixto, setMixto] = useState<15 | 30 | null>(null);
  const [mezcla, setMezcla] = useState<Record<string, number>>({});
  const productos = catalogo(sinc.visible);
  const cervezas = productos.filter((p) => p.activo && p.categoria === "cerveza" && !p.libre);
  const pasoDe = (p: Producto) => (p.categoria === "cerveza" ? paso : 1);
  const [paquetes, setPaquetes] = useState<PaqueteEnArmado[]>([]);
  // Canchas: por defecto la pedida es un chico; «Adicional» si es algo suelto después del chivo.
  const [adicional, setAdicionalCrudo] = useState(false);
  // Precio de la pedida en las canchas (docs/04): el chico a precio de cancha, el adicional
  // a precio normal; se puede escoger el otro. Cambiar chico/adicional vuelve al de siempre.
  const [aPrecioCancha, setAPrecioCancha] = useState<boolean | null>(null);
  const setAdicional = (v: boolean) => { setAdicionalCrudo(v); setAPrecioCancha(null); };
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
        for (let i = 0; i < x.cantidad; i++) l.push({ producto: x.producto, nombre: x.nombre, precio: x.precio, ...(x.comida ? { comida: true } : {}) });
      }
      else { const k = x.nota ? `${x.producto}|${x.nota}` : x.producto; c[k] = (c[k] ?? 0) + x.cantidad; }
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
  const tipoCuenta = cuenta?.tipo ?? destinoCuenta?.tipo ?? (despacho ? "grupo" : tipo);
  const esCancha = tipoCuenta === "cancha";
  const modo: ModoPrecio = !esCancha ? "normal" : !cuenta ? "cancha" : (aPrecioCancha ?? !adicional) ? "cancha" : "normal";
  const precioVisto = (p: Producto) => precioPara(p, modo === "cancha" ? tipoCuenta : undefined);
  const precioDe = (id: string) => { const p = productoDe(sinc.visible, idDe(id)); return p ? precioVisto(p) ?? 0 : 0; };
  /** Cuántos de un producto van, con nota o sin ella. */
  const cantDe = (id: string) => Object.entries(cant).reduce((s, [k, v]) => s + (idDe(k) === id ? v : 0), 0);
  const n =
    Object.values(cant).reduce((a, b) => a + b, 0) + libres.length +
    paquetes.reduce((s, pq) => s + Object.values(pq.items).reduce((a, b) => a + b, 0), 0);
  const valor =
    Object.entries(cant).reduce((s, [id, k]) => s + precioDe(id) * k, 0) +
    libres.reduce((a, b) => a + b.precio, 0) +
    paquetes.reduce((s, pq) => s + Object.entries(pq.items).reduce((t, [id, k]) => t + precioDe(id) * k, 0), 0);

  const esPlato = (clave: string) => productoDe(sinc.visible, idDe(clave))?.categoria === "comida";
  const nPlatos = Object.entries(cant).reduce((t, [k, v]) => t + (esPlato(k) ? v : 0), 0) + libres.filter((x) => x.comida && x.producto === "otro").length;
  const nBebidas = n - nPlatos;
  const hayPlatos = productos.some((p) => p.activo && p.categoria === "comida");

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
    if ((cant[p.id] ?? 0) > 0) return sumar(p.id, -1);
    const conNotas = Object.keys(cant).filter((k) => idDe(k) === p.id && cant[k] > 0);
    if (conNotas.length) sumar(conNotas[conNotas.length - 1], -1);
  };

  const palabra = palabraRonda(cuenta ?? { tipo });

  /** Lo que lleva la pedida, para el panel lateral en horizontal (C12). */
  const enLaPedida = [
    ...paquetes.map((pq) => ({ clave: pq.id, texto: `${nombrePaquete(pq)} · ${Object.entries(pq.items).map(([id, k]) => `${k} ${productoDe(sinc.visible, id)?.nombre ?? id}`).join(", ")}`, valor: Object.entries(pq.items).reduce((t, [id, k]) => t + precioDe(id) * k, 0) })),
    ...Object.entries(cant).filter(([, k]) => k > 0).map(([id, k]) => ({ clave: id, texto: `${k} ${productoDe(sinc.visible, idDe(id))?.nombre ?? id}${notaDe(id) ? ` · ${notaDe(id)}` : ""}`, valor: precioDe(id) * k })),
    ...libres.map((x, i) => ({ clave: `libre-${i}`, texto: `${x.comida ? "🍽 " : ""}${x.nombre ?? "Mecato"}`, valor: x.precio })),
  ];

  const lineas = () => {
    const ls = Object.entries(cant)
      .filter(([, k]) => k > 0)
      .map(([clave, cantidad]) => {
        const nota = notaDe(clave);
        return { id: crypto.randomUUID(), producto: idDe(clave), cantidad, precio: precioDe(clave) || undefined, ...(nota ? { nota } : {}) };
      });
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
    let id = cuentaId ?? destinoCuenta?.id;
    if (!id && despacho) {
      id = crypto.randomUUID();
      sinc.emitir({ t: "abrir", cuenta: id, nombre: detalle.trim().slice(0, 40) || "Pedido a la barra", tipo: "grupo" });
    }
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
    const esAdicional = adicional && (cuenta?.tipo ?? tipo) === "cancha";
    sinc.emitir({
      t: "anotar", cuenta: id, ronda: crypto.randomUUID(), lineas: ls,
      // Un pedido a la barra va siempre como de comida: así queda por despachar.
      area: despacho ? "comida" : sinc.panel,
      ...(esAdicional ? { adicional: true } : {}),
      ...((cuenta?.tipo ?? tipo) === "cancha" ? { precio: cuenta ? modo : ("cancha" as const) } : {}),
      ...(despacho && detalle.trim() ? { detalle: detalle.trim() } : {}),
    });
    const cuentaFinal = id;
    if (cobrarYa) return nav.ir({ v: "cobrar", id: cuentaFinal }, true);
    if (cuentaId) nav.volver();
    else nav.aInicio();
    const bebidas = (enComida || despacho) && ls.some((l) => productoDe(sinc.visible, l.producto)?.categoria !== "comida" && !("comida" in l && l.comida));
    ponerAviso({
      texto: despacho ? `Pedido enviado a la barra · ${n} · ${pesos(valor)}` : `Anotado · ${n} · ${pesos(valor)}${bebidas ? " · bebidas avisadas a la barra" : ""}`,
      deshacer: () => { for (const l of ls) sinc.emitir({ t: "anular", cuenta: cuentaFinal, linea: l.id }); },
    });
  };

  return (
    <main className="anotar">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>{despacho ? "🔔 Pedir a la barra" : cuenta ? cuenta.nombre : "Nueva cuenta"}</strong>
        {cuenta && <span className="valor-chico">{pesos(saldo(cuenta))}</span>}
        {/* Comida | Bebidas en la cabecera: no le quita espacio a los botones (C2). */}
        {conComida && !despacho && (
          <div className="segmentos pestanas-anotar" role="tablist" aria-label="Qué anotar">
            <button role="tab" aria-selected={vista === "comida"} aria-label={`Comida${nPlatos ? `: ${nPlatos}` : ""}`} className={vista === "comida" ? "activo comida-chip" : ""} onClick={() => setVista("comida")}>
              🍽<span className="largo"> Comida</span>{nPlatos ? <small> {nPlatos}</small> : null}
            </button>
            <button role="tab" aria-selected={vista === "bebidas"} aria-label={`Bebidas${nBebidas ? `: ${nBebidas}` : ""}`} className={vista === "bebidas" ? "activo" : ""} onClick={() => setVista("bebidas")}>
              🍺<span className="largo"> Bebidas</span>{nBebidas ? <small> {nBebidas}</small> : null}
            </button>
          </div>
        )}
      </header>

      {despacho && (
        <section className="pedido-barra">
          <input placeholder="Detalles: para el limón, para la mesa del fondo…" aria-label="Detalles del pedido" enterKeyHint="done" autoCapitalize="sentences"
            maxLength={80} onKeyDown={cerrarConEnter} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          <div className="chips destinos" role="group" aria-label="A qué cuenta va">
            <button className={destino === null ? "chip activo" : "chip"} aria-pressed={destino === null} onClick={() => setDestino(null)}>＋ Cuenta nueva</button>
            {Object.values(sinc.visible.cuentas)
              .filter((c) => situacion(c) === "abierta" && c.lineas.length > 0)
              .sort((a, b) => b.ultima - a.ultima)
              .slice(0, 12)
              .map((c) => (
                <button key={c.id} className={destino === c.id ? "chip activo" : "chip"} aria-pressed={destino === c.id} onClick={() => setDestino(c.id)}>{c.nombre}</button>
              ))}
          </div>
        </section>
      )}
      {!cuenta && !despacho && (
        <section className="nueva">
          {/* Tipo y lo que el tipo pide, en una sola fila (C3 de la revisión en teléfono). */}
          <div className="fila-nueva">
            <div className="segmentos tipos" role="group" aria-label="Tipo de cuenta">
              {TIPOS.map(([t, icono, texto]) => (
                <button key={t} className={tipo === t ? "activo" : ""} aria-pressed={tipo === t} aria-label={texto} title={texto}
                  onClick={() => { setTipo(t); setError(""); }}>
                  {icono}
                </button>
              ))}
            </div>
            {(tipo === "grupo" || tipo === "persona") && (
              <input placeholder="Nombre" enterKeyHint="done" autoCapitalize="sentences" onKeyDown={cerrarConEnter} aria-label={tipo === "grupo" ? "Nombre de la cuenta (opcional)" : "Nombre de la persona (opcional)"} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            )}
            {tipo === "mesa" && (
              <input className="numero" inputMode="numeric" enterKeyHint="done" onKeyDown={cerrarConEnter} placeholder="N.º de mesa" aria-label="Número de mesa" value={mesa} onChange={(e) => setMesa(e.target.value.replace(/\D/g, ""))} autoFocus />
            )}
            {tipo === "cancha" && (
              <div className="segmentos canchas" role="group" aria-label="Cancha">
                {(["1", "2", "pequena"] as const).map((k) => (
                  <button key={k} className={cancha === k ? "activo" : ""} aria-pressed={cancha === k} aria-label={`Cancha ${nombreCancha(k)}`} onClick={() => setCancha(k)}>
                    {k === "pequena" ? "Peq." : k}
                  </button>
                ))}
              </div>
            )}
          </div>
          {(tipo === "mesa" || tipo === "cancha") && (
            <input placeholder="Nombre (opcional): los de rojo" enterKeyHint="done" autoCapitalize="sentences" onKeyDown={cerrarConEnter} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          )}
        </section>
      )}

      {ultima && !despacho && (
        <button className="repetir" onClick={cargarUltima} title={describir(ultima)}>
          ↻ Repetir {palabra}: {describir(ultima)}
        </button>
      )}

      {conComida && vista === "comida" && !hayPlatos && (
        <div className="caja sin-platos">
          <p>Todavía no hay platos en la carta. {sinc.esAdministrador ? "Créelos una vez y quedan para todos." : "Pídale al administrador que cree los platos."}</p>
          {sinc.esAdministrador && <button className="principal" onClick={() => nav.ir({ v: "platos" })}>Crear los platos</button>}
        </div>
      )}
      {secciones.map((s) => (
        <section key={s.titulo}>
          <h2 className="seccion">{s.titulo}</h2>
          {enComida && !despacho && s.categorias.includes("cerveza") && <p className="nota despacho-nota">🔔 Las bebidas que anote aquí le llegan a la barra para despacharlas.</p>}
          {s.categorias.includes("cerveza") && (
            <div className="segmentos petacos" role="group" aria-label="Cómo se anotan las cervezas">
              <button className={paso === 1 ? "activo" : ""} aria-pressed={paso === 1} onClick={() => setPaso(1)}>Unidad</button>
              <button className={paso === MEDIO_PETACO ? "activo" : ""} aria-pressed={paso === MEDIO_PETACO} aria-label={`Medio petaco: ${MEDIO_PETACO}`} onClick={() => setPaso(MEDIO_PETACO)}>Medio <small>{MEDIO_PETACO}</small></button>
              <button className={paso === PETACO ? "activo" : ""} aria-pressed={paso === PETACO} aria-label={`Petaco: ${PETACO}`} onClick={() => setPaso(PETACO)}>Petaco <small>{PETACO}</small></button>
              <button className="mixto" aria-label="Petaco mixto" onClick={() => { setMezcla({}); setMixto(PETACO); setError(""); }}>Mixto</button>
            </div>
          )}
          {/* En modo petaco un toque suma 15 o 30: la cuadrícula de cervezas se marca (C4). */}
          <div className={s.categorias.includes("comida") ? "productos platos" : s.categorias.includes("cerveza") && paso > 1 ? "productos modo-paquete" : "productos"}>
            {productos.filter((p) => p.activo && s.categorias.includes(p.categoria)).map((p) => {
              const k = p.libre ? libres.filter((x) => x.producto === p.id && !(enComida && x.comida)).length : cantDe(p.id) + enPaquetes(p.id);
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
                  {p.categoria === "comida" && (
                    <button className="con-nota" aria-label={`${p.nombre} con nota`} onClick={() => setConNota(p)}>✎ nota</button>
                  )}
                  {k > 0 && (
                    <button
                      className="contador"
                      aria-label={`Quitar una ${p.nombre}`}
                      onClick={() => {
                        if (!p.libre) return quitar(p);
                        // En comida, los platos de otro valor tienen su propio contador.
                        const i = libres.map((x) => x.producto === p.id && !(enComida && x.comida)).lastIndexOf(true);
                        setLibres((l) => l.filter((_, j) => j !== i));
                      }}
                    >
                      {k}<small>−</small>
                    </button>
                  )}
                </div>
              );
            })}
            {s.categorias.includes("comida") && (
              <div className="producto-celda">
                <button className="producto otro plato-libre" onClick={() => setPlatoLibre(true)}>
                  <span className="corto">Otro valor</span>
                  <span className="precio">plato</span>
                </button>
                {libres.some((x) => x.comida) && (
                  <button className="contador" aria-label="Quitar un plato de otro valor" onClick={() => {
                    const i = libres.map((x) => !!x.comida).lastIndexOf(true);
                    setLibres((l) => l.filter((_, j) => j !== i));
                  }}>{libres.filter((x) => x.comida).length}<small>−</small></button>
                )}
              </div>
            )}
          </div>
          {s.categorias.includes("comida") && Object.keys(cant).some((k) => notaDe(k) && cant[k] > 0) && (
            <ul className="con-notas">
              {Object.entries(cant).filter(([k, v]) => notaDe(k) && v > 0).map(([k, v]) => (
                <li key={k}>
                  <span>{v} {productoDe(sinc.visible, idDe(k))?.nombre} · <b>{notaDe(k)}</b></span>
                  <button aria-label="Quitar uno" onClick={() => sumar(k, -1)}>✕</button>
                </li>
              ))}
            </ul>
          )}
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

      {conNota && <HojaNota producto={conNota} cerrar={() => setConNota(null)} agregar={(nota) => sumar(`${conNota.id}|${nota}`, 1)} />}
      {platoLibre && <HojaPlato cerrar={() => setPlatoLibre(false)} agregar={(nombre, precio) => setLibres((l) => [...l, { producto: "otro", nombre, precio, comida: true }])} />}
      {mixto && <HojaMixto mixto={mixto} setMixto={setMixto} mezcla={mezcla} setMezcla={setMezcla} cervezas={cervezas} setPaquetes={setPaquetes} />}

      {hoja && (
        <HojaLibre
          hoja={hoja} setHoja={setHoja} error={error} setError={setError}
          otroNombre={otroNombre} setOtroNombre={setOtroNombre} otroValor={otroValor} setOtroValor={setOtroValor}
          esComida={esComida} setEsComida={setEsComida} libres={libres} setLibres={setLibres} palabra={palabra}
        />
      )}


      {error && <p className="error flotante">{error}</p>}
      <div className={cuenta?.tipo === "cancha" ? "pie-fijo con-tipo-ronda" : "pie-fijo"}>
        {/* Solo se ve en horizontal, donde el pie pasa a ser un panel a la derecha. */}
        <div className="resumen-pedida" aria-hidden={enLaPedida.length === 0}>
          <h2 className="seccion">{cuenta ? `Esta ${palabra}` : "La cuenta nueva"}</h2>
          {enLaPedida.length === 0 ? <p className="nota">Toque los productos.</p> : (
            <ul>{enLaPedida.map((x) => <li key={x.clave}><span>{x.texto}</span><b>{pesos(x.valor)}</b></li>)}</ul>
          )}
          {/* El total va a la vista mientras se anota (en la tablet, al pie del panel). */}
          {n > 0 && (
            <div className="total-pedida">
              <span>{n} {n === 1 ? "producto" : "productos"}</span>
              <strong>{pesos(valor)}</strong>
              {(cuenta ?? destinoCuenta) && <small>La cuenta queda en {pesos(saldo((cuenta ?? destinoCuenta)!) + valor)}</small>}
            </div>
          )}
        </div>
        {!cuenta && !despacho && (
          <button className="secundario" onClick={() => confirmar(true)} disabled={n === 0}>Cobrar ya</button>
        )}
        {n > 0 && <button className="secundario chico" onClick={() => { setCant({}); setLibres([]); setPaquetes([]); }}>Limpiar</button>}
        {/* El primer pedido de una cancha siempre es chico: el selector sale al agregar. */}
        {cuenta?.tipo === "cancha" && adicional && (
          <button type="button" className={`precio-ronda-anotar${modo === "cancha" ? " cancha" : ""}`} aria-pressed={modo === "cancha"}
            onClick={() => setAPrecioCancha(modo !== "cancha")}>
            {modo === "cancha" ? "🎯 A precio de cancha" : "Precio normal"} · <u>cambiar</u>
          </button>
        )}
        {cuenta?.tipo === "cancha" && (
          <div className="segmentos tipo-ronda" role="group" aria-label="Chico o adicional">
            <button className={adicional ? "" : "activo"} aria-pressed={!adicional} onClick={() => setAdicional(false)}>Chico</button>
            <button className={adicional ? "activo" : ""} aria-pressed={adicional} onClick={() => setAdicional(true)}>Adicional</button>
          </div>
        )}
        <button className="principal grande" onClick={() => confirmar(false)} disabled={n === 0}>
          <span>{despacho ? "🔔 Pedir a la barra" : cuenta ? `Anotar ${adicional && tipoCuenta === "cancha" ? "adicional" : palabra}` : "Abrir y anotar"}</span>
          {n > 0 && <small className="detalle-boton">{n} · {pesos(valor)}</small>}
        </button>
      </div>
    </main>
  );
}
