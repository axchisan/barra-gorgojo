// Tipos y reglas fijas del catálogo. El catálogo base y las personas de cada negocio
// NO van aquí: vienen de `#negocio` (negocio/catalogo.ts, fuera del repositorio
// público). En un clon nuevo, `pnpm preparar` copia el de ejemplo
// (negocio.ejemplo/catalogo.ts). Ver README «Datos del negocio».

import { CATALOGO } from "#negocio";

export { CATALOGO, PERSONAS } from "#negocio";

export type Categoria = "cerveza" | "gaseosa" | "cigarrillo" | "otro" | "licor";

export interface Producto {
  id: string;
  nombre: string;
  corto: string;
  categoria: Categoria;
  /** Pesos enteros. `null` en productos de valor libre o sin precio confirmado. */
  precio: number | null;
  /** Precio en las cuentas de cancha de tejo. Vacío: se cobra el precio normal. */
  precioCancha?: number | null;
  /** Se escribe el valor al anotar (mecato). */
  libre?: boolean;
  /** Además del valor, se escribe el nombre («Otro»: lo que no está en el catálogo). */
  conNombre?: boolean;
  activo: boolean;
  fondo: string;
  texto: string;
}

export const PRODUCTOS = new Map(CATALOGO.map((p) => [p.id, p]));

export const SECCIONES: { titulo: string; categorias: Categoria[] }[] = [
  { titulo: "Cervezas", categorias: ["cerveza"] },
  { titulo: "Gaseosas, jugos y agua", categorias: ["gaseosa"] },
  { titulo: "Cigarrillos, mecato y licor", categorias: ["cigarrillo", "otro", "licor"] },
];

/** Tope por unidad en valor libre, para atajar un error de dedo de muchos ceros. */
export const TOPE_VALOR_LIBRE = 5_000_000;

/** Un petaco trae 30 cervezas; el medio, 15. */
export const PETACO = 30;
export const MEDIO_PETACO = 15;

export const CATEGORIAS: { id: Categoria; nombre: string }[] = [
  { id: "cerveza", nombre: "Cerveza" },
  { id: "gaseosa", nombre: "Gaseosa, jugo o agua" },
  { id: "cigarrillo", nombre: "Cigarrillo" },
  { id: "licor", nombre: "Licor" },
  { id: "otro", nombre: "Otro" },
];

