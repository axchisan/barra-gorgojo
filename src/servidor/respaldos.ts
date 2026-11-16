// Respaldos por niveles en R2 (2026-11-16, docs/18 fase 3 b y docs/06 «Respaldos»): el
// registro completo, comprimido, en tres carpetas con su regla de ciclo de vida, para no
// llenarse de copias:
//
//   respaldos/diarios/AAAA-MM-DD.json.gz   todos los días; se borran a los 30 días
//   respaldos/semanales/AAAA-MM-DD.json.gz uno por semana (con la fecha de su lunes); 6 meses
//   respaldos/mensuales/AAAA-MM.json.gz    uno por mes; para siempre
//
// El semanal y el mensual son el primer respaldo de su semana o de su mes que se guarda:
// si el Cron no corrió un lunes o un día 1, igual quedan con el siguiente.

/** Lo que se usa del bucket (R2Bucket lo cumple; las pruebas usan uno en memoria). */
export interface Cubo {
  put(clave: string, datos: ArrayBuffer, opciones?: R2PutOptions): Promise<unknown>;
  head(clave: string): Promise<unknown>;
  list(opciones: { prefix: string; limit?: number; cursor?: string }): Promise<{ objects: { key: string; uploaded?: Date }[]; truncated: boolean; cursor?: string }>;
}

export const NIVELES = ["diarios", "semanales", "mensuales"] as const;
export type Nivel = (typeof NIVELES)[number];

import { lunesDe } from "../dominio/informe";
export { lunesDe };

export function claves(fecha: string): Record<Nivel, string> {
  return {
    diarios: `respaldos/diarios/${fecha}.json.gz`,
    semanales: `respaldos/semanales/${lunesDe(fecha)}.json.gz`,
    mensuales: `respaldos/mensuales/${fecha.slice(0, 7)}.json.gz`,
  };
}

/** Guarda el respaldo del día; el semanal y el mensual, solo si aún no hay de esa semana o ese mes. Devuelve lo que guardó. */
export async function guardarRespaldo(cubo: Cubo, fecha: string, comprimido: ArrayBuffer, meta: Record<string, string>): Promise<Nivel[]> {
  const c = claves(fecha);
  const opciones: R2PutOptions = { httpMetadata: { contentType: "application/json", contentEncoding: "gzip" }, customMetadata: { ...meta, fecha } };
  const guardados: Nivel[] = [];
  for (const nivel of NIVELES) {
    if (nivel !== "diarios" && (await cubo.head(c[nivel]))) continue;
    await cubo.put(c[nivel], comprimido, opciones);
    guardados.push(nivel);
  }
  return guardados;
}

/** El más reciente de cada nivel (su clave y cuándo se subió), y cuántos hay. */
export async function ultimos(cubo: Cubo): Promise<Record<Nivel, { clave: string | null; subido: number | null; cuantos: number }>> {
  const r = {} as Record<Nivel, { clave: string | null; subido: number | null; cuantos: number }>;
  for (const nivel of NIVELES) {
    let clave: string | null = null;
    let subido: number | null = null;
    let cuantos = 0;
    let cursor: string | undefined;
    do {
      const pagina = await cubo.list({ prefix: `respaldos/${nivel}/`, limit: 1000, cursor });
      for (const o of pagina.objects) {
        cuantos++;
        if (!clave || o.key > clave) { clave = o.key; subido = o.uploaded ? o.uploaded.getTime() : null; }
      }
      cursor = pagina.truncated ? pagina.cursor : undefined;
    } while (cursor);
    r[nivel] = { clave, subido, cuantos };
  }
  return r;
}
