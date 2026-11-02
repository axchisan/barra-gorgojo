// Depuración del registro para pasar a una base limpia. Lógica pura: la usan
// scripts/migrar.ts (lee y escribe archivos) y tests/migrar.test.ts.
// Procedimiento completo: negocio/docs/10-migracion-base-limpia.md.
//
// Qué hace, sin borrar nada de la base vieja:
//   1. Aplica el registro original completo con el dominio.
//   2. Escoge las cuentas a conservar con una regla explícita (jornadas y situaciones).
//   3. Arma el registro nuevo: primero el catálogo consolidado (una operación `producto`
//      por cada producto vigente, base incluida, y una `orden`), después todas las
//      operaciones originales de las cuentas conservadas, en su orden, con su id, persona
//      y hora. Cada línea anotada lleva `precioFijado` con el precio que tiene hoy, para
//      que nada dependa del catálogo del código ni de PRECIO_CANCHA_DESDE.
//   4. Verifica: aplicar el registro nuevo desde cero da las mismas cuentas, idénticas, y
//      el mismo catálogo. Si algo no cuadra, devuelve errores y no se sigue.

import {
  aplicar, catalogo, estadoVacio, jornada, pagado, situacion, total, totalComida,
  type Cuenta, type Estado, type Medio, type Operacion, type Situacion,
} from "../src/dominio/estado";
import type { Producto } from "../src/dominio/catalogo";
import { horaDe, pesos } from "../src/dominio/formato";

export interface Regla {
  /** Jornadas (AAAA-MM-DD, cambian a las 5 a. m.) de las cuentas que se conservan, por `abiertaEn`. */
  jornadas: string[];
  /** Situaciones finales que se conservan, por ejemplo ["cobrada"]. */
  situaciones: Situacion[];
  /** Cifras de control que da el negocio. Si no coinciden, la migración no sigue. */
  esperado?: { cuentas?: number; total?: number; porMedio?: Partial<Record<Medio, number>> };
}

export interface Resultado {
  registro: Operacion[];
  original: Estado;
  nuevo: Estado;
  conservadas: Cuenta[];
  descartadas: Cuenta[];
  errores: string[];
}

type OpGuardada = Operacion & { recibida_en?: number };

/** Persona con la que quedan las operaciones de catálogo consolidadas. */
const ADMINISTRADOR = "Administrador";

export function depurar(registroOriginal: OpGuardada[], regla: Regla): Resultado {
  const ops = [...registroOriginal]
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map(({ seq: _s, recibida_en: _r, ...op }) => structuredClone(op) as Operacion);

  const original = estadoVacio();
  for (const op of ops) aplicar(original, structuredClone(op));

  const todas = Object.values(original.cuentas);
  const conservar = (c: Cuenta) => regla.jornadas.includes(jornada(c.abiertaEn)) && regla.situaciones.includes(situacion(c));
  const conservadas = todas.filter(conservar).sort((a, b) => a.abiertaEn - b.abiertaEn);
  const descartadas = todas.filter((c) => !conservar(c)).sort((a, b) => a.abiertaEn - b.abiertaEn);
  const ids = new Set(conservadas.map((c) => c.id));

  // Catálogo consolidado: todo el catálogo vigente, para que la base nueva no dependa del
  // catálogo base del código (paso B9 de docs/12).
  const corte = ops.length ? Math.max(...ops.map((o) => o.en)) : Date.now();
  const productos = catalogo(original);
  const registro: Operacion[] = [
    ...productos.map((p) => ({ id: `migracion-producto-${p.id}`, t: "producto" as const, producto: p, persona: ADMINISTRADOR, en: corte })),
    { id: "migracion-orden", t: "orden" as const, ids: productos.map((p) => p.id), persona: ADMINISTRADOR, en: corte },
  ];

  for (const op of ops) {
    if (!("cuenta" in op) || !ids.has(op.cuenta)) continue;
    if (op.t === "anotar") {
      const finales = new Map(original.cuentas[op.cuenta].lineas.map((l) => [l.id, l.precio]));
      op.lineas = op.lineas.map((l) => (finales.has(l.id) ? { ...l, precioFijado: finales.get(l.id) } : l));
    }
    registro.push(op);
  }

  const nuevo = estadoVacio();
  for (const op of registro) aplicar(nuevo, structuredClone(op));

  return { registro, original, nuevo, conservadas, descartadas, errores: verificar(original, nuevo, conservadas, regla) };
}

/** Lo que importa de un producto, con los vacíos iguales (null y ausente valen lo mismo). */
const productoNormal = (p: Producto) => ({
  id: p.id, nombre: p.nombre, corto: p.corto, categoria: p.categoria, precio: p.precio ?? null,
  precioCancha: p.precioCancha ?? null, libre: !!p.libre, conNombre: !!p.conNombre, activo: p.activo, fondo: p.fondo, texto: p.texto,
});

/** Comparación profunda con las llaves ordenadas. */
function canonico(x: unknown): string {
  return JSON.stringify(x, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );
}

