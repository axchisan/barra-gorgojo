// Auditoría (RF-74, E4 de docs/12): cada operación del registro en una frase, para que el
// administrador vea quién anotó, anuló, cobró, reabrió o cambió qué. Función pura: el
// servidor la usa con la cuenta como está ahora (de la proyección) para poner nombres y
// valores que la operación sola no trae.

import type { Cuenta, Estado, Operacion } from "./estado";
import { horaDe, nombreCancha, nombreRonda, pesos } from "./formato";

export interface Evento {
  seq: number;
  en: number;
  persona: string;
  t: Operacion["t"];
  cuenta?: string;
  cuentaNombre?: string;
  texto: string;
  /** Lo que conviene revisar: anulaciones, reaperturas, cambios de cantidad o de precio, cierres con diferencia. */
  atencion: boolean;
}

const medio = (m: string) => (m === "efectivo" ? "en efectivo" : m === "nequi" ? "por Nequi" : m === "breve" ? "por Breve" : m);

function tipoCuenta(c: Cuenta | undefined, op: Extract<Operacion, { t: "abrir" }>): string {
  if (op.tipo === "mesa") return `mesa ${op.mesa || c?.mesa || ""}`.trim();
  if (op.tipo === "cancha") return `cancha ${nombreCancha(op.cancha ?? c?.cancha ?? "")}`.trim();
  if (op.tipo === "domicilio") return `domicilio${op.direccion?.trim() ? ` a ${op.direccion.trim().slice(0, 80)}` : ""}`;
  return op.tipo === "rapida" ? "venta rápida" : op.tipo;
}

/** Cuánto cambió una pedida al cambiarle el precio: «4 Águila a $ 3.000». */
function cambioDePrecio(precios: Record<string, number> | undefined, cuenta?: Cuenta): string {
  if (!precios || typeof precios !== "object") return "";
  const partes = Object.entries(precios).map(([id, v]) => {
    const l = cuenta?.lineas.find((x) => x.id === id);
    return l ? `${l.cantidad} ${l.nombre} a ${pesos(v)}` : "";
  }).filter(Boolean);
  return partes.join(", ");
}

