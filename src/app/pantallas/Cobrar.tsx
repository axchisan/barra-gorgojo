import { useState } from "react";
import { saldo, totalComida, type Medio } from "../../dominio/estado";
import { pesos } from "../../dominio/formato";
import { ponerAviso } from "../avisos";
import { Desglose } from "../componentes/Desglose";
import { NoExiste } from "../componentes/NoExiste";
import type { Nav } from "../navegacion";
import { sinc } from "../sincronizacion";

export function Cobrar({ nav, id }: { nav: Nav; id: string }) {
  const c = sinc.visible.cuentas[id];
  const [medio, setMedio] = useState<Exclude<Medio, "comida">>("efectivo");
  const [recibido, setRecibido] = useState<number | null>(null);
  const [otro, setOtro] = useState("");
  if (!c) return <NoExiste nav={nav} />;
  const valor = saldo(c);
  if (valor <= 0) return <NoExiste nav={nav} />;

  const billetes = [10_000, 20_000, 50_000, 100_000].filter((b) => b > valor).slice(0, 3);
  const cambio = medio === "efectivo" && recibido != null ? recibido - valor : null;

  const cobrar = (m: Medio) => {
    sinc.emitir({ t: "cobrar", cuenta: c.id, pago: crypto.randomUUID(), medio: m, recibido: m === "efectivo" ? recibido ?? undefined : undefined });
    nav.aInicio();
    ponerAviso({
      texto: m === "comida" ? `${c.nombre}: pasada a comida · ${pesos(valor)}` : `${c.nombre}: cobrada · ${pesos(valor)}`,
      deshacer: () => sinc.emitir({ t: "reabrir", cuenta: c.id }),
    });
  };

  return (
    <main className="cobrar">
      <header className="barra-superior">
        <button className="atras" onClick={nav.volver} aria-label="Volver">←</button>
        <strong>Cobrar · {c.nombre}</strong>
      </header>
      <p className="total">{pesos(valor)}</p>
      {totalComida(c) > 0 && <Desglose c={c} />}
      <div className="opciones">
        {(["efectivo", "nequi", "breve"] as const).map((m) => (
          <button key={m} className={medio === m ? "chip activo" : "chip"} onClick={() => setMedio(m)}>
            {m === "efectivo" ? "Efectivo" : m === "nequi" ? "Nequi" : "Breve"}
          </button>
        ))}
      </div>
      {medio === "efectivo" && (
        <section className="recibido">
          <p>¿Con cuánto paga?</p>
          <div className="opciones">
            <button className={recibido === valor ? "chip activo" : "chip"} onClick={() => { setRecibido(valor); setOtro(""); }}>Exacto</button>
            {billetes.map((b) => (
              <button key={b} className={recibido === b ? "chip activo" : "chip"} onClick={() => { setRecibido(b); setOtro(""); }}>{pesos(b)}</button>
            ))}
          </div>
          <input inputMode="numeric" placeholder="Otro valor" value={otro} onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            setOtro(v);
            setRecibido(v ? Number(v) : null);
          }} />
          {cambio != null && (
            <p className={cambio < 0 ? "cambio falta" : "cambio"}>
              {cambio < 0 ? `Faltan ${pesos(-cambio)}` : `Cambio: ${pesos(cambio)}`}
            </p>
          )}
        </section>
      )}
      <div className="pie-fijo">
        {c.tipo === "mesa" ? (
          <>
            <button className="principal grande" onClick={() => cobrar(medio)} disabled={cambio != null && cambio < 0}>Cobrar aquí</button>
            <button className="comida grande" onClick={() => cobrar("comida")}>Pasar a comida</button>
          </>
        ) : (
          <button className="principal grande" onClick={() => cobrar(medio)} disabled={cambio != null && cambio < 0}>Cobrar {pesos(valor)}</button>
        )}
      </div>
    </main>
  );
}
