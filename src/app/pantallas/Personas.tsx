import { useCallback, useEffect, useState } from "react";
import { haceCuanto, horaDe } from "../../dominio/formato";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";
import { cerrarConEnter } from "../teclado";

interface PersonaAdmin { id: string; nombre: string; rol: string; color: string; activa: boolean; tienePin: boolean; pin: string | null }
interface Celular { id: string; nombre: string; creado: number; por: string; ultimo_uso: number | null; revocado: number | null }
interface Rechazada { id: string; persona: string; motivo: string; en: number }

/** Solo el administrador: personas con su PIN, celulares vinculados y lo que se rechazó. */
export function Personas({ nav }: { nav: Nav }) {
  const [personas, setPersonas] = useState<PersonaAdmin[]>([]);
  const [celulares, setCelulares] = useState<Celular[]>([]);
  const [este, setEste] = useState("");
  const [rechazadas, setRechazadas] = useState<Rechazada[]>([]);
  const [verPin, setVerPin] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [pinNuevo, setPinNuevo] = useState("");
  const [nuevaPersona, setNuevaPersona] = useState("");
  const [codigo, setCodigo] = useState<{ codigo: string; vence: number } | null>(null);
  const [error, setError] = useState("");
  const [, refrescar] = useState(0);

  const cargar = useCallback(async () => {
    const [p, d, r] = await Promise.all([
      sinc.admin<{ personas: PersonaAdmin[] }>("personas"),
      sinc.admin<{ dispositivos: Celular[]; este: string }>("dispositivos"),
      sinc.admin<{ rechazadas: Rechazada[] }>("rechazadas"),
    ]);
    if (p.error || d.error) return setError(p.error ?? d.error ?? "");
    setPersonas(p.personas);
    setCelulares(d.dispositivos);
    setEste(d.este);
    setRechazadas(r.rechazadas ?? []);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  // El código se vence: el contador se actualiza solo.
  useEffect(() => {
    if (!codigo) return;
    const t = setInterval(() => (Date.now() > codigo.vence ? setCodigo(null) : refrescar((x) => x + 1)), 1000);
    return () => clearInterval(t);
  }, [codigo]);

  const accion = async (cuerpo: unknown) => {
    setError("");
    const r = await sinc.admin<{ ok?: boolean }>("personas", cuerpo);
    if (r.error) return setError(r.error);
    await cargar();
    void sinc.cargarPersonas();
  };

  if (!sinc.esAdministrador) return <main className="vacio-pantalla"><p>Solo el administrador.</p></main>;
  const quedan = codigo ? Math.max(0, Math.ceil((codigo.vence - Date.now()) / 1000)) : 0;

  return (
    <main className="personas-admin">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>Personas y celulares</strong>
      </header>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="caja">
        <h2>Personas</h2>
        {personas.map((p) => (
          <div key={p.id} className={`fila-persona${p.activa ? "" : " inactiva"}`}>
            <span className="nombre-persona" style={{ borderLeftColor: p.color }}>
              {p.nombre}{p.rol === "admin" ? " · administrador" : ""}{p.activa ? "" : " · desactivada"}
            </span>
            <button className="chip" onClick={() => setVerPin(verPin === p.id ? null : p.id)}>
              {verPin === p.id ? (p.pin ?? "sin PIN") : p.tienePin ? "PIN ••••" : "sin PIN"}
            </button>
            <button className="chip" onClick={() => { setCambiando(cambiando === p.id ? null : p.id); setPinNuevo(""); }}>Cambiar PIN</button>
            <button className="chip" onClick={() => accion({ accion: "activa", id: p.id, activa: !p.activa })}>{p.activa ? "Desactivar" : "Activar"}</button>
            {cambiando === p.id && (
              <form className="fila-pin" onSubmit={(e) => { e.preventDefault(); if (/^\d{4}$/.test(pinNuevo)) { void accion({ accion: "pin", id: p.id, pin: pinNuevo }); setCambiando(null); } else setError("El PIN tiene 4 números."); }}>
                <input inputMode="numeric" enterKeyHint="done" maxLength={4} placeholder="PIN nuevo" aria-label={`PIN nuevo de ${p.nombre}`}
                  value={pinNuevo} onChange={(e) => setPinNuevo(e.target.value.replace(/\D/g, "").slice(0, 4))} autoFocus />
                <button className="principal">Guardar</button>
                <button type="button" className="secundario" onClick={() => { void accion({ accion: "pin", id: p.id, pin: null }); setCambiando(null); }}>Quitar PIN</button>
              </form>
            )}
          </div>
        ))}
        <form className="fila-pin" onSubmit={(e) => { e.preventDefault(); if (nuevaPersona.trim()) { void accion({ accion: "crear", nombre: nuevaPersona.trim(), rol: "operador" }); setNuevaPersona(""); } }}>
          <input placeholder="Nombre de la persona nueva" autoCapitalize="words" enterKeyHint="done" value={nuevaPersona} onChange={(e) => setNuevaPersona(e.target.value)} />
          <button className="principal">Agregar</button>
        </form>
        <p className="nota">Quien no tiene PIN lo crea la primera vez que entra.</p>
      </section>

      <section className="caja">
        <h2>Celulares</h2>
        {codigo ? (
          <div className="codigo-vincular" role="status">
            <span>Escriba este código en el celular nuevo</span>
            <strong>{codigo.codigo.slice(0, 3)} {codigo.codigo.slice(3)}</strong>
            <span className="tenue">Vale {Math.floor(quedan / 60)}:{String(quedan % 60).padStart(2, "0")} · una sola vez</span>
          </div>
        ) : (
          <button className="principal" onClick={async () => { const r = await sinc.admin<{ codigo: string; vence: number }>("codigo", {}); if (r.error) setError(r.error); else setCodigo(r); }}>
            Vincular un celular
          </button>
        )}
        {celulares.filter((c) => !c.revocado).map((c) => (
          <div key={c.id} className="fila-persona">
            <span className="nombre-persona">{c.nombre}{c.id === este ? " · este" : ""}</span>
            <span className="tenue">desde {horaDe(c.creado)} · usado {c.ultimo_uso ? haceCuanto(c.ultimo_uso) : "nunca"}</span>
            {c.id !== este && (
              <button className="chip peligro-chip" onClick={async () => { const r = await sinc.admin("dispositivos", { revocar: c.id }); if (r.error) setError(r.error); await cargar(); }}>Quitar</button>
            )}
          </div>
        ))}
      </section>

      {rechazadas.length > 0 && (
        <section className="caja">
          <h2>Lo que no se aceptó</h2>
          {rechazadas.slice(0, 20).map((r) => (
            <p key={`${r.id}-${r.en}`} className="tenue">{horaDe(r.en)} · {r.persona}: {r.motivo}</p>
          ))}
        </section>
      )}
    </main>
  );
}

/** Para todos: cambiar el PIN propio con el actual. */
export function MiPin({ nav }: { nav: Nav }) {
  const [actual, setActual] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);
  const guardar = async () => {
    if (!/^\d{4}$/.test(actual) || !/^\d{4}$/.test(nuevo)) return setError("Cada PIN tiene 4 números.");
    const e = await sinc.cambiarMiPin(actual, nuevo);
    if (e) return setError(e);
    setListo(true);
  };
  return (
    <main className="mi-pin">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>Cambiar mi PIN</strong>
      </header>
      {listo ? (
        <><p className="cambio">PIN cambiado.</p><button className="principal" onClick={nav.volver}>Listo</button></>
      ) : (
        <form className="vincular" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
          <label>PIN actual<input inputMode="numeric" type="password" maxLength={4} enterKeyHint="next" value={actual} onChange={(e) => setActual(e.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
          <label>PIN nuevo<input inputMode="numeric" type="password" maxLength={4} enterKeyHint="done" onKeyDown={cerrarConEnter} value={nuevo} onChange={(e) => setNuevo(e.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="principal">Guardar</button>
        </form>
      )}
    </main>
  );
}
