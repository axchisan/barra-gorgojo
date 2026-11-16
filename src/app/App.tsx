// La app: sesión y qué pantalla se ve. Cada pantalla vive en pantallas/.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Avisos } from "./avisos";
import { AvisoDespacho, AvisoRechazo } from "./componentes/Despacho";
import { AvisoVersion } from "./componentes/AvisoVersion";
import { FranjaPruebas } from "./componentes/FranjaPruebas";
import { HojaAtajos } from "./componentes/HojaAtajos";
import { escribiendo, useAtajos } from "./atajos";
import { useNavegacion } from "./navegacion";
import { ponerAlDiaPush } from "./push";
import { Anotar } from "./pantallas/Anotar";
import { Cobrar } from "./pantallas/Cobrar";
import { Detalle } from "./pantallas/Detalle";
import { EditarProducto } from "./pantallas/EditarProducto";
import { Entrada } from "./pantallas/Entrada";
import { Inicio } from "./pantallas/Inicio";
import { DiaPasado, Dias } from "./pantallas/Dias";
import { Auditoria } from "./pantallas/Auditoria";
import { MiPin, Personas } from "./pantallas/Personas";
import { DeudorDetalle, Deudas } from "./pantallas/Deudas";
import { Platos } from "./pantallas/Platos";
import { AvisoSolicitudes, Solicitudes } from "./pantallas/Solicitudes";
import { CodigosQR } from "./pantallas/CodigosQR";
import { AvisoDomicilios } from "./componentes/Domicilios";
import { Productos } from "./pantallas/Productos";
import { sinc } from "./sincronizacion";

export function App() {
  useSyncExternalStore(sinc.suscribir, sinc.instantanea);
  const nav = useNavegacion();
  const [, refrescar] = useState(0);
  const [atajos, setAtajos] = useState(false);
  // Teclado físico (docs/02): Esc es «atrás» (cierra la hoja o vuelve), sin salirse de la app.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (escribiendo(e.target)) { (e.target as HTMLElement).blur(); return; }
      if (history.state?.capa || (history.state?.d ?? 0) > 0) { e.preventDefault(); history.back(); }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, []);
  useAtajos({ "?": () => setAtajos(true) }, !!sinc.sesion);
  // Avisos con la app cerrada (docs/18 fase 4): tocar el aviso trae aquí, a «Despachar».
  useEffect(() => {
    const irA = (ir: unknown) => {
      if (ir === "despacho") nav.ir({ v: "inicio", pestana: "despacho" });
      else if (ir === "personas") nav.ir({ v: "personas" });
    };
    const pedido = new URLSearchParams(location.search).get("ir");
    if (pedido) { history.replaceState(history.state, "", location.pathname); irA(pedido); }
    const alMensaje = (e: MessageEvent) => { if (e.data?.tipo === "ir") irA(e.data.ir); };
    navigator.serviceWorker?.addEventListener("message", alMensaje);
    return () => navigator.serviceWorker?.removeEventListener("message", alMensaje);
  }, []);
  // Quien entra en un aparato que ya recibe avisos queda como su dueño (avisos por persona y área).
  const token = sinc.sesion?.token;
  useEffect(() => { if (token) void ponerAlDiaPush(); }, [token]);
  useEffect(() => {
    const t = setInterval(() => refrescar((x) => x + 1), 30_000); // «hace N min»
    return () => clearInterval(t);
  }, []);

  if (!sinc.listo) return null; // leyendo la memoria del celular: unos milisegundos
  if (!sinc.sesion) return <><FranjaPruebas /><Entrada /></>;

  const { vista } = nav;
  return (
    <>
      <FranjaPruebas />
      <AvisoDespacho nav={nav} />
      <AvisoRechazo />
      <AvisoSolicitudes nav={nav} />
      <AvisoDomicilios nav={nav} />
      {vista.v === "inicio" && <Inicio nav={nav} pestana={vista.pestana} />}
      {vista.v === "anotar" && <Anotar key={vista.despacho ? "despacho" : vista.cuenta ?? "nueva"} nav={nav} cuentaId={vista.cuenta} repetir={vista.repetir} despacho={vista.despacho} />}
      {vista.v === "cuenta" && <Detalle nav={nav} id={vista.id} />}
      {vista.v === "cobrar" && <Cobrar nav={nav} id={vista.id} />}
      {vista.v === "productos" && <Productos nav={nav} />}
      {vista.v === "producto" && <EditarProducto key={vista.id ?? `nuevo-${vista.padre ?? ""}`} nav={nav} id={vista.id} padre={vista.padre} />}
      {vista.v === "platos" && <Platos nav={nav} />}
      {vista.v === "deudas" && <Deudas nav={nav} />}
      {vista.v === "deudor" && <DeudorDetalle nav={nav} id={vista.id} />}
      {vista.v === "personas" && <Personas nav={nav} />}
      {vista.v === "mipin" && <MiPin nav={nav} />}
      {vista.v === "dias" && <Dias nav={nav} />}
      {vista.v === "dia" && <DiaPasado key={vista.fecha} nav={nav} fecha={vista.fecha} />}
      {vista.v === "auditoria" && <Auditoria nav={nav} />}
      {vista.v === "solicitudes" && <Solicitudes nav={nav} />}
      {vista.v === "qr" && <CodigosQR nav={nav} />}
      <Avisos />
      <AvisoVersion />
      {atajos && <HojaAtajos cerrar={() => setAtajos(false)} />}
    </>
  );
}
