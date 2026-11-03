// Aviso con «Deshacer», abajo de la pantalla.
import { useEffect, useState } from "react";
import { sinc } from "./sincronizacion";

export type Aviso = { texto: string; deshacer?: () => void; id: number };
export let ponerAviso: (a: Omit<Aviso, "id">) => void = () => {};

export function Avisos() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  useEffect(() => {
    ponerAviso = (a) => setAviso({ ...a, id: Date.now() });
    // Lo que el servidor no aceptó se avisa siempre (regla 8).
    sinc.alRechazo = (motivo) => setAviso({ texto: `No se hizo: ${motivo}`, id: Date.now() });
    return () => { sinc.alRechazo = null; };
  }, []);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.deshacer ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [aviso]);
  if (!aviso) return null;
  return (
    <div className="aviso" role="status">
      <span>{aviso.texto}</span>
      {aviso.deshacer && (
        <button onClick={() => { aviso.deshacer!(); setAviso(null); }}>Deshacer</button>
      )}
    </div>
  );
}
