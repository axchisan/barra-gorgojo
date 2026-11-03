// Con cuánto pagan en efectivo (F1 y F2 de docs/12).

/**
 * Billetes en circulación en Colombia: la familia del Banco de la República de 2016
 * (banrep.gov.co, «nueva familia de billetes»). El de 1.000 ya casi no circula y no se
 * ofrece; lo menor de 2.000 se paga con monedas (50, 100, 200, 500 y 1.000).
 */
export const BILLETES = [2_000, 5_000, 10_000, 20_000, 50_000, 100_000] as const;

/** Billetes mayores que la cuenta, de menor a mayor. */
export const billetesMayores = (valor: number) => BILLETES.filter((b) => b > valor);

/** Redondeos con que se suele pagar: al mil, a los cinco mil y a los diez mil de arriba. */
const REDONDEOS = [1_000, 5_000, 10_000] as const;

/** Billetes grandes: con varios de ellos se pagan las cuentas que los pasan. */
const GRANDES = [50_000, 100_000] as const;

/** Cuántas sugerencias caben a la vista junto a «Exacto» (C2). */
export const MAX_SUGERENCIAS = 4;

/**
 * Con cuánto es probable que paguen una cuenta en efectivo, sin contar «Exacto»: la cuenta
 * redondeada hacia arriba al mil, a los cinco mil y a los diez mil; el siguiente múltiplo
 * de 50.000 y de 100.000, y cada billete mayor que la cuenta. Solo valores mayores que la
 * cuenta, sin repetidos, de menor a mayor y a lo sumo `MAX_SUGERENCIAS`.
 * Ej.: 12.500 → 13.000, 15.000, 20.000, 50.000; 37.000 → 40.000, 50.000, 100.000.
 */
export function sugerirPago(valor: number): number[] {
  if (!Number.isInteger(valor) || valor <= 0) return [];
  const arriba = (paso: number) => Math.ceil(valor / paso) * paso;
  const siguiente = (paso: number) => (Math.floor(valor / paso) + 1) * paso;
  const todos = new Set<number>([...REDONDEOS.map(arriba), ...GRANDES.map(siguiente), ...billetesMayores(valor)]);
  return [...todos].filter((v) => v > valor).sort((a, b) => a - b).slice(0, MAX_SUGERENCIAS);
}
