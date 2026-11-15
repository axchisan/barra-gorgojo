// Pedidos de los clientes por QR (docs/20): la solicitud, aceptarla (todo o en parte) y rechazarla.
import { describe, expect, it } from "vitest";
import { aplicar, estadoVacio, recortar, type Operacion } from "../src/dominio/estado";
import { solicitudesPendientes } from "../src/dominio/solicitudes";

const T0 = 1_800_000_000_000;
let n = 0;
const op = (o: Record<string, unknown>, en = T0 + ++n, persona = "Barra"): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona, en, ...o }) as Operacion;
const lugar = { token: "codigo-de-prueba-123", tipo: "mesa", numero: 4, nombre: "Mesa 4" };
const solicitud = (id: string, extra: Record<string, unknown> = {}) => op({ t: "solicitud", solicitud: { id, lugar, lineas: [
  { id: `${id}-a`, producto: "rubia", nombre: "Rubia", precio: 4000, cantidad: 2 },
  { id: `${id}-b`, producto: "gaseosa", nombre: "Gaseosa personal", precio: 3000, cantidad: 1 },
], ...extra } }, T0 + ++n, "Cliente · Mesa 4");
const correr = (ops: Operacion[]) => ops.reduce((e, o) => aplicar(e, o), estadoVacio());

describe("pedidos por QR", () => {
  it("una solicitud queda pendiente, con lo pedido; repetirla no duplica", () => {
    const s = solicitud("s1", { cliente: " los de rojo ", nota: "sin vaso" });
    const e = correr([s, s]);
    expect(solicitudesPendientes(e.solicitudes).map((x) => x.id)).toEqual(["s1"]);
    expect(e.solicitudes?.s1).toMatchObject({ estado: "pendiente", cliente: "los de rojo", nota: "sin vaso", lugar: { nombre: "Mesa 4" } });
  });

  it("lo que no tiene sentido no queda: cantidades fuera de tope o sin líneas", () => {
    const e = correr([op({ t: "solicitud", solicitud: { id: "s2", lugar, lineas: [{ id: "x", producto: "rubia", nombre: "Rubia", precio: 4000, cantidad: 999 }] } })]);
    expect(e.solicitudes?.s2).toBeUndefined();
  });

  it("aceptar todo; aceptar en parte guarda qué y por qué no lo demás", () => {
    const e = correr([solicitud("s1"), solicitud("s2"),
      op({ t: "aceptar_solicitud", solicitud: "s1", cuenta: "c1" }),
      op({ t: "aceptar_solicitud", solicitud: "s2", cuenta: "c2", aceptadas: ["s2-a"], motivo: " Se acabó la gaseosa " })]);
    expect(e.solicitudes?.s1).toMatchObject({ estado: "aceptada", resuelta: { por: "Barra", cuenta: "c1" } });
    expect(e.solicitudes?.s1.resuelta?.aceptadas).toBeUndefined();
    expect(e.solicitudes?.s2.resuelta).toMatchObject({ aceptadas: ["s2-a"], motivo: "Se acabó la gaseosa" });
  });

  it("rechazar exige motivo; lo ya resuelto no cambia (otro celular llegó primero)", () => {
    const e = correr([solicitud("s1"),
      op({ t: "rechazar_solicitud", solicitud: "s1", motivo: " " }),
      op({ t: "rechazar_solicitud", solicitud: "s1", motivo: "Ya cerramos la cocina" }, T0 + 1000, "Ana"),
      op({ t: "aceptar_solicitud", solicitud: "s1", cuenta: "c1" }, T0 + 2000, "Beto")]);
    expect(e.solicitudes?.s1).toMatchObject({ estado: "rechazada", resuelta: { por: "Ana", motivo: "Ya cerramos la cocina" } });
  });

  it("en el celular quedan las pendientes y las resueltas de las últimas 36 horas", () => {
    const e = correr([solicitud("s1"), solicitud("s2"), op({ t: "rechazar_solicitud", solicitud: "s1", motivo: "No hay" })]);
    expect(Object.keys(recortar(e, T0 + 2 * 3600_000).solicitudes ?? {}).sort()).toEqual(["s1", "s2"]);
    expect(Object.keys(recortar(e, T0 + 40 * 3600_000).solicitudes ?? {})).toEqual(["s2"]);
  });
});
