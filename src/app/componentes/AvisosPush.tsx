// «Avisos con la app cerrada» (docs/02, docs/18 fase 4), dentro de la hoja del sonido.
import { useEffect, useState } from "react";
import { activarPush, desactivarPush, esIosSinInstalar, estadoPush, probarPush, type EstadoPush } from "../push";

const TEXTO: Record<EstadoPush, string> = {
  "no-soportado": "Este navegador no recibe avisos con la app cerrada.",
  apagado: "Los avisos con la app cerrada no están encendidos en esta barra.",
  bloqueado: "Los avisos están bloqueados para esta app. Se activan en los ajustes del navegador (Notificaciones) y luego aquí.",
  inactivo: "Que este aparato avise de los pedidos para despachar aunque la app esté cerrada o la pantalla apagada.",
  activo: "✅ Este aparato avisa de los pedidos para despachar aunque la app esté cerrada.",
};

export function AvisosPush() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  useEffect(() => { void estadoPush().then(setEstado); }, []);
  const hacer = async (fn: () => Promise<string | null>, bien: string) => {
    setOcupado(true);
    setMensaje("");
    const error = await fn();
    setMensaje(error ?? bien);
    setEstado(await estadoPush());
    setOcupado(false);
  };
  if (!estado) return null;
  const ios = estado === "no-soportado" && esIosSinInstalar();
  return (
    <section className="avisos-push">
      <p className="etiqueta">📲 Avisos con la app cerrada</p>
      <p className="nota">{ios ? "En iPhone los avisos llegan solo con la app instalada: Compartir → «Agregar a inicio», y abrirla desde ahí." : TEXTO[estado]}</p>
      {estado === "inactivo" && (
        <button className="principal grande" disabled={ocupado} onClick={() => hacer(activarPush, "Listo: este aparato recibe los avisos. Pruébelo con la app cerrada.")}>🔔 Recibir avisos en este aparato</button>
      )}
      {estado === "activo" && (
        <div className="fila-botones">
          <button className="secundario" disabled={ocupado} onClick={() => hacer(probarPush, "Aviso de prueba enviado: debe llegar en unos segundos.")}>Enviar aviso de prueba</button>
          <button className="secundario" disabled={ocupado} onClick={() => hacer(desactivarPush, "Este aparato ya no recibe avisos.")}>Dejar de recibir</button>
        </div>
      )}
      {mensaje && <p className="nota" role="status">{mensaje}</p>}
    </section>
  );
}
