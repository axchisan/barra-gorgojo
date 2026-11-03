// Con cuánto pagan en efectivo (F1 y F2 de docs/12).

/**
 * Billetes en circulación en Colombia: la familia del Banco de la República de 2016
 * (banrep.gov.co, «nueva familia de billetes»). El de 1.000 ya casi no circula y no se
 * ofrece; lo menor de 2.000 se paga con monedas (50, 100, 200, 500 y 1.000).
 */
export const BILLETES = [2_000, 5_000, 10_000, 20_000, 50_000, 100_000] as const;

/** Billetes mayores que la cuenta, de menor a mayor. */
export const billetesMayores = (valor: number) => BILLETES.filter((b) => b > valor);
