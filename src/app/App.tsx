// La app: sesión y qué pantalla se ve. Cada pantalla vive en pantallas/.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Avisos } from "./avisos";
import { AvisoDespacho } from "./componentes/Despacho";
import { useNavegacion } from "./navegacion";
import { Anotar } from "./pantallas/Anotar";
import { Cobrar } from "./pantallas/Cobrar";
import { Detalle } from "./pantallas/Detalle";
import { EditarProducto } from "./pantallas/EditarProducto";
import { Entrada } from "./pantallas/Entrada";
import { Inicio } from "./pantallas/Inicio";
import { Dias } from "./pantallas/Dias";
import { Auditoria } from "./pantallas/Auditoria";
import { MiPin, Personas } from "./pantallas/Personas";
import { DeudorDetalle, Deudas } from "./pantallas/Deudas";
import { Platos } from "./pantallas/Platos";
import { Productos } from "./pantallas/Productos";
import { sinc } from "./sincronizacion";

export function App() {
  useSyncExternalStore(sinc.suscribir, sinc.instantanea);
  const nav = useNavegacion();
  const [, refrescar] = useState(0);
  useEffect(() => {
    const t = setInterval(() => refrescar((x) => x + 1), 30_000); // «hace N min»
    return () => clearInterval(t);
  }, []);

  if (!sinc.listo) return null; // leyendo la memoria del celular: unos milisegundos
  if (!sinc.sesion) return <Entrada />;

  const { vista } = nav;
  return (
    <>
      <AvisoDespacho nav={nav} />
      {vista.v === "inicio" && <Inicio nav={nav} pestana={vista.pestana} />}
      {vista.v === "anotar" && <Anotar key={vista.despacho ? "despacho" : vista.cuenta ?? "nueva"} nav={nav} cuentaId={vista.cuenta} repetir={vista.repetir} despacho={vista.despacho} />}
      {vista.v === "cuenta" && <Detalle nav={nav} id={vista.id} />}
      {vista.v === "cobrar" && <Cobrar nav={nav} id={vista.id} />}
      {vista.v === "productos" && <Productos nav={nav} />}
      {vista.v === "producto" && <EditarProducto nav={nav} id={vista.id} />}
      {vista.v === "platos" && <Platos nav={nav} />}
      {vista.v === "deudas" && <Deudas nav={nav} />}
      {vista.v === "deudor" && <DeudorDetalle nav={nav} id={vista.id} />}
      {vista.v === "personas" && <Personas nav={nav} />}
      {vista.v === "mipin" && <MiPin nav={nav} />}
      {vista.v === "dias" && <Dias nav={nav} />}
      {vista.v === "auditoria" && <Auditoria nav={nav} />}
      <Avisos />
    </>
  );
}
