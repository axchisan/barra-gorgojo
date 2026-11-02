// Deja listo negocio/catalogo.ts, el catálogo base y las personas del negocio.
// Si no existe (clon nuevo del repositorio público), copia el de ejemplo.
// No toca nada si ya existe: ahí están los datos reales del negocio.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const destino = "negocio/catalogo.ts";
if (!existsSync(destino)) {
  mkdirSync("negocio", { recursive: true });
  copyFileSync("negocio.ejemplo/catalogo.ts", destino);
  console.log(`Creado ${destino} con el catálogo de ejemplo. Póngale los productos y precios del negocio.`);
}
