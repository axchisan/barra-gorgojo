// El catálogo de ejemplo con la rubia a $ 9.999: simula un despliegue que cambió en el
// código el precio de un producto ya usado (lo que prohíbe la regla 0).
import { CATALOGO as BASE, PERSONAS } from "../../negocio.ejemplo/catalogo";

export const CATALOGO = BASE.map((p) => (p.id === "rubia" ? { ...p, precio: 9999 } : p));
export { PERSONAS };
