// Colores de los botones de producto.

export const COLORES = [
  "#F2C230", "#9CC9EC", "#C8312A", "#2F7D3A", "#F6E7B8", "#7A1F1C", "#5B3A1E", "#E4002B",
  "#F5A04A", "#DCEFF7", "#1F4E8C", "#6B5744", "#A99681", "#F0E9DE", "#3A2C1E", "#8E44AD",
];

/** Texto oscuro o claro según qué se lee mejor sobre el fondo. */
export function textoPara(fondo: string): string {
  const n = parseInt(fondo.slice(1), 16);
  const canal = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  return l > 0.35 ? "#241206" : "#FFFFFF";
}
