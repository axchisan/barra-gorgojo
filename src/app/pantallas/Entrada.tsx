import { useState } from "react";
import { PERSONAS } from "../../dominio/catalogo";
import { sinc } from "../sincronizacion";

export function Entrada() {
  const guardada = sinc.claveGuardada;
  const [persona, setPersona] = useState<string | null>(null);
  const [clave, setClave] = useState(guardada);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async (p: string, c: string) => {
    setCargando(true);
    setError("");
    const e = await sinc.entrar(p, c);
    setCargando(false);
    if (e) setError(e);
  };

  return (
    <main className="entrada">
      <img src="/icono-192.png" alt="" width={96} height={96} />
      <h1>Barra del Gorgojo</h1>
      <p>¿Quién va a anotar?</p>
      <div className="personas">
        {PERSONAS.map((p) => (
          <button
            key={p}
            className={persona === p ? "persona activa" : "persona"}
            onClick={() => {
              setPersona(p);
              if (guardada) entrar(p, guardada);
            }}
          >
            {p}
          </button>
        ))}
      </div>
      {(!guardada || error) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (persona) entrar(persona, clave);
            else setError("Toque su nombre primero.");
          }}
        >
          <label>
            Clave del negocio
            <input type="password" inputMode="text" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
          </label>
          <button className="principal" disabled={cargando}>{cargando ? "Entrando…" : "Entrar"}</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      {sinc.pendientes.length > 0 && (
        <p className="nota">Hay {sinc.pendientes.length} anotaciones guardadas en este celular. Se envían al entrar.</p>
      )}
    </main>
  );
}
