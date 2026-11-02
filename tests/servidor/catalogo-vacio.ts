// Catálogo base vacío: así queda el código cuando todo el catálogo vive en el registro
// (docs/12, B9). Las personas siguen siendo las del ejemplo.
import type { Producto } from "../../src/dominio/catalogo";
export { PERSONAS } from "../../negocio.ejemplo/catalogo";

export const CATALOGO: Producto[] = [];
