// Pedidos de los clientes por QR o NFC (docs/18 fase 5, docs/20). El cliente pide desde la
// mesa; el pedido llega como **solicitud** y no entra a ninguna cuenta hasta que alguien
// del personal lo acepta (todo o una parte) o dice «No se puede» con el motivo. Así un QR
// copiado o una broma no le cargan nada a nadie (reglas 3, 4 y 8).
//
// La solicitud la escribe solo el servidor (ruta pública); aceptar y rechazar son
// operaciones del personal. Al aceptar, el celular anota además una pedida normal en la
// cuenta del lugar: precios, despacho y permisos salen de las reglas de siempre.

import type { Cancha } from "./estado";

/** De dónde viene el pedido: el lugar del código QR. */
export interface LugarSolicitud {
  /** El código del QR (no se adivina). */
  token: string;
  tipo: "mesa" | "cancha";
  numero?: number;
  cancha?: Cancha;
  /** Cómo se llama en pantalla: «Mesa 4», «Cancha 2». */
  nombre: string;
}

/** Un producto pedido, con el nombre y el precio que vio el cliente (informativos). */
export interface LineaSolicitud {
  id: string;
  producto: string;
  nombre: string;
  precio: number;
  cantidad: number;
  nota?: string;
}

export interface Solicitud {
  id: string;
  en: number;
  lugar: LugarSolicitud;
  /** Cómo se identificó el cliente («los de rojo»), si lo dijo. */
  cliente?: string;
  nota?: string;
  lineas: LineaSolicitud[];
  estado: "pendiente" | "aceptada" | "rechazada";
  /** Quién la resolvió y cómo: la cuenta a la que llegó, qué se aceptó y por qué no lo demás. */
  resuelta?: { por: string; en: number; cuenta?: string; aceptadas?: string[]; motivo?: string };
}

/** Límites de un pedido por QR: ninguna broma carga más que esto. */
export const TOPE_LINEAS = 20;
export const TOPE_UNIDADES = 30;
export const TOPE_VALOR = 500_000;

/** Las solicitudes por atender, de la más vieja a la más nueva. */
export function solicitudesPendientes(solicitudes: Record<string, Solicitud> | undefined): Solicitud[] {
  return Object.values(solicitudes ?? {}).filter((s) => s.estado === "pendiente").sort((a, b) => a.en - b.en);
}

/** Lo que vale una solicitud con los precios que vio el cliente. */
export const valorSolicitud = (s: Pick<Solicitud, "lineas">) => s.lineas.reduce((t, l) => t + l.precio * l.cantidad, 0);

/** Lo que vale la pena tener en el celular: lo pendiente y lo resuelto en las últimas 36 horas. */
export function solicitudesVigentes(solicitudes: Record<string, Solicitud> | undefined, ahora: number): Record<string, Solicitud> | undefined {
  if (!solicitudes) return undefined;
  const r: Record<string, Solicitud> = {};
  for (const s of Object.values(solicitudes)) {
    if (s.estado === "pendiente" || ahora - (s.resuelta?.en ?? s.en) < 36 * 3600_000) r[s.id] = s;
  }
  return r;
}