/** La operación en una frase. `cuenta` es la cuenta como está ahora; `estado`, para cierres y productos. */
export function describir(op: Operacion, cuenta?: Cuenta, estado?: Pick<Estado, "jornadas" | "productos" | "deudas" | "solicitudes">): { texto: string; atencion: boolean } {
  const linea = (id: string) => cuenta?.lineas.find((l) => l.id === id);
  switch (op.t) {
    case "abrir":
      return { texto: `Abrió la cuenta (${tipoCuenta(cuenta, op)})`, atencion: false };
    case "renombrar":
      return { texto: `Le cambió el nombre a «${op.nombre.trim().slice(0, 60)}»`, atencion: false };
    case "anotar": {
      const ls = cuenta?.lineas.filter((l) => l.ronda === op.ronda) ?? [];
      if (!ls.length) return { texto: `Anotó ${op.lineas.length} producto${op.lineas.length === 1 ? "" : "s"} (no quedó en la cuenta)`, atencion: true };
      const partes = ls.map((l) => `${op.lineas.find((x) => x.id === l.id)?.cantidad ?? l.cantidad} ${l.nombre}${l.nota ? ` (${l.nota})` : ""}`);
      const valor = ls.reduce((s, l) => s + l.precio * (op.lineas.find((x) => x.id === l.id)?.cantidad ?? l.cantidad), 0);
      const ronda = cuenta?.rondas.find((r) => r.id === op.ronda);
      const detalle = ronda?.detalle;
      const apartado = ronda?.apartado ? ` · apartado${ronda.apartado.para ? ` para las ${horaDe(ronda.apartado.para)}` : ""}` : "";
      return { texto: `Anotó ${partes.join(", ")} · ${pesos(valor)}${op.area === "comida" ? ` · desde comida${op.sinDespacho ? " (sin avisar a la barra)" : ""}` : ""}${detalle ? ` · «${detalle}»` : ""}${apartado}`, atencion: false };
    }
    case "agregar": {
      // Edición de una pedida: productos sumados después.
      const r = cuenta?.rondas.find((x) => x.id === op.ronda);
      const ls = cuenta?.lineas.filter((l) => op.lineas.some((x) => x.id === l.id)) ?? [];
      const que = ls.length ? ls.map((l) => `${l.cantidad} ${l.nombre}`).join(", ") : `${op.lineas.length} producto${op.lineas.length === 1 ? "" : "s"}`;
      const valor = ls.reduce((t, l) => t + l.precio * l.cantidad, 0);
      return { texto: `Editó ${r && cuenta ? `la ${nombreRonda(cuenta, r).toLowerCase()}` : "una pedida"}: agregó ${que}${valor ? ` · ${pesos(valor)}` : ""}`, atencion: true };
    }
    case "cambiar_producto": {
      // Edición de una pedida: un producto por otro.
      const vieja = linea(op.linea);
      const nueva = linea(op.nueva?.id ?? "");
      const r = vieja && cuenta?.rondas.find((x) => x.id === vieja.ronda);
      const donde = r && cuenta ? `la ${nombreRonda(cuenta, r).toLowerCase()}` : "una pedida";
      const diferencia = vieja && nueva ? (nueva.precio - vieja.precio) * vieja.cantidad : 0;
      return {
        texto: `Editó ${donde}: cambió ${vieja ? `${vieja.cantidad} ${vieja.nombre}` : "un producto"} por ${nueva ? nueva.nombre : "otro"}${diferencia ? ` (${diferencia > 0 ? "+" : "−"}${pesos(Math.abs(diferencia))})` : ""}`,
        atencion: true,
      };
    }
    case "anular": {
      const l = linea(op.linea);
      return { texto: l ? `Anuló ${l.cantidad} ${l.nombre} · ${pesos(l.precio * l.cantidad)}` : "Anuló un producto", atencion: true };
    }
    case "cantidad": {
      const l = linea(op.linea);
      return { texto: l ? `Cambió la cantidad de ${l.nombre} a ${op.cantidad}` : `Cambió una cantidad a ${op.cantidad}`, atencion: true };
    }
    case "comida_linea": {
      const l = linea(op.linea);
      return { texto: `Marcó ${l ? `«${l.nombre}»` : "un producto"} como ${op.valor ? "comida" : "barra"}`, atencion: false };
    }
    case "cobrar": {
      const p = cuenta?.pagos.find((x) => x.id === op.pago);
      const valor = p ? ` ${pesos(p.monto)}` : "";
      if (op.medio === "comida") return { texto: `Pasó a comida${valor}`, atencion: false };
      if (op.medio === "deuda") return { texto: `Pasó a deuda de ${op.deudor?.trim() || "alguien"}${valor}${p?.deshecho ? " · después se deshizo" : ""}`, atencion: true };
      const cambio = p?.recibido && p.recibido > p.monto ? ` (pagó con ${pesos(p.recibido)})` : "";
      const que = p?.lineas?.length
        ? ` por ${p.lineas.map((x) => `${x.cantidad} ${linea(x.linea)?.nombre ?? "producto"}`).join(", ")}`
        : "";
      const verbo = p?.parcial ? "Abonó" : "Cobró";
      const quien = p?.pagador ? ` · pagó ${p.pagador}` : "";
      return { texto: `${verbo}${valor} ${medio(op.medio)}${que}${quien}${cambio}${p?.deshecho ? " · después se deshizo" : ""}`, atencion: false };
    }
    case "despachar": {
      const ls = cuenta?.lineas.filter((l) => l.despachada && (!op.lineas?.length || op.lineas.includes(l.id))) ?? [];
      return { texto: `Despachó ${ls.length ? ls.map((l) => `${l.cantidad} ${l.nombre}`).join(", ") : "las bebidas"} pedidas desde comida`, atencion: false };
    }
    case "solicitud":
      return { texto: `Pedido por QR de ${op.solicitud?.lugar?.nombre ?? "una mesa"}${op.solicitud?.cliente ? ` («${op.solicitud.cliente}»)` : ""}: ${(op.solicitud?.lineas ?? []).map((l) => `${l.cantidad} ${l.nombre}`).join(", ")}`, atencion: false };
    case "aceptar_solicitud": {
      const s = estado?.solicitudes?.[op.solicitud];
      return { texto: `Aceptó el pedido por QR${s ? ` de ${s.lugar.nombre}` : ""}${op.aceptadas?.length && s && op.aceptadas.length < s.lineas.length ? ` en parte · lo demás: «${op.motivo ?? ""}»` : ""}`, atencion: false };
    }
    case "rechazar_solicitud": {
      const s = estado?.solicitudes?.[op.solicitud];
      return { texto: `No aceptó el pedido por QR${s ? ` de ${s.lugar.nombre}` : ""} · «${op.motivo}»`, atencion: true };
    }
    case "apartado_entregado": {
      const r = cuenta?.rondas.find((x) => x.id === op.ronda);
      return { texto: `${op.valor ? "Entregó" : "Quitó «entregado» de"} ${r && cuenta ? `la ${nombreRonda(cuenta, r).toLowerCase()}` : "un apartado"} apartada`, atencion: !op.valor };
    }
    case "rechazar_despacho": {
      const ls = cuenta?.lineas.filter((l) => l.rechazada && l.rechazada.en === op.en && (!op.lineas?.length || op.lineas.includes(l.id))) ?? [];
      return { texto: `No pudo despachar ${ls.length ? ls.map((l) => `${l.cantidad} ${l.nombre}`).join(", ") : "el pedido"} · «${String(op.motivo ?? "").trim().slice(0, 80)}»`, atencion: true };
    }
    case "marcar_ronda": {
      const r = cuenta?.rondas.find((x) => x.id === op.ronda);
      const cambio = cambioDePrecio(op.precios, cuenta);
      return { texto: `Marcó ${r ? `la pedida ${r.numero}` : "una pedida"} como ${op.adicional ? "adicional" : "chico"}${cambio ? ` · pasó a precio ${op.precio === "normal" ? "normal" : "de cancha"} (${cambio})` : ""}`, atencion: !!cambio };
    }
    case "precio_ronda": {
      const r = cuenta?.rondas.find((x) => x.id === op.ronda);
      const donde = r && cuenta ? `la ${nombreRonda(cuenta, r).toLowerCase()}` : "una pedida";
      const cambio = cambioDePrecio(op.precios, cuenta);
      return { texto: `Puso ${donde} a precio ${op.precio === "normal" ? "normal" : "de cancha"}${cambio ? ` (${cambio})` : ""}`, atencion: true };
    }
    case "juntar": {
      const j = cuenta?.juntadas?.find((x) => x.cuenta === op.desde);
      return { texto: `Juntó ${j ? `«${j.nombre}»` : "otra cuenta"} con esta para cobrarlas juntas`, atencion: false };
    }
    case "separar":
      return { texto: "Separó una cuenta que se había juntado con esta", atencion: true };
    case "pagador": {
      const p = cuenta?.pagos.find((x) => x.id === op.pago);
      const quien = op.pagador.trim();
      return { texto: `${quien ? `Puso «${quien}» como quien pagó` : "Quitó quién pagó"} ${p ? `el abono de ${pesos(p.monto)}` : "un abono"}`, atencion: false };
    }
    case "deuda_cargo":
      return { texto: `Anotó una deuda de ${op.deudor.trim()}: ${pesos(Math.floor(op.valor))}${op.concepto?.trim() ? ` · ${op.concepto.trim()}` : ""}${op.comida ? " · comida" : ""}`, atencion: true };
    case "deuda_pago": {
      const d = estado?.deudas?.[op.deudor];
      const m = d?.movimientos.find((x) => x.id === op.id);
      return { texto: `Recibió un pago de la deuda de ${d?.nombre ?? op.deudor}: ${pesos(m?.valor ?? Math.floor(op.valor))} ${medio(op.medio)}`, atencion: false };
    }
    case "deuda_anular": {
      const d = estado?.deudas?.[op.deudor];
      const m = d?.movimientos.find((x) => x.id === op.movimiento);
      return { texto: `Anuló ${m ? `${m.tipo === "pago" ? "un pago" : "una deuda"} de ${pesos(m.valor)}` : "un movimiento"} de ${d?.nombre ?? op.deudor}`, atencion: true };
    }
    case "deshacer_pago": {
      const p = cuenta?.pagos.find((x) => x.id === op.pago);
      return { texto: `Deshizo ${p ? `un ${p.parcial ? "abono" : "cobro"} de ${pesos(p.monto)} (${p.persona})` : "un abono"}`, atencion: true };
    }
    case "reabrir":
      return { texto: "Reabrió la cuenta (deshizo el cobro o la anulación)", atencion: true };
    case "comida_cobrada":
      return { texto: op.valor ? "Marcó cobrada en cocina" : "Quitó la marca de cobrada en cocina", atencion: !op.valor };
    case "anular_cuenta": {
      const motivo = typeof op.motivo === "string" && op.motivo.trim() ? ` · motivo: ${op.motivo.trim().slice(0, 120)}` : "";
      const valor = cuenta ? cuenta.lineas.filter((l) => !l.anulada).reduce((s, l) => s + l.precio * l.cantidad, 0) : 0;
      return { texto: `Anuló la cuenta${valor > 0 ? ` con ${pesos(valor)}` : " (vacía)"}${motivo}`, atencion: true };
    }
    case "producto": {
      const p = op.producto;
      const precio = typeof p?.precio === "number" ? ` · ${pesos(p.precio)}` : "";
      return { texto: `Cambió el producto «${String(p?.nombre ?? p?.id ?? "")}»${precio}${p?.activo === false ? " · desactivado" : ""}`, atencion: true };
    }
    case "orden":
      return { texto: "Cambió el orden de los botones", atencion: false };
    case "cerrar_jornada": {
      const cierre = estado?.jornadas?.[op.fecha]?.find((x) => x.id === op.id);
      if (!cierre) return { texto: `Cerró el día ${op.fecha}: contado ${pesos(Math.floor(Number(op.contado)) || 0)}`, atencion: false };
      const dif = cierre.contado - cierre.esperado;
      const como = dif === 0 ? "cuadró" : dif > 0 ? `sobraban ${pesos(dif)}` : `faltaban ${pesos(-dif)}`;
      return { texto: `Cerró el día: contado ${pesos(cierre.contado)}, esperado ${pesos(cierre.esperado)} · ${como}`, atencion: dif !== 0 };
    }
  }
  return { texto: "Operación desconocida", atencion: true };
}

/** La frase con la nota de quién la envió, si fue otra persona (lo anotado sin señal salió con otra sesión). */
export function describirConEnvio(op: Operacion, cuenta?: Cuenta, estado?: Pick<Estado, "jornadas" | "productos" | "deudas" | "solicitudes">) {
  const d = describir(op, cuenta, estado);
  return op.enviadaPor ? { texto: `${d.texto} · la envió ${op.enviadaPor}`, atencion: true } : d;
}
