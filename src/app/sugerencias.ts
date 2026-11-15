// Sabores de gaseosa que se venden en Colombia, para crear las opciones de una vez
// (docs/02 «Opciones de un producto»). Son nombres de marcas del mercado, no datos del
// negocio: el administrador escoge cuáles tiene, y cada una se crea con el precio de su
// producto general (regla 11: ningún precio inventado). El color es solo el del botón.
// Fuentes (2026-11-14): portafolios de Postobón y de Coca-Cola FEMSA Colombia; Hipinto la
// pidió el negocio.

export interface Sugerencia { nombre: string; fondo: string; marca: string; comun?: boolean }

export const SABORES_GASEOSA: Sugerencia[] = [
  // Postobón
  { nombre: "Colombiana", fondo: "#E8892B", marca: "Postobón", comun: true },
  { nombre: "Manzana", fondo: "#C8312A", marca: "Postobón", comun: true },
  { nombre: "Uva", fondo: "#5B2A86", marca: "Postobón", comun: true },
  { nombre: "Naranja", fondo: "#F5A04A", marca: "Postobón", comun: true },
  { nombre: "Piña", fondo: "#F2C230", marca: "Postobón" },
  { nombre: "Limón", fondo: "#9BC53D", marca: "Postobón" },
  { nombre: "Tamarindo", fondo: "#7A4A1E", marca: "Postobón" },
  { nombre: "Pepsi", fondo: "#1F4E8C", marca: "Postobón", comun: true },
  { nombre: "7Up", fondo: "#2F7D3A", marca: "Postobón", comun: true },
  { nombre: "Bretaña", fondo: "#9CC9EC", marca: "Postobón", comun: true },
  { nombre: "Canada Dry", fondo: "#0B6E3F", marca: "Postobón" },
  { nombre: "Freskola", fondo: "#E4002B", marca: "Postobón" },
  // Hipinto (Santander)
  { nombre: "Hipinto Piña", fondo: "#F2C230", marca: "Hipinto" },
  { nombre: "Hipinto Roja", fondo: "#C8312A", marca: "Hipinto" },
  // Coca-Cola FEMSA
  { nombre: "Coca-Cola", fondo: "#E4002B", marca: "Coca-Cola", comun: true },
  { nombre: "Coca-Cola Sin Azúcar", fondo: "#241206", marca: "Coca-Cola" },
  { nombre: "Quatro", fondo: "#D9468F", marca: "Coca-Cola", comun: true },
  { nombre: "Sprite", fondo: "#00A651", marca: "Coca-Cola", comun: true },
  { nombre: "Kola Román", fondo: "#A3001E", marca: "Coca-Cola", comun: true },
  { nombre: "Premio", fondo: "#F28C28", marca: "Coca-Cola" },
  { nombre: "Fanta", fondo: "#FF8200", marca: "Coca-Cola" },
];

/** El nombre de una opción: «Colombiana (pequeña)» para «Gaseosa pequeña»; editable después. */
export function nombreOpcion(sabor: string, general: string): string {
  const resto = general.replace(/^gaseosa\s+/i, "").trim();
  return `${sabor} (${resto || general})`.slice(0, 40);
}

/** Un id nuevo para un producto, a partir de su nombre (como «Nuevo producto»). */
export function idNuevo(nombre: string): string {
  const base = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "producto";
  return `${base}-${crypto.randomUUID().slice(0, 4)}`;
}
