// Forma de cada operación que llega de un celular (punto 2 de docs/13). Solo en el
// servidor: el celular no carga esta librería. Lo que no cumple se rechaza con motivo y
// se avisa (regla 8); nunca llega a `aplicar` ni al registro.
//
// Los límites son holgados a propósito (el dominio recorta nombres a 60 y cantidades a
// 3.000): aquí solo se ataja lo que no tiene sentido o inflaría el registro. Lo que manda
// la app hoy, y lo que mandaban las versiones anteriores, debe pasar siempre: si se
// agrega un campo a una operación, se agrega aquí en el mismo commit.

import { z } from "zod";
import type { Operacion } from "../dominio/estado";

const id = z.string().min(1).max(64);
const texto = (max: number) => z.string().max(max);
const numero = z.number().finite();
const opcional = <T extends z.ZodType>(t: T) => t.nullish();

// `firma`: la sesión de quien anotó, para probar la autoría (worker.ts, `autores`); no se guarda.
const comun = { id: z.string().min(8).max(64), persona: z.string().max(80).optional(), en: numero, seq: z.unknown().optional(), firma: z.string().max(400).optional() };

const linea = z.object({
  id,
  producto: id,
  cantidad: numero,
  precio: opcional(numero),
  nombre: opcional(texto(200)),
  nota: opcional(texto(120)),
  paquete: opcional(z.object({ id, tipo: z.enum(["petaco", "medio"]), mixto: z.boolean().optional() })),
  comida: opcional(z.boolean()),
  precioFijado: z.unknown().optional(), // lo escribe solo el servidor: se descarta después
});

const producto = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  nombre: texto(100),
  corto: opcional(texto(40)),
  categoria: texto(20),
  precio: opcional(numero),
  precioCancha: opcional(numero),
  libre: opcional(z.boolean()),
  conNombre: opcional(z.boolean()),
  activo: z.boolean(),
  notas: opcional(z.array(texto(60)).max(20)),
  fondo: texto(16),
  texto: texto(16),
});

const operacion = z.discriminatedUnion("t", [
  z.object({ ...comun, t: z.literal("abrir"), cuenta: id, nombre: texto(200), tipo: z.enum(["grupo", "persona", "mesa", "cancha", "rapida"]), mesa: opcional(numero), cancha: opcional(z.enum(["1", "2", "pequena"])) }),
  z.object({ ...comun, t: z.literal("renombrar"), cuenta: id, nombre: texto(200) }),
  z.object({ ...comun, t: z.literal("anotar"), cuenta: id, ronda: id, area: opcional(z.enum(["barra", "comida"])), adicional: opcional(z.boolean()), detalle: opcional(z.string().max(200)), lineas: z.array(linea).min(1).max(300) }),
  z.object({ ...comun, t: z.literal("despachar"), cuenta: id, lineas: opcional(z.array(id).max(300)) }),
  z.object({ ...comun, t: z.literal("juntar"), cuenta: id, desde: id }),
  z.object({ ...comun, t: z.literal("marcar_ronda"), cuenta: id, ronda: id, adicional: z.boolean() }),
  z.object({ ...comun, t: z.literal("separar"), cuenta: id, desde: id }),
  z.object({ ...comun, t: z.literal("anular"), cuenta: id, linea: id }),
  z.object({ ...comun, t: z.literal("cantidad"), cuenta: id, linea: id, cantidad: numero }),
  z.object({ ...comun, t: z.literal("comida_linea"), cuenta: id, linea: id, valor: z.boolean() }),
  z.object({ ...comun, t: z.literal("cobrar"), cuenta: id, pago: id, medio: z.enum(["efectivo", "nequi", "breve", "comida"]), recibido: opcional(numero),
    monto: opcional(numero), lineas: opcional(z.array(z.object({ linea: id, cantidad: numero })).max(300)), pagador: opcional(texto(80)), area: opcional(z.enum(["barra", "comida"])) }),
  z.object({ ...comun, t: z.literal("deshacer_pago"), cuenta: id, pago: id }),
  z.object({ ...comun, t: z.literal("reabrir"), cuenta: id }),
  z.object({ ...comun, t: z.literal("comida_cobrada"), cuenta: id, valor: z.boolean() }),
  z.object({ ...comun, t: z.literal("anular_cuenta"), cuenta: id, motivo: opcional(texto(300)) }),
  z.object({ ...comun, t: z.literal("producto"), producto }),
  z.object({ ...comun, t: z.literal("orden"), ids: z.array(id).max(500) }),
  z.object({ ...comun, t: z.literal("cerrar_jornada"), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), contado: numero, notas: opcional(texto(300)), area: opcional(z.enum(["barra", "comida"])) }),
]);

/** La operación limpia (sin campos desconocidos), o el motivo para rechazarla. */
export function validar(crudo: unknown): { op: Operacion } | { motivo: string } {
  const r = operacion.safeParse(crudo);
  if (r.success) return { op: r.data as unknown as Operacion };
  const t = crudo && typeof crudo === "object" ? (crudo as { t?: unknown }).t : undefined;
  const campo = r.error.issues[0]?.path.join(".") || "operación";
  return { motivo: `La anotación llegó dañada (${typeof t === "string" ? t : "sin tipo"}: ${campo}). Vuelva a anotarla.` };
}
