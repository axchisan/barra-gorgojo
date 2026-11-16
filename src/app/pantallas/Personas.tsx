import { useCallback, useEffect, useState } from "react";
import { AREAS, nombreArea, type Area } from "../../dominio/areas";
import { jornada } from "../../dominio/estado";
import { describirHorario, HORARIO_EMPLEADO, minutosDe, textoMinutos, type Horario } from "../../dominio/horario";
import { haceCuanto, horaDe } from "../../dominio/formato";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";
import { cerrarConEnter } from "../teclado";

interface PersonaAdmin {
  id: string; nombre: string; rol: string; color: string; activa: boolean; tienePin: boolean; pin: string | null;
  areas?: Area[]; dias?: { area: Area; fecha: string }[]; permisos?: string[]; horario?: Horario | null;
}
interface Celular { id: string; nombre: string; creado: number; por: string; ultimo_uso: number | null; revocado: number | null }
interface Rechazada { id: string; persona: string; motivo: string; en: number; error?: number }
/** Un WebSocket abierto ahora (E4): quién lo usa, con qué versión y cuánto le falta enviar. */
interface Conexion { dispositivo: string; persona: string; version?: string; pendientes?: number; visto?: number }

/** Solo el administrador: personas con su PIN, celulares vinculados y lo que se rechazó. */
export function Personas({ nav }: { nav: Nav }) {
  const [personas, setPersonas] = useState<PersonaAdmin[]>([]);
  const [celulares, setCelulares] = useState<Celular[]>([]);
  const [este, setEste] = useState("");
  const [rechazadas, setRechazadas] = useState<Rechazada[]>([]);
  const [conexiones, setConexiones] = useState<Conexion[]>([]);
  const [verPin, setVerPin] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [pinNuevo, setPinNuevo] = useState("");
  const [nuevaPersona, setNuevaPersona] = useState("");
  const [permisos, setPermisos] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<{ codigo: string; vence: number } | null>(null);
  const [error, setError] = useState("");
  const [, refrescar] = useState(0);

  const cargar = useCallback(async () => {
    const [p, d, r] = await Promise.all([
      sinc.admin<{ personas: PersonaAdmin[] }>("personas"),
      sinc.admin<{ dispositivos: Celular[]; este: string; conexiones?: Conexion[] }>("dispositivos"),
      sinc.admin<{ rechazadas: Rechazada[] }>("rechazadas"),
    ]);
    if (p.error || d.error) return setError(p.error ?? d.error ?? "");
    setPersonas(p.personas);
    setCelulares(d.dispositivos);
    setEste(d.este);
    setConexiones(d.conexiones ?? []);
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
            <button className={permisos === p.id ? "chip activo" : "chip"} aria-expanded={permisos === p.id} onClick={() => setPermisos(permisos === p.id ? null : p.id)}>
              {p.rol === "admin" ? "Todo" : `${(p.areas ?? ["barra"]).map(nombreArea).join(" y ")}${p.permisos?.includes("deudas") ? " · deudas" : ""}${p.horario ? " · ⏰ con horario" : ""}`} ▾
            </button>
            {permisos === p.id && <Permisos p={p} accion={accion} />}
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
            {(() => {
              const cs = conexiones.filter((x) => x.dispositivo === c.id);
              if (!cs.length) return <span className="conexion-celular tenue">Sin conexión ahora</span>;
              const pend = cs.reduce((t, x) => t + (x.pendientes ?? 0), 0);
              const versiones = [...new Set(cs.map((x) => x.version).filter(Boolean))].join(", ");
              return (
                <span className="conexion-celular en-linea">
                  ● Conectado · {[...new Set(cs.map((x) => x.persona))].join(", ")}
                  {versiones ? ` · versión ${versiones}` : ""}
                  {pend ? ` · ${pend} por enviar` : ""}
                </span>
              );
            })()}
            {c.id !== este && (
              <button className="chip peligro-chip" onClick={async () => { const r = await sinc.admin("dispositivos", { revocar: c.id }); if (r.error) setError(r.error); await cargar(); }}>Quitar</button>
            )}
          </div>
        ))}
      </section>

      {rechazadas.length > 0 && (
        <section className="caja">
          <h2>Lo que no se aceptó</h2>
          {rechazadas.some((r) => r.error) && (
            <p className="nota">⚠️ Las marcadas como <b>error del sistema</b> no son de las reglas del negocio: avísele a quien mantiene la app.</p>
          )}
          {rechazadas.slice(0, 20).map((r) => (
            <p key={`${r.id}-${r.en}`} className={r.error ? "rechazo-error" : "tenue"}>{horaDe(r.en)} · {r.persona}: {r.error ? "⚠️ error del sistema · " : ""}{r.motivo}</p>
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

/**
 * Rol, áreas fijas (la primera es su pantalla principal) y accesos a un área por días
 * (docs/14). El servidor revisa el área en cada operación.
 */
function Permisos({ p, accion }: { p: PersonaAdmin; accion: (cuerpo: unknown) => Promise<void> }) {
  const areas = p.areas ?? ["barra"];
  const [area, setArea] = useState<Area>(areas.includes("barra") ? "comida" : "barra");
  const [fecha, setFecha] = useState(jornada(Date.now()));
  const hoy = jornada(Date.now());
  const ponerAreas = (nuevas: Area[]) => accion({ accion: "areas", id: p.id, areas: nuevas });
  return (
    <div className="permisos">
      <label className="interruptor">
        <input type="checkbox" checked={p.rol === "admin"} onChange={(e) => accion({ accion: "rol", id: p.id, rol: e.target.checked ? "admin" : "operador" })} />
        Administrador: ve y hace todo, en todas las áreas
      </label>
      {p.rol !== "admin" && (
        <>
          {PERMISOS_VISTA.map(([permiso, texto]) => (
            <label key={permiso} className="interruptor">
              <input type="checkbox" checked={!!p.permisos?.includes(permiso)}
                onChange={(e) => {
                  const otros = (p.permisos ?? []).filter((x) => x !== permiso);
                  void accion({ accion: "permisos", id: p.id, permisos: e.target.checked ? [...otros, permiso] : otros });
                }} />
              {texto}
            </label>
          ))}
          <HorarioPersona p={p} accion={accion} />
        </>
      )}
      <p className="etiqueta">Áreas fijas {p.rol === "admin" ? "(y su pantalla principal)" : ""}</p>
      <div className="chips">
        {AREAS.map((a) => {
          const tiene = areas.includes(a);
          return (
            <button key={a} className={tiene ? "chip activo" : "chip"} aria-pressed={tiene}
              onClick={() => ponerAreas(tiene ? areas.filter((x) => x !== a) : [...areas, a])}>
              {a === "comida" ? "🍽" : "🍺"} {nombreArea(a)}{tiene && areas[0] === a && areas.length > 1 ? " · principal" : ""}
            </button>
          );
        })}
        {areas.length > 1 && <button className="chip" onClick={() => ponerAreas([...areas].reverse())}>Cambiar la principal</button>}
      </div>
      {p.rol !== "admin" && (
        <>
          <p className="etiqueta">Acceso por un día</p>
          <form className="fila-pin" onSubmit={(e) => { e.preventDefault(); void accion({ accion: "dia", id: p.id, area, fecha, dar: true }); }}>
            <div className="segmentos" role="group" aria-label="Área del día">
              {AREAS.map((a) => <button type="button" key={a} className={area === a ? "activo" : ""} aria-pressed={area === a} onClick={() => setArea(a)}>{nombreArea(a)}</button>)}
            </div>
            <input type="date" aria-label="Día" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} />
            <button className="principal" disabled={!fecha}>Dar</button>
          </form>
          {(p.dias ?? []).filter((d) => d.fecha >= hoy).map((d) => (
            <div key={`${d.area}-${d.fecha}`} className="fila-dia">
              <span>{nombreArea(d.area)} · {d.fecha === hoy ? "hoy" : d.fecha}</span>
              <button className="chip peligro-chip" onClick={() => accion({ accion: "dia", id: p.id, area: d.area, fecha: d.fecha, dar: false })}>Quitar</button>
            </div>
          ))}
          <p className="nota">El día va de las 5:00 a. m. a las 5:00 a. m. del día siguiente.</p>
        </>
      )}
    </div>
  );
}

/** Permisos sueltos, con lo que dejan hacer (docs/15 y docs/17). */
const PERMISOS_VISTA: [string, string][] = [
  ["dia", "📊 Ve el día de ventas: totales, cierres y cierra la caja"],
  ["historial", "🗂 Ve deudas y cuentas de otros días (sin esto, solo lo de hoy)"],
  ["deudas", "📒 Administra deudas: anotar deudas a mano y anular movimientos"],
];

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/**
 * Horario de acceso (docs/17): sin horario, entra cuando quiera; con horario, solo en sus
 * franjas semanales y en los días especiales (eventos). Fuera de ellas no entra, y si
 * estaba adentro, sale al terminar.
 */
function HorarioPersona({ p, accion }: { p: PersonaAdmin; accion: (cuerpo: unknown) => Promise<void> }) {
  const h = p.horario ?? null;
  const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const [dia, setDia] = useState(0);
  const [desde, setDesde] = useState("08:00");
  const [hasta, setHasta] = useState("15:00");
  const [fecha, setFecha] = useState(hoy);
  const [error, setError] = useState("");
  const poner = (nuevo: Horario | null) => accion({ accion: "horario", id: p.id, horario: nuevo });
  /** Las horas escritas; si «hasta» es menor que «desde», termina al día siguiente (evento de noche). */
  const franja = () => {
    const a = minutosDe(desde), b = minutosDe(hasta);
    if (a == null || b == null || a === b) { setError("Escriba la hora de inicio y la de fin."); return null; }
    setError("");
    return { desde: a, hasta: b > a ? b : b + 1440 };
  };
  const finTexto = (m: number) => `${textoMinutos(m)}${m > 1440 ? " (día siguiente)" : ""}`;
  return (
    <div className="horario-persona">
      <p className="etiqueta">⏰ Horario de acceso</p>
      <p className="nota">{describirHorario(h, hoy)}</p>
      <div className="chips">
        <button className={h ? "chip" : "chip activo"} aria-pressed={!h} onClick={() => poner(null)}>Siempre</button>
        <button className="chip" onClick={() => poner(HORARIO_EMPLEADO)}>Domingos 8 a. m.–3 p. m.</button>
        {h && <button className="chip peligro-chip" onClick={() => poner({ semanal: [], especiales: [] })}>Sin acceso</button>}
      </div>
      {h && (
        <>
          {h.semanal.map((f, i) => (
            <div key={`s${i}`} className="fila-dia">
              <span>{DIAS_SEMANA[f.dia]} · {textoMinutos(f.desde)} a {finTexto(f.hasta)}</span>
              <button className="chip peligro-chip" onClick={() => poner({ ...h, semanal: h.semanal.filter((_, j) => j !== i) })}>Quitar</button>
            </div>
          ))}
          {h.especiales.filter((f) => f.fecha >= hoy).map((f) => (
            <div key={`e${f.fecha}${f.desde}`} className="fila-dia">
              <span>🎉 {f.fecha === hoy ? "Hoy" : f.fecha} · {textoMinutos(f.desde)} a {finTexto(f.hasta)}</span>
              <button className="chip peligro-chip" onClick={() => poner({ ...h, especiales: h.especiales.filter((x) => x !== f) })}>Quitar</button>
            </div>
          ))}
        </>
      )}
      <div className="fila-franja">
        <input type="time" aria-label="Desde" value={desde} onChange={(e) => setDesde(e.target.value)} />
        <span>a</span>
        <input type="time" aria-label="Hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <div className="fila-franja">
        <select aria-label="Día de la semana" value={dia} onChange={(e) => setDia(Number(e.target.value))}>
          {DIAS_SEMANA.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <button className="secundario" onClick={() => { const f = franja(); if (f) void poner({ semanal: [...(h?.semanal ?? []), { dia, ...f }], especiales: h?.especiales ?? [] }); }}>＋ Cada semana</button>
      </div>
      <div className="fila-franja">
        <input type="date" aria-label="Día especial" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} />
        <button className="secundario" disabled={!fecha} onClick={() => { const f = franja(); if (f) void poner({ semanal: h?.semanal ?? [], especiales: [...(h?.especiales ?? []).filter((x) => x.fecha >= hoy), { fecha, ...f }] }); }}>＋ Día especial</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="nota">Un día especial (evento) se suma al horario de cada semana. Al terminar la franja, la app la saca sola; lo anotado no se pierde.</p>
    </div>
  );
}
