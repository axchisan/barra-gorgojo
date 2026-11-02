import { useState } from "react";
import { sinc } from "../sincronizacion";

/**
 * Estado de la conexión en la cabecera. En teléfonos angostos se ve solo el punto de
 * color y cuántas anotaciones faltan por enviar; al tocarlo, el texto completo (C11).
 */
export function EstadoConexion() {
  const [abierto, setAbierto] = useState(false);
  const n = sinc.pendientes.length;
  const ok = sinc.conexion === "conectado";
  const texto = ok ? (n ? `Enviando ${n}…` : "Todo al día") : `Sin señal${n ? ` · ${n} por enviar` : ""}`;
  return (
    <button className={`conexion ${ok ? "ok" : "sin"}${abierto ? " abierta" : ""}`} aria-label={texto} onClick={() => setAbierto(!abierto)}>
      ● <span className="corto">{n || ""}</span><span className="largo">{texto}</span>
    </button>
  );
}
