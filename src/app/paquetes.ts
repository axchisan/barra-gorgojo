// Petacos y medios petacos: agrupar, describir y contar.
import type { Linea, Paquete } from "../dominio/estado";

/** Un petaco o medio petaco en armado: qué cervezas lleva y cuántas. */
export type PaqueteEnArmado = Paquete & { items: Record<string, number> };

export const nombrePaquete = (pq: Pick<Paquete, "tipo" | "mixto">) =>
  `${pq.tipo === "petaco" ? "Petaco" : "Medio petaco"}${pq.mixto ? " mixto" : ""}`;

/** Agrupa las líneas por paquete. Las sueltas quedan aparte. */
export function porPaquete(lineas: Linea[]) {
  const sueltas: Linea[] = [];
  const grupos = new Map<string, { paquete: Paquete; lineas: Linea[] }>();
  for (const l of lineas) {
    if (!l.paquete) { sueltas.push(l); continue; }
    const g = grupos.get(l.paquete.id) ?? { paquete: l.paquete, lineas: [] };
    g.lineas.push(l);
    grupos.set(l.paquete.id, g);
  }
  return { sueltas, grupos: [...grupos.values()] };
}

/** «Petaco Águila, Petaco mixto, 2 Light»: para el botón de repetir. */
export function describir(lineas: Linea[]) {
  const { sueltas, grupos } = porPaquete(lineas);
  return [
    ...grupos.map((g) => g.paquete.mixto ? nombrePaquete(g.paquete) : `${nombrePaquete(g.paquete)} ${g.lineas[0].nombre}`),
    ...sueltas.map((l) => `${l.cantidad} ${l.nombre}`),
  ].join(", ");
}

/** Cuántos petacos y medios petacos hay en estas líneas (los anulados del todo no cuentan). */
export function contarPaquetes(lineas: Linea[]) {
  const vivos = new Map<string, Paquete>();
  for (const l of lineas) if (l.paquete && !l.anulada) vivos.set(l.paquete.id, l.paquete);
  let petacos = 0, medios = 0;
  for (const pq of vivos.values()) pq.tipo === "petaco" ? petacos++ : medios++;
  return { petacos, medios };
}

export const textoPaquetes = ({ petacos, medios }: { petacos: number; medios: number }) =>
  [petacos && `${petacos} ${petacos === 1 ? "petaco" : "petacos"}`, medios && `${medios} ${medios === 1 ? "medio petaco" : "medios petacos"}`]
    .filter(Boolean).join(" y ");
