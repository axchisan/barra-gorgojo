// Catálogo y personas DE EJEMPLO. No son datos de ningún negocio real: sirven para
// probar la app en un clon nuevo y son el catálogo fijo de las pruebas unitarias.
//
// Para un negocio de verdad: `pnpm preparar` copia este archivo a negocio/catalogo.ts
// (ignorado por git) y ahí se ponen los productos y precios reales. Después, los
// precios se cambian desde la app, nunca en el archivo (regla 0 de AGENTS.md).
//
// Ids obligatorios: «mecato» (valor libre) y «otro» (valor y nombre libres).

import type { Producto } from "../src/dominio/catalogo";

export const CATALOGO: Producto[] = [
  { id: "rubia", nombre: "Rubia", corto: "RUBIA", categoria: "cerveza", precio: 4000, precioCancha: 4500, activo: true, fondo: "#F2C230", texto: "#241206" },
  { id: "light", nombre: "Light", corto: "LIGHT", categoria: "cerveza", precio: 4500, activo: true, fondo: "#9CC9EC", texto: "#241206" },
  { id: "roja", nombre: "Roja", corto: "ROJA", categoria: "cerveza", precio: 3500, precioCancha: 4000, activo: true, fondo: "#C8312A", texto: "#FFFFFF" },
  { id: "lager", nombre: "Lager", corto: "LAGER", categoria: "cerveza", precio: 4000, precioCancha: 4500, activo: true, fondo: "#2F7D3A", texto: "#FFFFFF" },
  { id: "negra", nombre: "Negra", corto: "NEGRA", categoria: "cerveza", precio: 4000, precioCancha: 4500, activo: true, fondo: "#7A1F1C", texto: "#FFFFFF" },
  { id: "importada", nombre: "Importada", corto: "IMPORTADA", categoria: "cerveza", precio: 6000, activo: true, fondo: "#F6E7B8", texto: "#16325C" },

  { id: "gaseosa", nombre: "Gaseosa personal", corto: "GASEOSA", categoria: "gaseosa", precio: 3000, activo: true, fondo: "#E4002B", texto: "#FFFFFF" },
  { id: "jugo", nombre: "Jugo", corto: "JUGO", categoria: "gaseosa", precio: 3000, activo: true, fondo: "#F5A04A", texto: "#241206" },
  { id: "agua", nombre: "Agua", corto: "AGUA", categoria: "gaseosa", precio: 2500, activo: true, fondo: "#DCEFF7", texto: "#241206" },
  { id: "gaseosa-litro", nombre: "Gaseosa litro", corto: "GASEOSA 1L", categoria: "gaseosa", precio: 7000, activo: true, fondo: "#A3001E", texto: "#FFFFFF" },

  { id: "cigarrillo", nombre: "Cigarrillo (unidad)", corto: "CIGARRILLO", categoria: "cigarrillo", precio: 1000, activo: true, fondo: "#6B5744", texto: "#FFFFFF" },

  { id: "mecato", nombre: "Mecato", corto: "MECATO", categoria: "otro", precio: null, libre: true, activo: true, fondo: "#8A4F2E", texto: "#FFFFFF" },
  { id: "otro", nombre: "Otro", corto: "＋ OTRO", categoria: "otro", precio: null, libre: true, conNombre: true, activo: true, fondo: "#FFFDF8", texto: "#241206" },
  { id: "licor", nombre: "Licor (botella)", corto: "LICOR", categoria: "licor", precio: null, activo: false, fondo: "#3A2C1E", texto: "#FFFFFF" },
];

export const PERSONAS = ["Ana", "Beto", "Apoyo", "Administrador"] as const;
