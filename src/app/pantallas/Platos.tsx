// Crear varios platos de una vez (docs/14): la carta de comida se arma en un minuto, sin
// pasar producto por producto. Los nombres y precios los escribe el administrador: el
// código no trae datos del negocio (regla 16).
import { useState } from "react";
import { TOPE_VALOR_LIBRE, type Producto } from "../../dominio/catalogo";
import { catalogo } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import { COLORES, textoPara } from "../colores";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";
import { cerrarConEnter } from "../teclado";

/** `corto`: el texto del botón; en un plato de varios precios, sin el precio (ya sale abajo). */
interface Fila { nombre: string; precio: string; notas: string; corto?: string }
const vacia = (): Fila => ({ nombre: "", precio: "", notas: "" });
/** «20» o «20.000» → 20000: en la cocina se dice en miles. */
const aPesos = (t: string) => { const v = Number(t.replace(/\D/g, "")); return v > 0 && v < 1000 ? v * 1000 : v; };
const idDe = (n: string) => `${n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "plato"}-${crypto.randomUUID().slice(0, 4)}`;

export function Platos({ nav }: { nav: Nav }) {
  const [filas, setFilas] = useState<Fila[]>([vacia(), vacia(), vacia()]);
  const [base, setBase] = useState("");
  const [precios, setPrecios] = useState("");
  const [notasBase, setNotasBase] = useState("");
  const [error, setError] = useState("");
  if (!sinc.esAdministrador) return <main className="vacio-pantalla"><p>Solo el administrador crea platos.</p></main>;

  const yaHay = catalogo(sinc.visible).filter((p) => p.categoria === "comida");
  const poner = (i: number, k: keyof Fila, v: string) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const listas = filas.filter((f) => f.nombre.trim() && aPesos(f.precio) > 0);

  /** El mismo plato en varios precios: un botón por precio («Picada $ 20.000», …). */
  const porPrecios = () => {
    const n = base.trim();
    const vs = precios.split(/[\s,;]+/).map(aPesos).filter((v) => v > 0);
    if (!n || !vs.length) return setError("Escriba el nombre y los precios, separados por espacios.");
    setFilas((f) => [...f.filter((x) => x.nombre.trim() || x.precio), ...vs.map((v) => ({ nombre: `${n} ${pesos(v)}`, precio: String(v), notas: notasBase, corto: n }))]);
    setBase(""); setPrecios(""); setNotasBase(""); setError("");
  };

  const crear = () => {
    if (!listas.length) return setError("Escriba al menos un plato con su precio.");
    if (listas.some((f) => aPesos(f.precio) > TOPE_VALOR_LIBRE)) return setError("Hay un precio demasiado alto.");
    listas.forEach((f, i) => {
      const fondo = COLORES[(yaHay.length + i) % COLORES.length];
      const notas = [...new Set(f.notas.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 12).map((x) => x.slice(0, 30));
      const nombre = f.nombre.trim().slice(0, 40);
      const p: Producto = {
        id: idDe(nombre), nombre, corto: (f.corto?.trim() || nombre).toUpperCase().slice(0, 16), categoria: "comida",
        precio: Math.floor(aPesos(f.precio)), precioCancha: null, activo: true, fondo, texto: textoPara(fondo),
        ...(notas.length ? { notas } : {}),
      };
      sinc.emitir({ t: "producto", producto: p });
    });
    ponerAviso({ texto: `${listas.length === 1 ? "Un plato creado" : `${listas.length} platos creados`}` });
    nav.volver();
  };

  return (
    <main className="platos-admin">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>Crear platos</strong>
      </header>
      {yaHay.length > 0 && <p className="nota">Ya hay {yaHay.length} {yaHay.length === 1 ? "plato" : "platos"}. Para cambiar uno, tóquelo en «Productos y precios».</p>}

      <section className="caja">
        <h2>Un plato en varios precios</h2>
        <p className="tenue">Un botón por precio. Los precios en miles: «20 25 30» son $ 20.000, $ 25.000 y $ 30.000.</p>
        <input placeholder="Nombre (ej.: Picada)" aria-label="Nombre del plato" autoCapitalize="sentences" enterKeyHint="next" value={base} onChange={(e) => setBase(e.target.value)} />
        <input placeholder="Precios: 20 25 30 40" aria-label="Precios" inputMode="decimal" enterKeyHint="next" value={precios} onChange={(e) => setPrecios(e.target.value)} />
        <input placeholder="Notas rápidas (opcional): solo carne, más yuca" aria-label="Notas rápidas de esos platos" enterKeyHint="done" onKeyDown={cerrarConEnter} value={notasBase} onChange={(e) => setNotasBase(e.target.value)} />
        <button className="secundario" onClick={porPrecios}>Agregar a la lista</button>
      </section>

      <section className="caja">
        <h2>Platos a crear</h2>
        {filas.map((f, i) => (
          <div key={i} className="fila-plato">
            <input placeholder="Nombre" aria-label={`Nombre del plato ${i + 1}`} autoCapitalize="sentences" value={f.nombre} onChange={(e) => { poner(i, "nombre", e.target.value); poner(i, "corto", ""); }} />
            <input placeholder="Precio" aria-label={`Precio del plato ${i + 1}`} inputMode="numeric" value={f.precio} onChange={(e) => poner(i, "precio", e.target.value.replace(/[^\d.]/g, ""))} />
            <input className="notas" placeholder="Notas (opcional): sin cebolla, más yuca" aria-label={`Notas del plato ${i + 1}`} value={f.notas} onChange={(e) => poner(i, "notas", e.target.value)} />
            {f.precio && aPesos(f.precio) > 0 && <small className="tenue">{pesos(aPesos(f.precio))}</small>}
          </div>
        ))}
        <button className="enlace" onClick={() => setFilas((f) => [...f, vacia()])}>＋ Otra fila</button>
      </section>
      {error && <p className="error">{error}</p>}
      <div className="pie-fijo">
        <button className="principal grande" onClick={crear} disabled={!listas.length}>
          {listas.length ? `Crear ${listas.length} ${listas.length === 1 ? "plato" : "platos"}` : "Crear platos"}
        </button>
      </div>
    </main>
  );
}
