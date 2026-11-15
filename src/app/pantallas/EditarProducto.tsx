import { useState } from "react";
import { CATEGORIAS, TOPE_VALOR_LIBRE, type Categoria, type Producto } from "../../dominio/catalogo";
import { catalogo, enCuadricula, opcionesDe, producto as productoDe } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import { COLORES, textoPara } from "../colores";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";
import { idNuevo, nombreOpcion, SABORES_GASEOSA } from "../sugerencias";
import { vibrar } from "../vibrar";

export function EditarProducto({ nav, id, padre: padreNuevo }: { nav: Nav; id?: string; padre?: string }) {
  const actual = id ? productoDe(sinc.visible, id) : undefined;
  // Una opción nueva (sabor, marca) empieza con lo de su producto general.
  const general = !actual && padreNuevo ? productoDe(sinc.visible, padreNuevo) : undefined;
  const base = actual ?? general;
  const [nombre, setNombre] = useState(actual?.nombre ?? "");
  const [corto, setCorto] = useState(actual?.corto ?? "");
  const [categoria, setCategoria] = useState<Categoria>(base?.categoria ?? "cerveza");
  const [precio, setPrecio] = useState(base?.precio ? String(base.precio) : "");
  const [precioCancha, setPrecioCancha] = useState(base?.precioCancha ? String(base.precioCancha) : "");
  const [fondo, setFondo] = useState(base?.fondo ?? COLORES[0]);
  const [padre, setPadre] = useState(actual?.padre ?? (general ? general.id : ""));
  const [activo, setActivo] = useState(actual?.activo ?? true);
  // Notas rápidas de un plato («solo carne», «más yuca»), separadas por comas.
  const [notas, setNotas] = useState((actual?.notas ?? []).join(", "));
  const [error, setError] = useState("");
  const libre = !!actual?.libre;
  // Productos que pueden tener opciones: los de la cuadrícula, menos «Otro» y este mismo.
  const generales = catalogo(sinc.visible).filter((p) => enCuadricula(sinc.visible, p) && !p.padre && !p.conNombre && p.id !== actual?.id);
  const opciones = actual && !actual.padre ? opcionesDe(sinc.visible, actual.id, true) : [];

  if (!sinc.esAdministrador) {
    return <main className="vacio-pantalla"><p>Solo el administrador cambia productos y precios.</p></main>;
  }

  const guardar = () => {
    const n = nombre.trim();
    const v = Number(precio);
    if (!n) return setError("Escriba el nombre del producto.");
    if (!libre && activo && !(v > 0)) return setError("Escriba el precio.");
    if (v > TOPE_VALOR_LIBRE || Number(precioCancha) > TOPE_VALOR_LIBRE) return setError("Ese precio es demasiado alto.");
    const nuevoId = actual?.id ?? idNuevo(n);
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
      // Un producto con opciones no puede ser opción de otro (un solo nivel).
      ...(padre && !opciones.length ? { padre } : {}),
    };
    const listaNotas = [...new Set(notas.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 12).map((x) => x.slice(0, 30));
    if (categoria === "comida" && listaNotas.length) p.notas = listaNotas;
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
      {categoria === "comida" && (
        <label className="campo">Notas rápidas (opcional)
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: solo carne, más yuca, sin ensalada" />
          <small className="tenue">Separadas por comas. Salen como botones al anotar el plato «con nota».</small>
        </label>
      )}
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
      {/* Opciones (docs/02): sabores o marcas que salen al mantener presionado el producto. */}
      {!actual?.conNombre && !opciones.length && (
        <label className="campo">Es opción de (sale al mantener presionado ese producto)
          <select value={padre} onChange={(e) => setPadre(e.target.value)}>
            <option value="">Ninguno: tiene su propio botón</option>
            {generales.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </label>
      )}
      {actual && !actual.padre && !actual.conNombre && <Opciones general={actual} opciones={opciones} nav={nav} />}
      {actual && !libre && (
        <p className="nota">Cambiar el precio solo afecta lo que se anote de ahora en adelante. Lo ya anotado conserva su precio.</p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="pie-fijo">
        <button className="principal grande" onClick={guardar}>{actual ? "Guardar cambios" : "Crear producto"}</button>
      </div>
    </main>
  );
}

/**
 * Las opciones de un producto general (sabores de la gaseosa, marcas de mecato): editar
 * cada una, ordenarlas, crear una, o crear varias de una vez (las gaseosas de Colombia ya
 * vienen en la lista). Cada opción es un producto completo.
 */
function Opciones({ general, opciones, nav }: { general: Producto; opciones: Producto[]; nav: Nav }) {
  const [varias, setVarias] = useState(false);
  /** Mueve una opción un puesto entre sus hermanas y guarda el orden completo. */
  const mover = (p: Producto, d: -1 | 1) => {
    const ids = catalogo(sinc.visible).map((x) => x.id);
    const j = opciones.findIndex((x) => x.id === p.id) + d;
    if (j < 0 || j >= opciones.length) return;
    const a = ids.indexOf(p.id), b = ids.indexOf(opciones[j].id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    vibrar();
    sinc.emitir({ t: "orden", ids });
  };
  return (
    <section className="caja opciones-producto">
      <h2>Opciones al mantener presionado</h2>
      <p className="nota">Un toque anota «{general.nombre}» sin detalle; manteniéndolo presionado se escoge cuál. Cada opción tiene su precio, color y orden.</p>
      {opciones.length === 0 && <p className="tenue">Todavía no tiene opciones.</p>}
      {opciones.map((o, i) => (
        <div key={o.id} className="fila-opcion">
          <button className={`producto mini${o.activo ? "" : " inactivo"}`} style={{ background: o.fondo, color: o.texto }} onClick={() => nav.ir({ v: "producto", id: o.id })}>
            <span className="corto">{o.corto}</span>
            <span className="precio">{!o.activo ? "oculto" : o.precio ? pesos(o.precio) : "sin precio"}</span>
          </button>
          <span className="nombre-opcion">{o.nombre}</span>
          <button className="chip" aria-label={`Subir ${o.nombre}`} disabled={i === 0} onClick={() => mover(o, -1)}>▲</button>
          <button className="chip" aria-label={`Bajar ${o.nombre}`} disabled={i === opciones.length - 1} onClick={() => mover(o, 1)}>▼</button>
        </div>
      ))}
      <div className="fila-botones">
        <button className="secundario" onClick={() => nav.ir({ v: "producto", padre: general.id })}>＋ Nueva opción</button>
        <button className="secundario" onClick={() => setVarias(true)}>＋ Varias de una vez</button>
      </div>
      {varias && <CrearVarias general={general} existentes={opciones} cerrar={() => setVarias(false)} />}
    </section>
  );
}

/** Crear varias opciones de una vez: las gaseosas de Colombia (en gaseosas) o nombres escritos. */
function CrearVarias({ general, existentes, cerrar }: { general: Producto; existentes: Producto[]; cerrar: () => void }) {
  const ya = new Set(existentes.map((o) => o.corto.toUpperCase()));
  const sugeridas = general.categoria === "gaseosa" ? SABORES_GASEOSA.filter((s) => !ya.has(s.nombre.toUpperCase().slice(0, 16))) : [];
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(sugeridas.filter((s) => s.comun).map((s) => s.nombre)));
  const [otras, setOtras] = useState("");
  const [precio, setPrecio] = useState(general.precio ? String(general.precio) : "");
  const [error, setError] = useState("");
  const escritas = [...new Set(otras.split(",").map((x) => x.trim()).filter(Boolean))].filter((x) => !ya.has(x.toUpperCase().slice(0, 16)) && !marcadas.has(x));
  const n = marcadas.size + escritas.length;
  const crear = () => {
    const v = Math.floor(Number(precio));
    if (!(v > 0) || v > TOPE_VALOR_LIBRE) return setError("Escriba el precio de cada opción.");
    if (!n) return setError("Escoja o escriba al menos una.");
    const nuevas = [
      ...sugeridas.filter((s) => marcadas.has(s.nombre)).map((s) => ({ sabor: s.nombre, fondo: s.fondo })),
      ...escritas.map((sabor) => ({ sabor, fondo: general.fondo })),
    ];
    for (const { sabor, fondo } of nuevas) {
      const nombre = nombreOpcion(sabor, general.nombre);
      sinc.emitir({ t: "producto", producto: {
        id: idNuevo(nombre), nombre, corto: sabor.toUpperCase().slice(0, 16), categoria: general.categoria,
        precio: v, precioCancha: general.precioCancha ?? null, activo: true, fondo, texto: textoPara(fondo), padre: general.id,
      } });
    }
    ponerAviso({ texto: `${nuevas.length} ${nuevas.length === 1 ? "opción creada" : "opciones creadas"} en ${general.nombre}` });
    cerrar();
  };
  return (
    <div className="crear-varias">
      {sugeridas.length > 0 && (
        <>
          <p className="etiqueta">Gaseosas que se venden en Colombia: marque las que tiene</p>
          <div className="chips">
            {sugeridas.map((s) => {
              const on = marcadas.has(s.nombre);
              return (
                <button key={s.nombre} className={on ? "chip activo" : "chip"} aria-pressed={on}
                  onClick={() => setMarcadas((m) => { const c = new Set(m); if (on) c.delete(s.nombre); else c.add(s.nombre); return c; })}>
                  <span className="punto-color" style={{ background: s.fondo }} /> {s.nombre}
                </button>
              );
            })}
          </div>
        </>
      )}
      <label className="campo">{sugeridas.length ? "Otras (separadas por comas)" : "Nombres de las opciones (separados por comas)"}
        <input value={otras} onChange={(e) => setOtras(e.target.value)} placeholder={general.categoria === "gaseosa" ? "Ej.: Hipinto, Big Cola" : "Ej.: Papas, Chitos, Maní"} />
      </label>
      <label className="campo">Precio de cada una
        <input inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/\D/g, ""))} placeholder="Ej.: 2500" />
        <small className="tenue">{general.precio ? `El de «${general.nombre}». ` : ""}Después se cambia el de cada una si alguna vale distinto.</small>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="fila-botones">
        <button className="secundario" onClick={cerrar}>Cancelar</button>
        <button className="principal" onClick={crear} disabled={!n}>Crear {n} {n === 1 ? "opción" : "opciones"}</button>
      </div>
    </div>
  );
}
