// Códigos QR de las mesas y canchas (docs/20), solo el administrador: encender o apagar los
// pedidos por QR, crear un código por lugar, cambiarlo si alguien lo copió, desactivarlo e
// imprimir la hoja con los QR (número grande, «Escanee para pedir»).
import { useCallback, useEffect, useState } from "react";
import qrcode from "qrcode-generator";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";

interface Lugar { token: string; tipo: "mesa" | "cancha"; numero?: number; cancha?: string; nombre: string; activo: boolean; creado: number }

export const enlaceDe = (token: string) => `${location.origin}/m/${token}`;

/** El QR como SVG dibujado con React (sin insertar HTML). */
export function QR({ texto, tam = 220 }: { texto: string; tam?: number }) {
  const q = qrcode(0, "M");
  q.addData(texto);
  q.make();
  const n = q.getModuleCount();
  const celdas: string[] = [];
  for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (q.isDark(f, c)) celdas.push(`M${c + 4},${f + 4}h1v1h-1z`);
  return (
    <svg className="qr" width={tam} height={tam} viewBox={`0 0 ${n + 8} ${n + 8}`} role="img" aria-label={`Código QR: ${texto}`} shapeRendering="crispEdges">
      <rect width={n + 8} height={n + 8} fill="#fff" />
      <path d={celdas.join("")} fill="#000" />
    </svg>
  );
}

export function CodigosQR({ nav }: { nav: Nav }) {
  const [encendido, setEncendido] = useState(false);
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [numero, setNumero] = useState("");
  const [error, setError] = useState("");
  const cargar = useCallback(async () => {
    const r = await sinc.admin<{ encendido: boolean; lugares: Lugar[] }>("qr");
    if (r.error) return setError(r.error);
    setEncendido(r.encendido);
    setLugares(r.lugares);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  const accion = async (cuerpo: unknown) => {
    setError("");
    const r = await sinc.admin<{ ok?: boolean }>("qr", cuerpo);
    if (r.error) setError(r.error);
    await cargar();
  };
  if (!sinc.esAdministrador) return <main className="vacio-pantalla"><p>Solo el administrador.</p></main>;
  const activos = lugares.filter((l) => l.activo);

  return (
    <main className="codigos-qr">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>📱 Códigos QR</strong>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      <section className="caja no-imprimir">
        <label className="interruptor">
          <input type="checkbox" checked={encendido} onChange={(e) => accion({ accion: "encender", encendido: e.target.checked })} />
          {encendido ? "Pedidos por QR encendidos: los clientes pueden pedir" : "Pedidos por QR apagados: el QR muestra que no se reciben pedidos"}
        </label>
        <p className="nota">Cada pedido llega como solicitud con timbre; nada entra a una cuenta hasta que alguien lo acepta.</p>
      </section>
      <section className="caja no-imprimir">
        <h2>Lugares</h2>
        <form className="fila-pin" onSubmit={(e) => { e.preventDefault(); if (Number(numero) > 0) { void accion({ accion: "crear", tipo: "mesa", numero: Number(numero) }); setNumero(""); } }}>
          <input inputMode="numeric" placeholder="N.º de mesa" aria-label="Número de mesa para el código" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))} />
          <button className="principal">＋ Mesa</button>
        </form>
        <div className="chips">
          {(["1", "2", "pequena"] as const).map((k) => (
            <button key={k} className="chip" onClick={() => accion({ accion: "crear", tipo: "cancha", cancha: k })}>＋ Cancha {k === "pequena" ? "pequeña" : k}</button>
          ))}
        </div>
        {lugares.length === 0 && <p className="tenue">Todavía no hay códigos.</p>}
        {lugares.map((l) => (
          <div key={l.token} className={`fila-persona${l.activo ? "" : " inactiva"}`}>
            <span className="nombre-persona">{l.nombre}{l.activo ? "" : " · desactivado"}</span>
            <a className="tenue enlace-qr" href={enlaceDe(l.token)} target="_blank" rel="noreferrer">Abrir como cliente</a>
            <button className="chip" onClick={() => accion({ accion: "rotar", token: l.token })}>Cambiar código</button>
            <button className="chip" onClick={() => accion({ accion: "activo", token: l.token, activo: !l.activo })}>{l.activo ? "Desactivar" : "Activar"}</button>
          </div>
        ))}
        <p className="nota">«Cambiar código» deja sin servir el QR impreso (si alguien lo copió): hay que imprimir el nuevo.</p>
      </section>
      {activos.length > 0 && (
        <>
          <button className="principal grande no-imprimir" onClick={() => window.print()}>🖨 Imprimir los {activos.length} códigos</button>
          <section className="hoja-qr" aria-label="Hoja para imprimir">
            {activos.map((l) => (
              <div key={l.token} className="tarjeta-qr">
                <strong className="lugar-qr">{l.nombre}</strong>
                <QR texto={enlaceDe(l.token)} />
                <span className="llamado-qr">Escanee para pedir</span>
                <span className="marca-qr">Retén del Gorgojo</span>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