export function porMedio(cuentas: Cuenta[]): Partial<Record<Medio, number>> {
  const r: Partial<Record<Medio, number>> = {};
  for (const c of cuentas) for (const p of c.pagos) if (!p.deshecho) r[p.medio] = (r[p.medio] ?? 0) + p.monto;
  return r;
}

export function verificar(original: Estado, nuevo: Estado, conservadas: Cuenta[], regla: Regla): string[] {
  const errores: string[] = [];
  const esperadas = new Set(conservadas.map((c) => c.id));
  const quedaron = Object.keys(nuevo.cuentas);
  for (const id of quedaron) if (!esperadas.has(id)) errores.push(`Sobra la cuenta ${id} (${nuevo.cuentas[id].nombre}) en la base nueva.`);
  for (const c of conservadas) {
    const n = nuevo.cuentas[c.id];
    if (!n) { errores.push(`Falta la cuenta «${c.nombre}» en la base nueva.`); continue; }
    if (canonico(n) !== canonico(original.cuentas[c.id])) {
      errores.push(`La cuenta «${c.nombre}» no queda idéntica: total ${pesos(total(c))} → ${pesos(total(n))}, pagado ${pesos(pagado(c))} → ${pesos(pagado(n))}, comida ${pesos(totalComida(c))} → ${pesos(totalComida(n))}.`);
    }
  }
  const catA = catalogo(original).map(productoNormal);
  const catB = catalogo(nuevo).map(productoNormal);
  if (canonico(catA) !== canonico(catB)) {
    const distintos = catA.filter((p, i) => canonico(p) !== canonico(catB[i])).map((p) => p.id);
    errores.push(`El catálogo no queda igual (orden o productos): ${distintos.join(", ") || "cambia la cantidad de productos"}.`);
  }
  const e = regla.esperado;
  if (e) {
    if (e.cuentas != null && conservadas.length !== e.cuentas) errores.push(`Se esperaban ${e.cuentas} cuentas y quedan ${conservadas.length}.`);
    const suma = conservadas.reduce((t, c) => t + total(c), 0);
    if (e.total != null && suma !== e.total) errores.push(`Se esperaba un total de ${pesos(e.total)} y da ${pesos(suma)}.`);
    const medios = porMedio(conservadas);
    for (const [m, v] of Object.entries(e.porMedio ?? {})) {
      if ((medios[m as Medio] ?? 0) !== v) errores.push(`Se esperaban ${pesos(v)} en ${m} y da ${pesos(medios[m as Medio] ?? 0)}.`);
    }
  }
  return errores;
}

/** Informe legible para revisar contra la tabla del negocio antes de importar. */
export function informe(r: Resultado, origen: { archivo: string; base?: string; seq?: number }): string {
  const fila = (c: Cuenta) => {
    const medios = [...new Set(c.pagos.filter((p) => !p.deshecho).map((p) => p.medio))].join(", ");
    const comida = totalComida(c) ? ` (comida ${pesos(totalComida(c))})` : "";
    return `| ${jornada(c.abiertaEn)} ${horaDe(c.abiertaEn)} | ${c.nombre} | ${pesos(total(c))}${comida} | ${medios || "—"} |`;
  };
  const suma = r.conservadas.reduce((t, c) => t + total(c), 0);
  const medios = Object.entries(porMedio(r.conservadas)).map(([m, v]) => `${m} ${pesos(v)}`).join(" · ");
  const grupos = new Map<string, number>();
  for (const c of r.descartadas) {
    const k = `${jornada(c.abiertaEn)} · ${situacion(c)}`;
    grupos.set(k, (grupos.get(k) ?? 0) + 1);
  }
  return [
    `# Informe de migración`,
    ``,
    `- Corte: \`${origen.archivo}\`${origen.base ? `, base \`${origen.base}\`` : ""}${origen.seq != null ? `, seq ${origen.seq}` : ""}`,
    `- Registro nuevo: ${r.registro.length} operaciones (catálogo: ${catalogo(r.nuevo).length} productos y su orden)`,
    `- Verificación: ${r.errores.length ? `**${r.errores.length} errores**` : "**sin errores**: las cuentas y el catálogo quedan idénticos"}`,
    ...r.errores.map((e) => `  - ${e}`),
    ``,
    `## Se conservan (${r.conservadas.length})`,
    ``,
    `| Abierta | Cuenta | Total | Medio |`,
    `|---|---|---|---|`,
    ...r.conservadas.map(fila),
    `| | **Total** | **${pesos(suma)}** | ${medios} |`,
    ``,
    `## Se descartan (${r.descartadas.length})`,
    ``,
    `| Jornada · situación | Cuentas |`,
    `|---|---|`,
    ...[...grupos].map(([k, n]) => `| ${k} | ${n} |`),
    ``,
    `| Abierta | Cuenta | Total | Medio | Situación |`,
    `|---|---|---|---|---|`,
    ...r.descartadas.map((c) => `${fila(c)} ${situacion(c)} |`),
    ``,
  ].join("\n");
}
