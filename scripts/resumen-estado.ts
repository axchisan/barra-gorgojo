// Resume un estado para comparar antes y después de un despliegue o una migración.
// Acepta un respaldo (registro de operaciones: lo recalcula con el dominio y el catálogo
// de negocio/) o una foto de /api/foto. Uso: pnpm resumen <archivo.json>
import { readFileSync } from "node:fs";
import { aplicar, catalogo, estadoVacio, saldo, situacion, total, type Estado, type Operacion } from "../src/dominio/estado";
const d = JSON.parse(readFileSync(process.argv[2], "utf8"));
let estado: Estado; let seq: number;
if (d.operaciones) {
  estado = estadoVacio();
  for (const o of d.operaciones as Operacion[]) aplicar(estado, o);
  seq = d.seq;
} else { estado = d.estado; seq = d.seq; }
const filas = Object.values(estado.cuentas).map((c) => ({ id: c.id, nombre: c.nombre, s: situacion(c), total: total(c), saldo: saldo(c) })).sort((a, b) => a.id.localeCompare(b.id));
const productos = catalogo(estado).map((p) => [p.id, p.precio ?? null, p.precioCancha ?? null, p.activo]);
console.log(JSON.stringify({ base: d.base, seq, cuentas: filas.length, totalTodo: filas.reduce((t, f) => t + f.total, 0), productos, filas }));
