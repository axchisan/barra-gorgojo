// Pedir desde la mesa (docs/20): la carta del lugar del QR, el pedido y su estado.
import { useEffect, useRef, useState } from "react";

interface ProductoCarta { id: string; nombre: string; corto: string; categoria: string; precio: number; fondo: string; texto: string; padre?: string }
interface Lugar { lugar: { nombre: string }; cerrado: boolean; carta: ProductoCarta[] }
interface EstadoPedido { estado: "pendiente" | "aceptada" | "rechazada"; lineas: { id: string; nombre: string; cantidad: number }[]; aceptadas?: string[]; motivo?: string }

const SECCIONES: [string, string[]][] = [["Comida", ["comida"]], ["Cervezas", ["cerveza"]], ["Gaseosas, jugos y agua", ["gaseosa"]], ["Otros", ["cigarrillo", "otro", "licor"]]];
const pesos = (v: number) => `$ ${v.toLocaleString("es-CO")}`;
const token = location.pathname.split("/").filter(Boolean)[1] ?? "";
const LLAVE = `pedido-${token}`;

export function Pedir() {
  const [datos, setDatos] = useState<Lugar | null>(null);
  const [error, setError] = useState("");
  const [cant, setCant] = useState<Record<string, number>>({});
  const [cliente, setCliente] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState<string | null>(() => { try { return localStorage.getItem(LLAVE); } catch { return null; } });
  const [estado, setEstado] = useState<EstadoPedido | null>(null);

  useEffect(() => {
    fetch(`/api/publico/lugar?t=${encodeURIComponent(token)}`).then(async (r) => {
      const d = (await r.json()) as Lugar & { error?: string };
      if (!r.ok) return setError(d.error ?? "Este código no sirve.");
      setDatos(d);
    }).catch(() => setError("Sin conexión. Intente de nuevo."));
  }, []);

  // El estado del pedido, cada 5 s mientras está pendiente (la referencia evita volver a
  // armar el intervalo con cada respuesta).
  const ultimo = useRef<EstadoPedido | null>(null);
  ultimo.current = estado;
  useEffect(() => {
    if (!pedido) return;
    let vivo = true;
    const mirar = async () => {
      try {
        const r = await fetch(`/api/publico/pedido?t=${encodeURIComponent(token)}&id=${encodeURIComponent(pedido)}`);
        if (!vivo) return;
        if (r.ok) setEstado((await r.json()) as EstadoPedido);
        else if (r.status === 404) { try { localStorage.removeItem(LLAVE); } catch { /* nada */ } setPedido(null); }
      } catch { /* sin señal: se reintenta */ }
    };
    void mirar();
    const t = setInterval(() => { if (!ultimo.current || ultimo.current.estado === "pendiente") void mirar(); }, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, [pedido]);

  if (error) return <main className="cliente"><h1>Retén del Gorgojo</h1><p className="aviso-cliente">{error}</p></main>;
  if (!datos) return <main className="cliente"><p className="tenue">Cargando la carta…</p></main>;

  const padres = new Set(datos.carta.filter((p) => p.padre).map((p) => p.padre));
  const productos = datos.carta.filter((p) => !padres.has(p.id)); // con opciones, se escoge cuál
  const elegidos = productos.filter((p) => (cant[p.id] ?? 0) > 0);
  const valor = elegidos.reduce((t, p) => t + p.precio * cant[p.id], 0);
  const sumar = (id: string, d: number) => setCant((c) => ({ ...c, [id]: Math.max(0, Math.min(30, (c[id] ?? 0) + d)) }));

  const pedir = async () => {
    setEnviando(true);
    setError("");
    try {
      const r = await fetch("/api/publico/pedido", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, cliente, nota, lineas: elegidos.map((p) => ({ producto: p.id, cantidad: cant[p.id] })) }),
      });
      const d = (await r.json()) as { id: string; error?: string };
      if (!r.ok) { setEnviando(false); return setError(d.error ?? "No se pudo enviar."); }
      try { localStorage.setItem(LLAVE, d.id); } catch { /* sin almacenamiento */ }
      setCant({}); setNota(""); setEstado(null); setPedido(d.id);
    } catch { setError("Sin conexión. Intente de nuevo."); }
    setEnviando(false);
  };

  return (
    <main className="cliente">
      <header className="cabeza-cliente">
        <h1>Retén del Gorgojo</h1>
        <p>{datos.lugar.nombre}</p>
      </header>
      {pedido && estado && <EstadoDelPedido e={estado} nuevo={() => { try { localStorage.removeItem(LLAVE); } catch { /* nada */ } setPedido(null); setEstado(null); }} />}
      {datos.cerrado ? (
        <p className="aviso-cliente">Ahora no estamos recibiendo pedidos por aquí. Pídale al personal. 🙌</p>
      ) : (!pedido || estado?.estado !== "pendiente") && (
        <>
          {SECCIONES.map(([titulo, cats]) => {
            const lista = productos.filter((p) => cats.includes(p.categoria));
            if (!lista.length) return null;
            return (
              <section key={titulo}>
                <h2>{titulo}</h2>
                <ul className="carta">
                  {lista.map((p) => (
                    <li key={p.id}>
                      <span className="punto" style={{ background: p.fondo }} />
                      <span className="nombre">{p.nombre}<small>{pesos(p.precio)}</small></span>
                      {(cant[p.id] ?? 0) > 0 && <button aria-label={`Una ${p.nombre} menos`} onClick={() => sumar(p.id, -1)}>−</button>}
                      {(cant[p.id] ?? 0) > 0 && <b>{cant[p.id]}</b>}
                      <button className="mas" aria-label={`Una ${p.nombre} más`} onClick={() => sumar(p.id, 1)}>＋</button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {elegidos.length > 0 && (
            <section className="pedido">
              <input placeholder="Su nombre o cómo lo reconocemos (opcional)" maxLength={40} value={cliente} onChange={(e) => setCliente(e.target.value)} />
              <input placeholder="Algo más (opcional): sin hielo, bien fría…" maxLength={120} value={nota} onChange={(e) => setNota(e.target.value)} />
              <button className="pedir" disabled={enviando} onClick={pedir}>
                Pedir {elegidos.reduce((t, p) => t + cant[p.id], 0)} · {pesos(valor)}
              </button>
              <p className="tenue">El personal confirma su pedido; se paga con su cuenta, como siempre.</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function EstadoDelPedido({ e, nuevo }: { e: EstadoPedido; nuevo: () => void }) {
  if (e.estado === "pendiente") return <p className="estado-cliente pendiente">⏳ Recibimos su pedido. Ya lo confirmamos…</p>;
  if (e.estado === "rechazada") return (
    <div className="estado-cliente rechazado">
      <p>😔 Lo sentimos, no podemos atender ese pedido: «{e.motivo}».</p>
      <button onClick={nuevo}>Pedir otra cosa</button>
    </div>
  );
  const faltan = e.aceptadas ? e.lineas.filter((l) => !e.aceptadas!.includes(l.id)) : [];
  return (
    <div className="estado-cliente aceptado">
      <p>✅ ¡Confirmado! Ya se lo llevamos.</p>
      {faltan.length > 0 && <p>No hay: {faltan.map((l) => `${l.cantidad} ${l.nombre}`).join(", ")} — «{e.motivo}».</p>}
      <button onClick={nuevo}>Pedir algo más</button>
    </div>
  );
}
