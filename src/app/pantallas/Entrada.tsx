import { useEffect, useState } from "react";
import { TecladoPin } from "../componentes/TecladoPin";
import { sinc, type PersonaPublica } from "../sincronizacion";
import { cerrarConEnter } from "../teclado";

/**
 * Entrada en dos llaves (docs/03 «Acceso y seguridad»): el celular vinculado con un
 * código del administrador, y la persona con su PIN de 4 números.
 */
export function Entrada() {
  useEffect(() => { void sinc.cargarPersonas(); }, []);
  if (sinc.vinculado === false || (sinc.vinculado === null && sinc.personas.length === 0)) return <Vincular />;
  return <Personas />;
}

function Vincular() {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const enviar = async () => {
    if (!/^\d{6}$/.test(codigo)) return setError("El código tiene 6 números.");
    setCargando(true);
    setError((await sinc.vincular(codigo, nombre.trim())) ?? "");
    setCargando(false);
  };
  return (
    <main className="entrada">
      <img src="/icono-192.png" alt="" width={96} height={96} />
      <h1>Barra del Gorgojo</h1>
      <p>Para usar la app en este celular, pídale al administrador un código.</p>
      <form className="vincular" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
        <label>
          Código de 6 números
          <input className="numero" inputMode="numeric" autoComplete="one-time-code" enterKeyHint="next" maxLength={6}
            value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        </label>
        <label>
          Nombre de este celular (opcional)
          <input placeholder="Ej.: Tablet de la barra" enterKeyHint="done" autoCapitalize="sentences" onKeyDown={cerrarConEnter}
            value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <button className="principal" disabled={cargando}>{cargando ? "Vinculando…" : "Vincular celular"}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}

function Personas() {
  const [elegida, setElegida] = useState<PersonaPublica | null>(null);
  const [verAdmin, setVerAdmin] = useState(false);
  const visibles = sinc.personas.filter((p) => !p.admin);
  const admins = sinc.personas.filter((p) => p.admin);
  if (elegida) return <Pin persona={elegida} volver={() => setElegida(null)} />;
  return (
    <main className="entrada">
      <img src="/icono-192.png" alt="" width={96} height={96} />
      <h1>Barra del Gorgojo</h1>
      <p>¿Quién va a anotar?</p>
      <div className="personas">
        {visibles.map((p) => (
          <button key={p.id} className="persona" style={{ borderLeft: `8px solid ${p.color}` }} onClick={() => setElegida(p)}>{p.nombre}</button>
        ))}
      </div>
      {admins.length > 0 && (
        verAdmin
          ? <div className="personas">{admins.map((p) => <button key={p.id} className="persona" onClick={() => setElegida(p)}>{p.nombre}</button>)}</div>
          : <button className="enlace" onClick={() => setVerAdmin(true)}>Soy el administrador</button>
      )}
      {sinc.pendientes.length > 0 && (
        <p className="nota">Hay {sinc.pendientes.length} anotaciones guardadas en este celular. Se envían al entrar.</p>
      )}
    </main>
  );
}

function Pin({ persona, volver }: { persona: PersonaPublica; volver: () => void }) {
  // Sin PIN: se crea escribiéndolo dos veces.
  const [paso, setPaso] = useState<"pin" | "crear" | "repetir">(persona.tienePin ? "pin" : "crear");
  const [primero, setPrimero] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const alCompletar = async (pin: string) => {
    setError("");
    if (paso === "crear") { setPrimero(pin); setPaso("repetir"); return; }
    if (paso === "repetir" && pin !== primero) { setPaso("crear"); setError("No coinciden. Escríbalo otra vez."); return; }
    setOcupado(true);
    const e = paso === "pin" ? await sinc.entrar(persona.id, pin) : await sinc.entrar(persona.id, "", pin);
    setOcupado(false);
    if (e === "sin-pin") { setPaso("crear"); setError("Todavía no tiene PIN: cree uno."); return; }
    if (e) setError(e);
  };
  const titulo = paso === "pin" ? `Hola, ${persona.nombre}` : paso === "crear" ? `${persona.nombre}: cree su PIN` : "Repita el PIN";
  const detalle = paso === "pin" ? "Escriba su PIN" : paso === "crear" ? "4 números que solo usted sepa" : undefined;
  return (
    <main className="entrada">
      <TecladoPin key={paso} titulo={titulo} detalle={detalle} error={error} ocupado={ocupado} alCompletar={alCompletar} alCancelar={volver} />
    </main>
  );
}
