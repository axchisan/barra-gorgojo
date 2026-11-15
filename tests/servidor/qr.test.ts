// Pedidos de los clientes por QR con el Worker real (docs/20): la ruta pública, sus límites
// y lo que hace el personal.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { arrancar, op, type Servidor } from "./arrancar";

describe("pedidos por QR", () => {
  let s: Servidor;
  let admin: string;
  let ana: string;
  let token = "";
  let tokenCancha = "";
  const json = async (r: Response) => ({ status: r.status, datos: (await r.json()) as any });
  const qr = (cuerpo: unknown) => s.pedir(admin, "/api/admin/qr", { method: "POST", body: JSON.stringify(cuerpo) });
  const publico = (ruta: string, init?: RequestInit) => fetch(new URL(ruta, s.dir), init);
  const pedir = (t: string, lineas: unknown[], extra: Record<string, unknown> = {}) =>
    publico("/api/publico/pedido", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t, lineas, ...extra }) });

  beforeAll(async () => {
    s = await arrancar();
    admin = await s.token("Administrador");
    ana = await s.token("Ana");
    token = (await json(await qr({ accion: "crear", tipo: "mesa", numero: 4 }))).datos.lugar.token;
    tokenCancha = (await json(await qr({ accion: "crear", tipo: "cancha", cancha: "2" }))).datos.lugar.token;
  });
  afterAll(() => s?.apagar());

  it("solo el administrador maneja los códigos; un código inventado no sirve", async () => {
    expect((await s.pedir(ana, "/api/admin/qr")).status).toBe(403);
    expect((await publico("/api/publico/lugar?t=inventado-1234567")).status).toBe(404);
  });

  it("apagado de entrada: la carta sale vacía y no se puede pedir", async () => {
    const lugar = await json(await publico(`/api/publico/lugar?t=${token}`));
    expect(lugar.datos).toMatchObject({ lugar: { nombre: "Mesa 4" }, cerrado: true, carta: [] });
    expect((await pedir(token, [{ producto: "rubia", cantidad: 1 }])).status).toBe(403);
  });

  it("encendido: la carta trae los productos con su precio (en la cancha, el de cancha), sin valor libre", async () => {
    await qr({ accion: "encender", encendido: true });
    const mesa = (await json(await publico(`/api/publico/lugar?t=${token}`))).datos;
    expect(mesa.cerrado).toBe(false);
    expect(mesa.carta.find((p: { id: string }) => p.id === "rubia").precio).toBe(4000);
    expect(mesa.carta.some((p: { id: string }) => p.id === "mecato" || p.id === "otro")).toBe(false);
    const cancha = (await json(await publico(`/api/publico/lugar?t=${tokenCancha}`))).datos;
    expect(cancha.carta.find((p: { id: string }) => p.id === "rubia").precio).toBe(4500);
  });

  it("un pedido válido queda pendiente para el personal; el cliente ve su estado; el ritmo tiene límite", async () => {
    const malo = await json(await pedir(token, [{ producto: "mecato", cantidad: 1 }]));
    expect(malo.status).toBe(400);
    expect((await pedir(token, [{ producto: "rubia", cantidad: 99 }])).status).toBe(400);
    const r = await json(await pedir(token, [{ producto: "rubia", cantidad: 2 }, { producto: "gaseosa", cantidad: 1, nota: "fría" }], { cliente: "los de rojo" }));
    expect(r.status).toBe(200);
    const id = r.datos.id as string;
    const foto = await s.foto(ana);
    expect(foto.estado.solicitudes[id]).toMatchObject({ estado: "pendiente", cliente: "los de rojo", lugar: { nombre: "Mesa 4" } });
    expect(foto.estado.solicitudes[id].lineas.map((l: { precio: number }) => l.precio)).toEqual([4000, 3000]);
    // Otro pedido enseguida, desde el mismo código: espere.
    expect((await pedir(token, [{ producto: "rubia", cantidad: 1 }])).status).toBe(429);
    // El estado, solo con su propio código.
    expect((await json(await publico(`/api/publico/pedido?t=${token}&id=${id}`))).datos.estado).toBe("pendiente");
    expect((await publico(`/api/publico/pedido?t=${tokenCancha}&id=${id}`)).status).toBe(404);

    // El personal acepta en parte: lo demás, con su motivo, lo ve el cliente.
    const linea = foto.estado.solicitudes[id].lineas[0].id;
    const ok = (await s.ops(ana, [op({ t: "aceptar_solicitud", solicitud: id, cuenta: "mesa-4", aceptadas: [linea], motivo: "Se acabó la gaseosa" })])) as any;
    expect(ok.rechazadas).toEqual([]);
    const visto = (await json(await publico(`/api/publico/pedido?t=${token}&id=${id}`))).datos;
    expect(visto).toMatchObject({ estado: "aceptada", aceptadas: [linea], motivo: "Se acabó la gaseosa" });
    // Otro celular que intenta rechazarla ya resuelta: se le dice por qué no.
    const tarde = (await s.ops(admin, [op({ t: "rechazar_solicitud", solicitud: id, motivo: "No hay" })])) as any;
    expect(tarde.rechazadas[0].motivo).toMatch(/ya se aceptó/);
  });

  it("un celular del personal no puede inventarse una solicitud", async () => {
    const r = (await s.ops(admin, [op({ t: "solicitud", solicitud: { id: "falsa", lugar: { token, tipo: "mesa", nombre: "Mesa 4" }, lineas: [] } })])) as any;
    expect(r.rechazadas[0].motivo).toBe("Los pedidos de los clientes llegan solo por el QR.");
  });

  it("cambiar el código deja sin servir el viejo (si alguien copió el QR)", async () => {
    const nuevo = (await json(await qr({ accion: "rotar", token: tokenCancha }))).datos.lugar.token;
    expect(nuevo).not.toBe(tokenCancha);
    expect((await publico(`/api/publico/lugar?t=${tokenCancha}`)).status).toBe(404);
    expect((await publico(`/api/publico/lugar?t=${nuevo}`)).status).toBe(200);
  });
});
