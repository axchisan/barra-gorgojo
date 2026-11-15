// Escoger productos del catálogo en una hoja: para agregar a una pedida ya anotada o para
// cambiar un producto por otro (edición de la pedida, 2026-11-15). Los de valor libre
// (mecato, «Otro») no salen: esos se anotan como pedida nueva.
import { useState } from "react";
import { SECCIONES_COMIDA, type Producto } from "../../dominio/catalogo";
import { catalogo, precioPara, type ModoPrecio, type TipoCuenta } from "../../dominio/estado";
import { pesos, precioBoton } from "../../dominio/formato";
import { useAtrasCierra } from "../navegacion";
import { sinc } from "../sincronizacion";
import { vibrar } from "../vibrar";

export interface Elegido { producto: string; cantidad: number }

export function ElegirProductos({ titulo, varios, tipo, modo, sinProducto, cerrar, listo }: {
  titulo: string;
  /** Varios con cantidades (agregar) o uno solo con un toque (cambiar). */
  varios: boolean;
  /** Tipo de la cuenta, para mostrar el precio que aplica (cancha). */
  tipo: TipoCuenta;
  /** En las canchas: el precio de la pedida (los adicionales van a precio normal). */
  modo?: ModoPrecio;
  /** Producto que no se ofrece (el que se está cambiando). */
  sinProducto?: string;
  cerrar: () => void;
  listo: (elegidos: Elegido[]) => void;
}) {
  useAtrasCierra(true, cerrar);
  const [cant, setCant] = useState<Record<string, number>>({});
  const conComida = sinc.tieneArea("comida");
  const productos = catalogo(sinc.visible).filter((p) => p.activo && !p.libre && p.id !== sinProducto && (conComida || p.categoria !== "comida"));
  const precio = (p: Producto) => precioPara(p, modo === "normal" ? undefined : tipo) ?? 0;
  const n = Object.values(cant).reduce((a, b) => a + b, 0);
  const valor = Object.entries(cant).reduce((t, [id, k]) => { const p = productos.find((x) => x.id === id); return t + (p ? precio(p) * k : 0); }, 0);
  const tocar = (p: Producto) => {
    vibrar();
    if (!varios) { listo([{ producto: p.id, cantidad: 1 }]); cerrar(); return; }
    setCant((c) => ({ ...c, [p.id]: (c[p.id] ?? 0) + 1 }));
  };
  return (
    <div className="hoja" onClick={cerrar}>
      <div className="hoja-cuerpo elegir-productos" onClick={(e) => e.stopPropagation()}>
        <header className="cabeza-hoja">
          <h2>{titulo}</h2>
          <button className="cerrar-hoja" aria-label="Cerrar" onClick={cerrar}>✕</button>
        </header>
        {SECCIONES_COMIDA.map((s) => {
          const lista = productos.filter((p) => s.categorias.includes(p.categoria));
          if (!lista.length) return null;
          return (
            <section key={s.titulo}>
              <h3 className="seccion">{s.titulo}</h3>
              <div className="productos">
                {lista.map((p) => (
                  <div key={p.id} className="producto-celda">
                    <button className="producto" style={{ background: p.fondo, color: p.texto }} onClick={() => tocar(p)}>
                      <span className="corto">{p.corto}</span>
                      <span className="precio">{precioBoton(precio(p))}</span>
                    </button>
                    {varios && (cant[p.id] ?? 0) > 0 && (
                      <button className="contador" aria-label={`Quitar una ${p.nombre}`} onClick={() => setCant((c) => ({ ...c, [p.id]: Math.max(0, (c[p.id] ?? 0) - 1) }))}>
                        {cant[p.id]}<small>−</small>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        {varios && (
          <button className="principal grande" disabled={n === 0} onClick={() => {
            listo(Object.entries(cant).filter(([, k]) => k > 0).map(([producto, cantidad]) => ({ producto, cantidad })));
            cerrar();
          }}>{n ? `Agregar ${n} · ${pesos(valor)}` : "Toque los productos"}</button>
        )}
      </div>
    </div>
  );
}
