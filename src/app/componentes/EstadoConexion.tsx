import { sinc } from "../sincronizacion";

export function EstadoConexion() {
  const n = sinc.pendientes.length;
  if (sinc.conexion === "conectado") {
    return <span className="conexion ok">● {n ? `Enviando ${n}…` : "Todo al día"}</span>;
  }
  return <span className="conexion sin">● Sin señal{n ? ` · ${n} por enviar` : ""}</span>;
}
