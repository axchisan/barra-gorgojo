// Auditoría (RF-74, E4 de docs/12): cada operación del registro en una frase, para que el
// administrador vea quién anotó, anuló, cobró, reabrió o cambió qué. Función pura: el
// servidor la usa con la cuenta como está ahora (de la proyección) para poner nombres y
// valores que la operación sola no trae.

import type { Cuenta, Estado, Operacion } from "./estado";
import { nombreCancha, pesos } from "./formato";

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
  if (op.tipo === "mesa") return `mesa ${op.mesa ?? c?.mesa ?? ""}`.trim();
  if (op.tipo === "cancha") return `cancha ${nombreCancha(op.cancha ?? c?.cancha ?? "")}`.trim();
  return op.tipo === "rapida" ? "venta rápida" : op.tipo;
}

/** La operación en una frase. `cuenta` es la cuenta como está ahora; `estado`, para cierres y productos. */
export function describir(op: Operacion, cuenta?: Cuenta, estado?: Pick<Estado, "jornadas" | "productos">): { texto: string; atencion: boolean } {
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
      return { texto: `Anotó ${partes.join(", ")} · ${pesos(valor)}${op.area === "comida" ? " · desde comida" : ""}`, atencion: false };
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
    case "marcar_ronda": {
      const r = cuenta?.rondas.find((x) => x.id === op.ronda);
      return { texto: `Marcó ${r ? `la pedida ${r.numero}` : "una pedida"} como ${op.adicional ? "adicional" : "chico"}`, atencion: false };
    }
    case "juntar": {
      const j = cuenta?.juntadas?.find((x) => x.cuenta === op.desde);
      return { texto: `Juntó ${j ? `«${j.nombre}»` : "otra cuenta"} con esta para cobrarlas juntas`, atencion: false };
    }
    case "separar":
      return { texto: "Separó una cuenta que se había juntado con esta", atencion: true };
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
export function describirConEnvio(op: Operacion, cuenta?: Cuenta, estado?: Pick<Estado, "jornadas" | "productos">) {
  const d = describir(op, cuenta, estado);
  return op.enviadaPor ? { texto: `${d.texto} · la envió ${op.enviadaPor}`, atencion: true } : d;
}
