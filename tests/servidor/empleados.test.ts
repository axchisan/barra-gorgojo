// Accesos de empleados (docs/17) y precio de los adicionales (docs/04), con el Worker real.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { arrancar, esperar, idDe, op, type Servidor } from "./arrancar";

const SIEMPRE = { semanal: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, desde: 0, hasta: 1440 })), especiales: [] };
const NUNCA = { semanal: [], especiales: [] };

describe("accesos de empleados", () => {
  let s: Servidor;
  let admin: string;
  let ana: string;
  const json = async (r: Response) => ({ status: r.status, datos: (await r.json()) as any });
  const accion = (cuerpo: unknown) => s.pedir(admin, "/api/admin/personas", { method: "POST", body: JSON.stringify(cuerpo) });
  const hoy = () => new Date(Date.now() - 10 * 3600_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    s = await arrancar();
    admin = await s.token("Administrador");
    ana = await s.token("Ana");
    expect((await accion({ accion: "crear", nombre: "Jime", rol: "operador" })).status).toBe(200);
  });
  afterAll(() => s?.apagar());

  it("una persona nueva empieza con el horario de empleado y sin ver el día ni lo de otros días", async () => {
    const { datos } = await json(await s.pedir(admin, "/api/admin/personas"));
    const jime = datos.personas.find((p: { nombre: string }) => p.nombre === "Jime");
    expect(jime.horario).toEqual({ semanal: [{ dia: 0, desde: 480, hasta: 900 }], especiales: [] });
    expect(jime.permisos).toEqual([]);
    // Las sembradas conservan lo que veían.
    expect(datos.personas.find((p: { nombre: string }) => p.nombre === "Ana")).toMatchObject({ horario: null, permisos: ["dia", "historial"] });
  });

  it("fuera de su horario no entra, y se le dice cuándo puede (sin gastar intentos de PIN)", async () => {
    await accion({ accion: "horario", id: idDe("Jime"), horario: NUNCA });
    const r = await json(await s.entrar("Jime", "", { pinNuevo: "1234" }));
    expect(r.status).toBe(403);
    expect(r.datos.error).toMatch(/no tiene acceso/);
  });

  it("dentro de su horario entra; no recibe cierres de caja ni deudas de otros días, y no cierra la caja", async () => {
    // Una deuda de hoy, a nombre de Pedro.
    await s.ops(ana, [
      op({ t: "abrir", cuenta: "fiada", nombre: "Fiada", tipo: "grupo" }),
      op({ t: "anotar", cuenta: "fiada", ronda: "rf", lineas: [{ id: "lf", producto: "rubia", cantidad: 1 }] }),
      op({ t: "cobrar", cuenta: "fiada", pago: "pf", medio: "deuda", deudor: "Pedro" }),
      op({ t: "cerrar_jornada", fecha: hoy(), contado: 0 }),
    ]);
    await accion({ accion: "horario", id: idDe("Jime"), horario: SIEMPRE });
    const jime = await s.token("Jime");
    const f = await s.foto(jime);
    expect(f.estado.jornadas).toBeUndefined();
    expect(f.estado.deudas.pedro.movimientos).toHaveLength(1);
    expect(Object.keys(f.estado.cuentas)).toContain("fiada");
    const r = (await s.ops(jime, [op({ t: "cerrar_jornada", fecha: hoy(), contado: 0 })])) as any;
    expect(r.rechazadas.map((x: { motivo: string }) => x.motivo)).toEqual(["El cierre de caja lo hace la administración."]);
    // Con el permiso «dia», sí.
    await accion({ accion: "permisos", id: idDe("Jime"), permisos: ["dia"] });
    expect((await s.foto(jime)).estado.jornadas).toBeTruthy();
    await accion({ accion: "permisos", id: idDe("Jime"), permisos: [] });
  });

  it("al entrar se le dice qué ve y hasta cuándo", async () => {
    const r = await json(await s.entrar("Jime", "1234"));
    expect(r.datos).toMatchObject({ dia: false, historial: false, horario: expect.stringContaining("Domingos") });
    expect(typeof r.datos.fin).toBe("number");
  });

  it("si le quitan el horario mientras está adentro, sale (WebSocket) y la API ya no le responde", async () => {
    const jime = await s.token("Jime");
    const ws = await s.conectar(jime);
    await accion({ accion: "horario", id: idDe("Jime"), horario: NUNCA });
    await esperar(() => ws.mensajes.some((m) => m.tipo === "horario"));
    ws.cerrar();
    expect(await json(await s.pedir(jime, "/api/foto"))).toMatchObject({ status: 403, datos: { error: "horario" } });
    // Lo anotado ahora (fuera de su horario) se rechaza con su porqué, no se pierde en silencio.
    const r = await json(await s.opsCrudo(jime, [op({ t: "abrir", cuenta: "tarde", nombre: "Tarde", tipo: "grupo" })]));
    expect(r.status).toBe(403);
    expect(r.datos.rechazadas[0].motivo).toMatch(/fuera de su horario/);
  });

  it("lo anotado dentro de su horario y enviado después sí entra", async () => {
    await accion({ accion: "horario", id: idDe("Jime"), horario: SIEMPRE });
    const jime = await s.token("Jime");
    // Termina su horario justo ahora: franja de hoy que acabó hace un minuto (y la operación es de antes).
    const ahora = new Date(Date.now() - 5 * 3600_000);
    const minuto = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
    if (minuto < 10) return; // cerca de la medianoche la franja de prueba no cabe
    await accion({ accion: "horario", id: idDe("Jime"), horario: { semanal: [], especiales: [{ fecha: ahora.toISOString().slice(0, 10), desde: 0, hasta: minuto - 1 }] } });
    const r = await json(await s.opsCrudo(jime, [op({ t: "abrir", cuenta: "a-tiempo", nombre: "A tiempo", tipo: "grupo", en: Date.now() - 10 * 60_000 })]));
    expect(r.status).toBe(403);
    expect(r.datos.ok).toHaveLength(1);
  });

  it("el administrador no tiene horario", async () => {
    expect((await accion({ accion: "horario", id: idDe("Administrador"), horario: NUNCA })).status).toBe(400);
  });
});

