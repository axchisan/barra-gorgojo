// «?»: los atajos de teclado, para el portátil (docs/02 «Teclado físico»).
import { useAtrasCierra } from "../navegacion";

const ATAJOS: [string, string, string][] = [
  ["En todas partes", "Esc", "Atrás o cerrar la hoja"],
  ["", "?", "Ver estos atajos"],
  ["Cuentas", "/", "Buscar cuenta"],
  ["", "N", "Nueva cuenta"],
  ["", "1 … 9", "Abrir la cuenta 1 … 9 de la lista"],
  ["En una cuenta", "A", "Anotar pedida o chico"],
  ["", "R", "Repetir la última"],
  ["", "C", "Cobrar"],
  ["Cobrando", "E · N · B · D", "Efectivo, Nequi, Breve, deuda"],
  ["", "números", "Con cuánto paga (en efectivo)"],
  ["", "Ctrl/⌘ + Enter", "Cobrar"],
  ["Anotando", "letras", "Buscar el producto («agu» → Águila)"],
  ["", "2 … 9 y letras", "Esa cantidad («4agu» = 4 Águila)"],
  ["", "Enter", "Sumar el producto resaltado"],
  ["", "Retroceso", "Borrar lo escrito"],
  ["", "Ctrl/⌘ + Enter", "Anotar"],
];

export function HojaAtajos({ cerrar }: { cerrar: () => void }) {
  useAtrasCierra(true, cerrar);
  return (
    <div className="hoja" onClick={cerrar}>
      <div className="hoja-cuerpo hoja-atajos" role="dialog" aria-label="Atajos de teclado" onClick={(e) => e.stopPropagation()}>
        <header className="cabeza-hoja">
          <h2>⌨️ Atajos de teclado</h2>
          <button className="cerrar-hoja" aria-label="Cerrar" onClick={cerrar}>✕</button>
        </header>
        <table>
          <tbody>
            {ATAJOS.map(([donde, tecla, que]) => (
              <tr key={`${donde}${tecla}`}>
                <th scope="row">{donde}</th>
                <td><kbd>{tecla}</kbd></td>
                <td>{que}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="nota">Solo con teclado físico; mientras se escribe en un campo, solo Esc y Ctrl/⌘ + Enter.</p>
      </div>
    </div>
  );
}
