// Áreas del negocio (docs/14): la barra y la comida. Cada persona tiene una o las dos;
// el administrador, todas. La primera de su lista es su pantalla principal.

export type Area = "barra" | "comida";
export const AREAS: readonly Area[] = ["barra", "comida"];
export const esArea = (x: unknown): x is Area => x === "barra" || x === "comida";
export const nombreArea = (a: Area) => (a === "barra" ? "Barra" : "Comida");
/** Lo registrado antes de las áreas (sin `area`) era todo de la barra. */
export const areaDe = (a: unknown): Area => (a === "comida" ? "comida" : "barra");