describe("precio de los adicionales en el servidor", () => {
  let s: Servidor;
  let ana: string;
  beforeAll(async () => {
    s = await arrancar();
    ana = await s.token("Ana");
  });
  afterAll(() => s?.apagar());

  it("un adicional de una versión anterior (sin precio) va a precio normal; un chico, a cancha", async () => {
    const r = await s.ops(ana, [
      op({ t: "abrir", cuenta: "c2", nombre: "Cancha 2", tipo: "cancha", cancha: "2" }),
      op({ t: "anotar", cuenta: "c2", ronda: "chico", lineas: [{ id: "l1", producto: "rubia", cantidad: 1 }] }),
      op({ t: "anotar", cuenta: "c2", ronda: "adic", adicional: true, lineas: [{ id: "l2", producto: "rubia", cantidad: 4 }] }),
    ]);
    expect(r.estado.cuentas.c2.lineas.map((l: { precio: number }) => l.precio)).toEqual([4500, 4000]);
    expect(r.estado.cuentas.c2.rondas.map((x: { precio?: string }) => x.precio)).toEqual(["cancha", "normal"]);
  });

  it("cambiar el precio de una pedida queda con los precios fijados en el registro", async () => {
    const r = await s.ops(ana, [op({ t: "precio_ronda", cuenta: "c2", ronda: "adic", precio: "cancha", precios: { l2: 1 } })]);
    expect(r.estado.cuentas.c2.lineas[1].precio).toBe(4500); // lo que mande el celular en `precios` se descarta
    const respaldo = await (await s.pedir(await s.token("Administrador"), "/api/admin/respaldo")).json() as { operaciones: { t: string; precios?: unknown }[] };
    expect(respaldo.operaciones.find((o) => o.t === "precio_ronda")?.precios).toEqual({ l2: 4500 });
  });

  it("una cuenta cobrada no cambia de precio: se rechaza con el porqué", async () => {
    await s.ops(ana, [op({ t: "cobrar", cuenta: "c2", pago: "p", medio: "efectivo" })]);
    const r = (await s.ops(ana, [op({ t: "precio_ronda", cuenta: "c2", ronda: "adic", precio: "normal" })])) as any;
    expect(r.rechazadas[0].motivo).toMatch(/ya se cobró/);
  });
});
