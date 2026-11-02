import { useState } from "react";
import { jornada, saldo, situacion, type Cuenta, type Medio } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";
import { TarjetasProducto } from "../componentes/TarjetasProducto";
import type { Renglon } from "../cuentas";
import type { Nav } from "../navegacion";
import { cerrarConEnter } from "../teclado";
import { contarPaquetes, textoPaquetes } from "../paquetes";

const enTablet = () => typeof matchMedia === "function" && matchMedia("(min-width: 700px)").matches;

export function ElDia({ nav, cuentas }: { nav: Nav; cuentas: Cuenta[] }) {
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
      {/* Lo que se hace al cerrar va arriba: vendido y cuadre de caja (C10). */}
      <div className="cifra grande"><span>Vendido hoy</span><strong>{pesos(vendido)}</strong></div>

      <article className="caja">
        <h2>Cuadre de caja</h2>
        <p className="tenue">El efectivo que debería haber por ventas de hoy (sin contar la base): <strong>{pesos(recibidoEfectivo)}</strong></p>
        <input inputMode="numeric" enterKeyHint="done" onKeyDown={cerrarConEnter} placeholder="Efectivo contado" value={contado} onChange={(e) => setContado(e.target.value.replace(/\D/g, ""))} />
        {diferencia != null && (
          <p className={diferencia === 0 ? "cambio" : "cambio falta"}>
            {diferencia === 0 ? "Cuadra exacto" : diferencia > 0 ? `Sobran ${pesos(diferencia)}` : `Faltan ${pesos(-diferencia)}`}
          </p>
        )}
        {abiertas.length > 0 && (
          <p className="alerta">{abiertas.length === 1 ? "Queda 1 cuenta abierta" : `Quedan ${abiertas.length} cuentas abiertas`}: {abiertas.map((c) => c.nombre).join(", ")}</p>
        )}
      </article>

      <div className="cifras">
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

      {/* Plegable: cerrado en teléfono, abierto en la tablet. */}
      <details className="caja por-producto" open={enTablet()}>
        <summary><h2>Por producto</h2></summary>
        <TarjetasProducto items={[...porProducto.values()].sort((a, b) => b.cantidad - a.cantidad)} />
      </details>
      <button className="enlace" onClick={() => nav.ir({ v: "inicio", pestana: "cuentas" }, true)}>Ver cuentas</button>
    </section>
  );
}
