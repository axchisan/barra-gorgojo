import { total, totalComida, type Cuenta } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";

/** Total partido en barra y comida, para cuando la barra cobra la cuenta completa. */
export function Desglose({ c }: { c: Cuenta }) {
  const comida = totalComida(c);
  return (
    <div className="desglose">
      <span>🍺 Barra <b>{pesos(total(c) - comida)}</b></span>
      <span>🍽 Comida <b>{pesos(comida)}</b></span>
    </div>
  );
}
