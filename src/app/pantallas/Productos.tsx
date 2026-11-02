import { useState } from "react";
import { SECCIONES, type Producto } from "../../dominio/catalogo";
import { catalogo } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";
import { vibrar } from "../vibrar";

export function Productos({ nav }: { nav: Nav }) {
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
