// Identidad de la base de datos (la instancia del Durable Object). Ver negocio/docs/10.
//
// Cuando producción pasa a una base limpia, los celulares tienen que enterarse para no
// mandar a la base nueva lo anotado contra la vieja (podría revivir cuentas descartadas).
// Por eso la foto dice su base, y cada envío de operaciones dice para qué base son.

/**
 * La única base que existió antes de que la foto dijera su nombre (versión 0.1).
 * Un celular que no sabe su base, o un envío que no la dice, es de esta.
 */
export const BASE_ORIGINAL = "reten-del-gorgojo";
