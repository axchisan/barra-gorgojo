// Depura un respaldo para pasar a una base limpia. Ver negocio/docs/10.
//
//   pnpm migrar <respaldo.json[.gz]> <regla.json>
//
// Escribe migracion/registro-limpio.json y migracion/informe.md (carpeta ignorada por
// git: tiene nombres de clientes). Termina con error si la verificación no cuadra.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { depurar, informe, type Regla } from "./migracion";

const [archivo, archivoRegla] = process.argv.slice(2);
if (!archivo || !archivoRegla) {
  console.error("Uso: pnpm migrar <respaldo.json[.gz]> <regla.json>");
  process.exit(1);
}

// `wrangler r2 object get` entrega el respaldo ya descomprimido aunque se guarde con gzip:
// se aceptan las dos formas.
const crudo = readFileSync(archivo);
const texto = crudo[0] === 0x1f && crudo[1] === 0x8b ? gunzipSync(crudo).toString("utf8") : crudo.toString("utf8");
const respaldo = JSON.parse(texto) as { base?: string; seq?: number; operaciones: never[] };
const regla = JSON.parse(readFileSync(archivoRegla, "utf8")) as Regla;

const r = depurar(respaldo.operaciones, regla);
mkdirSync("migracion", { recursive: true });
writeFileSync("migracion/registro-limpio.json", JSON.stringify({ origen: { archivo, base: respaldo.base, seq: respaldo.seq }, operaciones: r.registro }, null, 1));
writeFileSync("migracion/informe.md", informe(r, { archivo, base: respaldo.base, seq: respaldo.seq }));

console.log(`${r.conservadas.length} cuentas se conservan, ${r.descartadas.length} se descartan; registro nuevo de ${r.registro.length} operaciones.`);
console.log("Informe: migracion/informe.md");
if (r.errores.length) {
  console.error(`\n${r.errores.length} errores de verificación:\n- ${r.errores.join("\n- ")}`);
  process.exit(1);
}
