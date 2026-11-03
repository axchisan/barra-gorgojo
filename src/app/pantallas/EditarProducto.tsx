import { useState } from "react";
import { CATEGORIAS, TOPE_VALOR_LIBRE, type Categoria, type Producto } from "../../dominio/catalogo";
import { producto as productoDe } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import { COLORES, textoPara } from "../colores";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";

export function EditarProducto({ nav, id }: { nav: Nav; id?: string }) {
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

  if (!sinc.esAdministrador) {
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
