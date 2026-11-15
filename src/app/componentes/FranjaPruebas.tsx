// En el entorno de pruebas, una franja roja arriba en todas las pantallas (docs/18): sirve
// para enseñar a usar la app sin miedo, y que nadie la confunda con la caja real.
export const ES_PRUEBAS = typeof __ENTORNO__ === "string" && __ENTORNO__ === "pruebas";

export function FranjaPruebas() {
  if (!ES_PRUEBAS) return null;
  return <div className="franja-pruebas" role="note">🧪 ENTORNO DE PRUEBA · no es la caja real</div>;
}
