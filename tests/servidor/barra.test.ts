// Pruebas del Worker y del Durable Object reales, por HTTP y WebSocket.
// Corren con el catálogo de ejemplo (negocio.ejemplo/): rubia $ 4.000, cancha $ 4.500.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { arrancar, esperar, op, type Servidor } from "./arrancar";

const RUBIA = 4000;
const lineas = (pares: [string, number, Record<string, unknown>?][]) =>
  pares.map(([producto, cantidad, extra], i) => ({ id: `l${i}-${Math.random().toString(36).slice(2)}`, producto, cantidad, ...extra }));

describe("servidor", () => {
  let s: Servidor;
  let ana: string;
  let admin: string;

  beforeAll(async () => {
    s = await arrancar();
    ana = await s.token("Ana");
    admin = await s.token("Administrador");
  });
  afterAll(() => s?.apagar());

  describe("entrada", () => {
    it("rechaza a quien no está en la lista de personas", async () => {
      expect((await s.entrar("Intruso")).status).toBe(400);
    });

    it("rechaza la clave equivocada", async () => {
      expect((await s.entrar("Ana", "otra")).status).toBe(401);
    });

    it("sin sesión firmada no hay datos", async () => {
      expect((await fetch(new URL("/api/foto", s.dir))).status).toBe(401);
      const falsa = ana.replace(/\.[^.]+$/, ".firma-inventada");
      expect((await fetch(new URL("/api/foto", s.dir), { headers: { authorization: `Bearer ${falsa}` } })).status).toBe(401);
    });
  });

  describe("idempotencia por id", () => {
    it("reenviar las mismas operaciones no duplica nada y las vuelve a confirmar", async () => {
      const cuenta = `c-${Date.now()}`;
      const abrir = op({ t: "abrir", cuenta, nombre: "Reintento", tipo: "grupo" });
      const anotar = op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["rubia", 2]]) });

      const primera = await s.ops(ana, [abrir, anotar]);
      const segunda = await s.ops(ana, [abrir, anotar, anotar]);

      expect(primera.ok).toEqual([abrir.id, anotar.id]);
      expect(segunda.ok).toEqual([abrir.id, anotar.id, anotar.id]); // confirmadas: salen de la cola del celular
      expect(segunda.seq).toBe(primera.seq);
      const c = segunda.estado.cuentas[cuenta];
      expect(c.rondas).toHaveLength(1);
      expect(c.lineas.reduce((t: number, l: any) => t + l.precio * l.cantidad, 0)).toBe(2 * RUBIA);
    });

    it("la misma operación enviada a la vez por HTTP y por WebSocket se guarda una sola vez", async () => {
      const cuenta = `c-${Date.now()}-ws`;
      const abrir = op({ t: "abrir", cuenta, nombre: "Doble envío", tipo: "grupo" });
      const anotar = op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["rubia", 1]]) });
      const antes = (await s.foto(ana)).seq;

      const ws = await s.conectar(ana);
      const porWs = s.wsCrudo(ana);
      await new Promise((r) => porWs.addEventListener("open", r));
      porWs.send(JSON.stringify({ tipo: "ops", ops: [abrir, anotar] }));
      await Promise.all([s.ops(ana, [abrir, anotar]), s.ops(ana, [abrir, anotar])]);
      await esperar(() => ws.mensajes.filter((m) => m.tipo === "op").length >= 2);
      porWs.close();
      ws.cerrar();

      const foto = await s.foto(ana);
      expect(foto.seq).toBe(antes + 2);
      expect(foto.estado.cuentas[cuenta].rondas).toHaveLength(1);
    });
  });

  describe("catálogo", () => {
    it("rechaza cambios de catálogo y de orden de quien no es administrador", async () => {
      const antes = await s.foto(ana);
      const barata = op({ t: "producto", producto: { id: "rubia", nombre: "Rubia", corto: "RUBIA", categoria: "cerveza", precio: 1, activo: true, fondo: "#F2C230", texto: "#241206" } });
      const orden = op({ t: "orden", ids: ["agua", "rubia"] });
      const r = await s.ops(ana, [barata, orden]);

      // No se aplican, y vuelven con su motivo para que el celular los saque de la cola y avise.
      expect(r.ok).toEqual([]);
      expect((r as unknown as { rechazadas: { id: string; motivo: string }[] }).rechazadas.map((x) => x.id)).toEqual([barata.id, orden.id]);
      expect(r.seq).toBe(antes.seq);
      expect(r.estado.productos.rubia).toBeUndefined();
      expect(r.estado.orden).toEqual(antes.estado.orden);
    });

    it("el administrador sí cambia el catálogo, y el cambio no toca lo ya anotado", async () => {
      const cuenta = `c-${Date.now()}-cat`;
      await s.ops(ana, [op({ t: "abrir", cuenta, nombre: "Antes del cambio", tipo: "grupo" }), op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["light", 1]]) })]);
      const cara = op({ t: "producto", producto: { id: "light", nombre: "Light", corto: "LIGHT", categoria: "cerveza", precio: 5200, activo: true, fondo: "#9CC9EC", texto: "#241206" } });
      const r = await s.ops(admin, [cara]);
      expect(r.estado.productos.light.precio).toBe(5200);
      await s.ops(ana, [op({ t: "anotar", cuenta, ronda: "r2", lineas: lineas([["light", 1]]) })]);
      const c = (await s.foto(ana)).estado.cuentas[cuenta];
      expect(c.lineas.map((l: any) => l.precio)).toEqual([4500, 5200]);
    });
  });

  describe("precio fijado por el servidor", () => {
    it("ignora el precio y el precioFijado que manda el celular, y escribe el suyo", async () => {
      const cuenta = `c-${Date.now()}-pf`;
      const ws = await s.conectar(ana);
      const anotar = op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["rubia", 3, { precio: 1, precioFijado: 1 }]]) });
      const r = await s.ops(ana, [op({ t: "abrir", cuenta, nombre: "Tramposo", tipo: "grupo" }), anotar]);

      expect(r.estado.cuentas[cuenta].lineas[0].precio).toBe(RUBIA);
      await esperar(() => ws.mensajes.some((m) => m.tipo === "op" && m.op.id === anotar.id));
      const guardada = ws.mensajes.find((m) => m.tipo === "op" && m.op.id === anotar.id).op;
      ws.cerrar();
      expect(guardada.lineas[0].precioFijado).toBe(RUBIA);
    });

    it("en cancha fija el precio de cancha", async () => {
      const cuenta = `c-${Date.now()}-k`;
      const r = await s.ops(ana, [
        op({ t: "abrir", cuenta, nombre: "Cancha 1", tipo: "cancha", cancha: "1" }),
        op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["rubia", 2]]) }),
      ]);
      expect(r.estado.cuentas[cuenta].lineas[0].precio).toBe(4500);
    });
  });

  describe("quién y cuándo los pone el servidor", () => {
    it("la persona sale de la sesión, no de la operación, y la hora futura se acota", async () => {
      const cuenta = `c-${Date.now()}-q`;
      const enElFuturo = Date.now() + 7 * 24 * 3600_000;
      const r = await s.ops(ana, [
        op({ t: "abrir", cuenta, nombre: "Suplantación", tipo: "grupo", persona: "Administrador", en: enElFuturo }),
        op({ t: "anotar", cuenta, ronda: "r1", persona: "Administrador", en: enElFuturo, lineas: lineas([["agua", 1]]) }),
      ]);
      const c = r.estado.cuentas[cuenta];
      expect(c.rondas[0].persona).toBe("Ana");
      expect(c.rondas[0].en).toBeLessThanOrEqual(Date.now());
    });

    it("descarta lo que no tiene forma de operación", async () => {
      const antes = (await s.foto(ana)).seq;
      const r = await s.ops(ana, [{ t: "abrir" }, { id: "corto", t: "abrir", en: 1, cuenta: "x" }, null, "texto"]);
      expect(r.ok).toEqual([]);
      expect(r.seq).toBe(antes);
    });
  });

  describe("foto", () => {
    it("trae las cuentas vigentes, el catálogo cambiado y el orden, con su seq", async () => {
      const foto = await s.foto(ana);
      expect(Object.keys(foto)).toEqual(expect.arrayContaining(["tipo", "estado", "seq"]));
      expect(foto.estado).toHaveProperty("cuentas");
      expect(foto.estado).toHaveProperty("productos");
      expect(foto.estado.productos.light.precio).toBe(5200);
      expect(Object.values(foto.estado.cuentas).length).toBeGreaterThan(0);
    });

    it("una cuenta cobrada sigue en la foto (es de las últimas 36 horas)", async () => {
      const cuenta = `c-${Date.now()}-cob`;
      const r = await s.ops(ana, [
        op({ t: "abrir", cuenta, nombre: "Cobrada", tipo: "grupo" }),
        op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["agua", 2]]) }),
        op({ t: "cobrar", cuenta, pago: "p1", medio: "efectivo" }),
      ]);
      expect(r.estado.cuentas[cuenta].pagos).toHaveLength(1);
    });
  });
});

describe("recalcular el registro al arrancar", () => {
  const carpeta = mkdtempSync(join(tmpdir(), "barra-"));
  afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

  it("con otro precio en el catálogo base del código, lo ya anotado no cambia (regla 0)", async () => {
    const cuenta = "cuenta-persistente";
    let s = await arrancar({ persistir: carpeta });
    try {
      const ana = await s.token("Ana");
      const r = await s.ops(ana, [
        op({ t: "abrir", cuenta, nombre: "Antes del despliegue", tipo: "grupo" }),
        op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["rubia", 2]]) }),
      ]);
      expect(r.estado.cuentas[cuenta].lineas[0].precio).toBe(RUBIA);
    } finally {
      await s.apagar();
    }

    // «Despliegue» con la rubia a $ 9.999 en el código: el Durable Object rearma el
    // estado aplicando el registro guardado.
    s = await arrancar({ persistir: carpeta, catalogo: "./tests/servidor/catalogo-cambiado.ts" });
    try {
      const ana = await s.token("Ana");
      const foto = await s.foto(ana);
      expect(foto.seq).toBe(2);
      expect(foto.estado.cuentas[cuenta].lineas[0].precio).toBe(RUBIA);
      const r = await s.ops(ana, [op({ t: "anotar", cuenta, ronda: "r2", lineas: lineas([["rubia", 1]]) })]);
      expect(r.estado.cuentas[cuenta].lineas.map((l: any) => l.precio)).toEqual([RUBIA, 9999]);
    } finally {
      await s.apagar();
    }
  });
});

describe("cambio de base (migración)", () => {
  const LLAVE = "llave-de-migracion-de-prueba";
  let s: Servidor;
  let admin: string;
  let ana: string;

  beforeAll(async () => {
    s = await arrancar({ base: "barra-v2", migracion: LLAVE });
    admin = await s.token("Administrador");
    ana = await s.token("Ana");
  });
  afterAll(() => s?.apagar());

  const importar = (operaciones: unknown[], llave = LLAVE, token = admin) =>
    s.pedir(token, "/api/admin/importar", { method: "POST", headers: { "x-migracion": llave }, body: JSON.stringify({ operaciones }) });

  it("la entrada y la foto dicen la base", async () => {
    expect(((await (await s.entrar("Ana")).json()) as { base: string }).base).toBe("barra-v2");
    expect((await s.foto(ana)).base).toBe("barra-v2");
  });

  it("no aplica operaciones de otra base, ni las que no dicen base (son de la original)", async () => {
    const abrir = op({ t: "abrir", cuenta: "vieja", nombre: "De la base vieja", tipo: "grupo" });
    for (const base of ["reten-del-gorgojo", undefined]) {
      const r = await s.opsCrudo(ana, [abrir], base);
      expect(r.status).toBe(409);
      const d = (await r.json()) as { ok: string[]; base: string; seq: number; estado: any };
      expect(d.ok).toEqual([]); // siguen pendientes en el celular, que las aparta al ver la base
      expect(d.base).toBe("barra-v2");
      expect(d.estado.cuentas.vieja).toBeUndefined();
    }
  });

  it("por WebSocket, a un envío de otra base responde con la foto de la base actual", async () => {
    const ws = await s.conectar(ana);
    const crudo = s.wsCrudo(ana);
    const recibidos: any[] = [];
    crudo.addEventListener("message", (e) => recibidos.push(JSON.parse(String(e.data))));
    await new Promise((r) => crudo.addEventListener("open", r));
    crudo.send(JSON.stringify({ tipo: "ops", ops: [op({ t: "abrir", cuenta: "vieja-ws", nombre: "X", tipo: "grupo" })] }));
    await esperar(() => recibidos.length > 0);
    crudo.close();
    ws.cerrar();
    expect(recibidos[0]).toMatchObject({ tipo: "foto", base: "barra-v2" });
    expect(recibidos[0].estado.cuentas["vieja-ws"]).toBeUndefined();
  });

  it("solo el administrador pide el respaldo y usa las rutas de administración", async () => {
    expect((await s.pedir(ana, "/api/admin/respaldo")).status).toBe(403);
    expect((await importar([], LLAVE, ana)).status).toBe(403);
    const r = await s.pedir(admin, "/api/admin/respaldo");
    expect(r.status).toBe(200);
    const d = (await r.json()) as { base: string; seq: number; operaciones: unknown[] };
    expect(d).toMatchObject({ base: "barra-v2", seq: 0, operaciones: [] });
  });

  it("importar exige la llave de migración", async () => {
    expect((await importar([op({ t: "abrir", cuenta: "x", nombre: "X", tipo: "grupo" })], "otra")).status).toBe(403);
  });

  it("rechaza un registro con operaciones inválidas o ids repetidos, sin guardar nada", async () => {
    const a = op({ t: "abrir", cuenta: "x", nombre: "X", tipo: "grupo" });
    expect((await importar([a, { t: "abrir" }])).status).toBe(400);
    expect((await importar([a, a])).status).toBe(400);
    expect((await s.foto(admin)).seq).toBe(0);
  });

  it("importa en una base vacía conservando id, persona, hora y precio fijado; después, 409", async () => {
    const ws = await s.conectar(ana);
    const hace = Date.now() - 3 * 3600_000;
    const registro = [
      { id: "mig-abrir-0001", t: "abrir", cuenta: "grupo-a", nombre: "Grupo A", tipo: "grupo", persona: "Beto", en: hace, seq: 77, recibida_en: hace },
      { id: "mig-anotar-0001", t: "anotar", cuenta: "grupo-a", ronda: "r1", persona: "Beto", en: hace + 1000, lineas: [{ id: "l1", producto: "rubia", cantidad: 3, precioFijado: 3900 }] },
      { id: "mig-cobrar-0001", t: "cobrar", cuenta: "grupo-a", pago: "p1", medio: "efectivo", persona: "Ana", en: hace + 2000 },
    ];
    const r = await importar(registro);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ base: "barra-v2", seq: 3, cuentas: 1, total: 3 * 3900 });

    const foto = await s.foto(ana);
    const c = foto.estado.cuentas["grupo-a"];
    expect(c.abiertaPor).toBe("Beto");
    expect(c.abiertaEn).toBe(hace);
    expect(c.lineas[0].precio).toBe(3900);
    expect(c.pagos[0]).toMatchObject({ medio: "efectivo", monto: 11700, persona: "Ana" });
    // Los celulares conectados reciben la foto nueva enseguida.
    await esperar(() => ws.mensajes.some((m) => m.tipo === "foto" && m.seq === 3));
    ws.cerrar();

    expect((await importar([op({ t: "abrir", cuenta: "otra", nombre: "Otra", tipo: "grupo" })])).status).toBe(409);
    // Reenviar el mismo id por la vía normal no duplica nada.
    const reenvio = await s.ops(ana, [registro[1]], "barra-v2");
    expect(reenvio.seq).toBe(3);
  });

  it("sin la variable MIGRACION, importar está apagado", async () => {
    const otro = await arrancar();
    try {
      const t = await otro.token("Administrador");
      const r = await otro.pedir(t, "/api/admin/importar", { method: "POST", headers: { "x-migracion": "" }, body: "{}" });
      expect(r.status).toBe(403);
    } finally {
      await otro.apagar();
    }
  });
});

describe("base con el catálogo entero en el registro (B9)", () => {
  it("con el catálogo base del código vacío, el registro migrado da las mismas cuentas y el mismo catálogo", async () => {
    // Registro «viejo», sobre el catálogo de ejemplo.
    const en = Date.now() - 3600_000;
    const viejo = [
      { id: "v-0001-xxxx", t: "producto", persona: "Administrador", en, producto: { id: "light", nombre: "Light", corto: "LIGHT", categoria: "cerveza", precio: 4500, precioCancha: 5000, activo: true, fondo: "#9CC9EC", texto: "#241206" } },
      { id: "v-0002-xxxx", t: "abrir", cuenta: "k", nombre: "Cancha 1", tipo: "cancha", cancha: "1", persona: "Ana", en: en + 1 },
      { id: "v-0003-xxxx", t: "anotar", cuenta: "k", ronda: "r1", persona: "Ana", en: en + 2, lineas: [
        { id: "k1", producto: "rubia", cantidad: 2 }, { id: "k2", producto: "light", cantidad: 1 },
        { id: "k3", producto: "mecato", cantidad: 1, precio: 2000 }, { id: "k4", producto: "otro", cantidad: 1, precio: 50000, nombre: "Almuerzo", comida: true },
      ] },
      { id: "v-0004-xxxx", t: "cobrar", cuenta: "k", pago: "p1", medio: "nequi", persona: "Ana", en: en + 3 },
      { id: "v-0005-xxxx", t: "orden", ids: ["light", "rubia"], persona: "Administrador", en: en + 4 },
    ].map((o, i) => ({ ...o, seq: i + 1 }));
    const { depurar } = await import("../../scripts/migracion");
    const { catalogo } = await import("../../src/dominio/estado");
    const r = depurar(viejo as never, { jornadas: [new Date(en - 10 * 3600_000).toISOString().slice(0, 10)], situaciones: ["cobrada"] });
    expect(r.errores).toEqual([]);

    const s = await arrancar({ catalogo: "./tests/servidor/catalogo-vacio.ts", migracion: "llave" });
    try {
      const admin = await s.token("Administrador");
      const imp = await s.pedir(admin, "/api/admin/importar", { method: "POST", headers: { "x-migracion": "llave" }, body: JSON.stringify({ operaciones: r.registro }) });
      expect(imp.status).toBe(200);
      const foto = await s.foto(admin);
      expect(foto.estado.cuentas.k).toEqual(r.nuevo.cuentas.k);
      // El catálogo que arma el celular con la foto (sin catálogo base) es el de antes.
      const deLaFoto = Object.values(foto.estado.productos as Record<string, { id: string }>);
      const orden = new Map((foto.estado.orden as string[]).map((id, i) => [id, i]));
      expect(deLaFoto.sort((a, b) => orden.get(a.id)! - orden.get(b.id)!).map((p) => p.id)).toEqual(catalogo(r.original).map((p) => p.id));

      // Y se sigue anotando igual: precios del registro, mecato y «Otro» de valor libre.
      const r2 = await s.ops(admin, [
        op({ t: "abrir", cuenta: "g", nombre: "Grupo", tipo: "grupo" }),
        op({ t: "anotar", cuenta: "g", ronda: "r1", lineas: [
          { id: "g1", producto: "rubia", cantidad: 1 }, { id: "g2", producto: "mecato", cantidad: 1, precio: 1500 },
          { id: "g3", producto: "otro", cantidad: 1, precio: 9000, nombre: "Picada" },
        ] }),
      ]);
      expect(r2.estado.cuentas.g.lineas.map((l: any) => [l.nombre, l.precio])).toEqual([["Rubia", 4000], ["Mecato", 1500], ["Picada", 9000]]);
    } finally {
      await s.apagar();
    }
  });
});

// Punto 2 de docs/13: la forma de cada operación se valida en el servidor (src/servidor/esquema.ts).
describe("forma de las operaciones", () => {
  let s: Servidor;
  let ana: string;
  let admin: string;
  beforeAll(async () => {
    s = await arrancar();
    ana = await s.token("Ana");
    admin = await s.token("Administrador");
  });
  afterAll(() => s?.apagar());
  const enviar = (token: string, ops: unknown[]) => s.ops(token, ops) as Promise<{ ok: string[]; seq: number; estado: any; rechazadas?: { id: string; motivo: string }[] }>;

  it("acepta todas las operaciones como las manda la app", async () => {
    const cuenta = `forma-${Date.now()}`, mesa = `${cuenta}-m`;
    const r = await enviar(ana, [
      op({ t: "abrir", cuenta, nombre: "Forma", tipo: "grupo" }),
      op({ t: "abrir", cuenta: mesa, nombre: "Mesa 3", tipo: "mesa", mesa: 3 }),
      op({ t: "renombrar", cuenta, nombre: "Forma bien" }),
      op({ t: "anotar", cuenta, ronda: "r1", lineas: [
        { id: "a", producto: "rubia", cantidad: 2, precio: 4000 },
        { id: "b", producto: "otro", cantidad: 1, nombre: "Almuerzo", precio: 15000, comida: true },
        { id: "c", producto: "rubia", cantidad: 15, paquete: { id: "pq", tipo: "medio", mixto: false } },
      ] }),
      op({ t: "cantidad", cuenta, linea: "a", cantidad: 3 }),
      op({ t: "comida_linea", cuenta, linea: "b", valor: false }),
      op({ t: "anular", cuenta, linea: "c" }),
      op({ t: "cobrar", cuenta, pago: "p1", medio: "efectivo", recibido: 50000 }),
      op({ t: "reabrir", cuenta }),
      op({ t: "anotar", cuenta: mesa, ronda: "r1", lineas: [{ id: "m1", producto: "rubia", cantidad: 1 }] }),
      op({ t: "cobrar", cuenta: mesa, pago: "p2", medio: "comida" }),
      op({ t: "comida_cobrada", cuenta: mesa, valor: true }),
      op({ t: "anular_cuenta", cuenta: `${cuenta}-vacia` }),
      op({ t: "cerrar_jornada", fecha: "2026-11-03", contado: 0 }),
    ]);
    expect(r.rechazadas ?? []).toEqual([]);
    expect(r.ok).toHaveLength(14);
    const p = await enviar(admin, [
      op({ t: "producto", producto: { id: "colada", nombre: "Colada", corto: "COLADA", categoria: "otro", precio: 2000, precioCancha: null, activo: true, fondo: "#123456", texto: "#FFFFFF" } }),
      op({ t: "orden", ids: ["colada", "rubia"] }),
    ]);
    expect(p.rechazadas ?? []).toEqual([]);
  });

  it("rechaza con motivo lo que no tiene forma, sin tumbar el lote ni tocar el estado", async () => {
    const cuenta = `mala-${Date.now()}`;
    const buena1 = op({ t: "abrir", cuenta, nombre: "Antes", tipo: "grupo" });
    const malas = [
      op({ t: "cobrar", cuenta, pago: "p", medio: "bitcoin" }),
      op({ t: "abrir", cuenta: `${cuenta}-x`, nombre: "x", tipo: "hacker" }),
      op({ t: "anotar", cuenta, ronda: "r", lineas: null }),
      op({ t: "anotar", cuenta, ronda: "r2", lineas: [null] }),
      op({ t: "abrir", cuenta: `${cuenta}-y`, nombre: "x".repeat(10_000), tipo: "grupo" }),
      op({ t: "borrar_todo", cuenta }),
    ];
    const buena2 = op({ t: "anotar", cuenta, ronda: "r3", lineas: lineas([["rubia", 1]]) });
    const antes = (await s.foto(ana)).seq;
    const r = await enviar(ana, [buena1, ...malas, buena2]);
    expect(r.ok).toEqual([buena1.id, buena2.id]);
    expect(r.rechazadas?.map((x) => x.id)).toEqual(malas.map((m) => m.id));
    expect(r.rechazadas?.every((x) => /dañada/.test(x.motivo))).toBe(true);
    expect(r.seq).toBe(antes + 2);
    expect(r.estado.cuentas[`${cuenta}-x`]).toBeUndefined();
    expect(r.estado.cuentas[cuenta].pagos).toEqual([]);
    // Quedan en `rechazadas` para el administrador (regla 8).
    const lista = await (await fetch(new URL("/api/admin/rechazadas", s.dir), { headers: { authorization: `Bearer ${admin}`, cookie: s.cookie } })).json().catch(() => null);
    if (lista) expect(JSON.stringify(lista)).toContain(malas[0].id);
  });

  it("lo ya aceptado se sigue confirmando al reintentar", async () => {
    const abrir = op({ t: "abrir", cuenta: `re-${Date.now()}`, nombre: "Reintento", tipo: "grupo" });
    expect((await enviar(ana, [abrir])).ok).toEqual([abrir.id]);
    const r = await enviar(ana, [abrir]);
    expect(r.ok).toEqual([abrir.id]);
    expect(r.rechazadas ?? []).toEqual([]);
  });
});

// Punto 4 de docs/13: al reconectar, solo lo nuevo; y cada operación llega con cómo quedó lo que tocó.
describe("novedades desde seq", () => {
  let s: Servidor;
  let ana: string;
  beforeAll(async () => {
    s = await arrancar();
    ana = await s.token("Ana");
  });
  afterAll(() => s?.apagar());

  /** Saluda por WebSocket y devuelve la primera respuesta. */
  const saludar = async (hola: Record<string, unknown>) => {
    const ws = s.wsCrudo(ana);
    const r = new Promise<any>((listo) => ws.addEventListener("message", (e) => { if (String(e.data) !== "pong") listo(JSON.parse(String(e.data))); }));
    await new Promise((listo) => ws.addEventListener("open", listo));
    ws.send(JSON.stringify(hola));
    const m = await r;
    ws.close();
    return m;
  };

  it("con seq manda solo las cuentas que cambiaron; sin seq, con otra base o con un seq imposible, la foto", async () => {
    const vieja = `nov-vieja-${Date.now()}`, nueva = `nov-nueva-${Date.now()}`;
    const r1 = await s.ops(ana, [op({ t: "abrir", cuenta: vieja, nombre: "Vieja", tipo: "grupo" })]);
    const desde = r1.seq;
    await s.ops(ana, [
      op({ t: "abrir", cuenta: nueva, nombre: "Nueva", tipo: "grupo" }),
      op({ t: "anotar", cuenta: nueva, ronda: "r1", lineas: lineas([["rubia", 2]]) }),
    ]);
    const m = await saludar({ tipo: "hola", seq: desde, base: r1.base });
    expect(m.tipo).toBe("novedades");
    expect(m.seq).toBe(desde + 2);
    expect(Object.keys(m.cambios.cuentas)).toEqual([nueva]);
    expect(m.cambios.cuentas[nueva].lineas[0].precio).toBe(RUBIA);

    expect((await saludar({ tipo: "hola" })).tipo).toBe("foto");
    expect((await saludar({ tipo: "hola", seq: desde, base: "otra-base" })).tipo).toBe("foto");
    expect((await saludar({ tipo: "hola", seq: desde + 1000, base: r1.base })).tipo).toBe("foto");
    const nada = await saludar({ tipo: "hola", seq: desde + 2, base: r1.base });
    expect(nada).toMatchObject({ tipo: "novedades", seq: desde + 2, cambios: {} });
  });

  it("cada operación reenviada trae la cuenta como quedó, y el respaldo HTTP con seq no repite la foto", async () => {
    const cuenta = `nov-op-${Date.now()}`;
    const ws = await s.conectar(ana);
    await s.ops(ana, [op({ t: "abrir", cuenta, nombre: "Con cambios", tipo: "grupo" }), op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["rubia", 3]]) })]);
    await esperar(() => ws.mensajes.filter((x) => x.tipo === "op").length >= 2);
    const anotar = ws.mensajes.find((x) => x.tipo === "op" && x.op.t === "anotar");
    expect(anotar.cambios.cuentas[cuenta].lineas).toHaveLength(1);
    ws.cerrar();

    const r = await (await s.opsCrudo(ana, [])).json();
    const conSeq = await (await s.pedir(ana, "/api/ops", { method: "POST", body: JSON.stringify({ ops: [], base: r.base, seq: r.seq }) })).json();
    expect(conSeq.tipo).toBe("novedades");
    expect(conSeq.estado).toBeUndefined();
    expect(conSeq.cambios).toEqual({});
  });
});

// E4: auditoría por día y celulares conectados.
describe("auditoría y celulares conectados (E4)", () => {
  const LLAVE = "llave-auditoria";
  let s: Servidor;
  let ana: string;
  let admin: string;
  beforeAll(async () => {
    s = await arrancar({ base: "auditoria", migracion: LLAVE });
    ana = await s.token("Ana");
    admin = await s.token("Administrador");
  });
  afterAll(() => s?.apagar());
  const hoy = () => new Date(Date.now() - 10 * 3600_000).toISOString().slice(0, 10);
  const auditoria = async (token: string, fecha: string) => s.pedir(token, `/api/admin/auditoria?fecha=${fecha}`);

  it("cuenta el día en frases, lo más reciente primero, con lo delicado marcado y lo rechazado", async () => {
    const cuenta = `aud-${Date.now()}`;
    await s.ops(admin, [
      op({ t: "abrir", cuenta, nombre: "Para auditar", tipo: "grupo" }),
      op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["rubia", 2]]) }),
      op({ t: "anular_cuenta", cuenta, motivo: "prueba" }),
    ], "auditoria");
    await s.ops(ana, [op({ t: "producto", producto: { id: "colada", nombre: "Colada", corto: "C", categoria: "otro", precio: 1000, activo: true, fondo: "#000000", texto: "#FFFFFF" } })], "auditoria");
    const r = await auditoria(admin, hoy());
    expect(r.status).toBe(200);
    const d = (await r.json()) as { eventos: { texto: string; atencion: boolean; persona: string; cuentaNombre?: string }[]; rechazadas: { persona: string; motivo: string }[] };
    const mios = d.eventos.filter((e) => e.cuentaNombre === "Para auditar");
    expect(mios.map((e) => e.texto)).toEqual([
      `Anuló la cuenta con $ ${(2 * RUBIA).toLocaleString("es-CO")} · motivo: prueba`,
      `Anotó 2 Rubia · $ ${(2 * RUBIA).toLocaleString("es-CO")}`,
      "Abrió la cuenta (grupo)",
    ]);
    expect(mios.map((e) => e.atencion)).toEqual([true, false, false]);
    expect(d.rechazadas.some((x) => x.persona === "Ana" && /administrador/i.test(x.motivo))).toBe(true);
  });

  it("lo importado sale en su día, no en el de la importación", async () => {
    const ayer = Date.now() - 2 * 24 * 3600_000;
    const fecha = new Date(ayer - 10 * 3600_000).toISOString().slice(0, 10);
    // Base nueva y vacía para importar.
    const otra = await arrancar({ base: "auditoria-importada", migracion: LLAVE });
    try {
      const adm = await otra.token("Administrador");
      const imp = await otra.pedir(adm, "/api/admin/importar", { method: "POST", headers: { "x-migracion": LLAVE }, body: JSON.stringify({ operaciones: [
        { id: "imp-abrir-xxxxxxxx", t: "abrir", cuenta: "vieja", nombre: "De antier", tipo: "grupo", persona: "Ana", en: ayer },
      ] }) });
      expect(imp.status).toBe(200);
      const enSuDia = (await (await otra.pedir(adm, `/api/admin/auditoria?fecha=${fecha}`)).json()) as { eventos: { cuentaNombre?: string }[] };
      expect(enSuDia.eventos.map((e) => e.cuentaNombre)).toContain("De antier");
      const hoyD = (await (await otra.pedir(adm, `/api/admin/auditoria?fecha=${hoy()}`)).json()) as { eventos: unknown[] };
      expect(hoyD.eventos).toHaveLength(0);
    } finally {
      await otra.apagar();
    }
  });

  it("solo el administrador la ve, y con fecha válida", async () => {
    expect((await auditoria(ana, hoy())).status).toBe(403);
    expect((await auditoria(admin, "ayer")).status).toBe(400);
  });

  it("los celulares conectados dicen su versión y cuántas anotaciones les faltan", async () => {
    const ws = s.wsCrudo(ana);
    const llego = new Promise((listo) => ws.addEventListener("message", listo));
    await new Promise((listo) => ws.addEventListener("open", listo));
    ws.send(JSON.stringify({ tipo: "hola", version: "2026-11-03 15:00", pendientes: 3 }));
    await llego;
    const d = (await (await s.pedir(admin, "/api/admin/dispositivos")).json()) as { conexiones: { persona: string; version?: string; pendientes?: number }[] };
    expect(d.conexiones).toEqual(expect.arrayContaining([expect.objectContaining({ persona: "Ana", version: "2026-11-03 15:00", pendientes: 3 })]));
    // Al enviar un lote de 2 de esas 3, le queda 1.
    const ok = new Promise((listo) => ws.addEventListener("message", (e) => { if (String(e.data).includes('"ok"')) listo(null); }));
    ws.send(JSON.stringify({ tipo: "ops", pendientes: 3, ops: [op({ t: "abrir", cuenta: `pend-${Date.now()}`, nombre: "P", tipo: "grupo" }), op({ t: "abrir", cuenta: `pend2-${Date.now()}`, nombre: "P2", tipo: "grupo" })], base: "auditoria" }));
    await ok;
    const d2 = (await (await s.pedir(admin, "/api/admin/dispositivos")).json()) as { conexiones: { persona: string; pendientes?: number }[] };
    expect(d2.conexiones.find((x) => x.persona === "Ana")?.pendientes).toBe(1);
    ws.close();
  });
});

// E6: dos cobros de la misma cuenta y quién hizo qué cuando otra persona envía (docs/04, tabla de conflictos).
describe("doble cobro y autoría (E6)", () => {
  let s: Servidor;
  let ana: string;
  let beto: string;
  let admin: string;
  beforeAll(async () => {
    s = await arrancar();
    ana = await s.token("Ana");
    beto = await s.token("Beto");
    admin = await s.token("Administrador");
  });
  afterAll(() => s?.apagar());

  it("el segundo cobro se rechaza diciendo quién la cobró; el reintento del primero se confirma", async () => {
    const cuenta = `doble-${Date.now()}`;
    await s.ops(ana, [op({ t: "abrir", cuenta, nombre: "Doble cobro", tipo: "grupo" }), op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["rubia", 2]]) })]);
    const primero = op({ t: "cobrar", cuenta, pago: "p-ana", medio: "nequi" });
    const segundo = op({ t: "cobrar", cuenta, pago: "p-beto", medio: "efectivo" });
    expect((await s.ops(ana, [primero])).ok).toEqual([primero.id]);
    const r = (await s.ops(beto, [segundo])) as { ok: string[]; rechazadas?: { id: string; motivo: string }[]; estado: any };
    expect(r.ok).toEqual([]);
    expect(r.rechazadas?.[0].id).toBe(segundo.id);
    expect(r.rechazadas?.[0].motivo).toMatch(/^Doble cobro ya la cobró Ana a las .* por Nequi\. Si recibió plata, devuélvala\.$/);
    expect(r.estado.cuentas[cuenta].pagos).toHaveLength(1);
    expect((await s.ops(ana, [primero])).ok).toEqual([primero.id]); // reintento: no es doble cobro
  });

  it("lo que anotó Ana y envió Beto desde el mismo celular queda a nombre de Ana (con su sesión firmada), y se sabe quién lo envió", async () => {
    const cuenta = `autor-${Date.now()}`;
    const abrir = { ...op({ t: "abrir", cuenta, nombre: "Anotada sin señal", tipo: "grupo" }), persona: "Ana", firma: ana };
    await s.ops(beto, [abrir]);
    const foto = await s.foto(admin);
    expect(foto.estado.cuentas[cuenta].abiertaPor).toBe("Ana");
    const respaldo = (await (await s.pedir(admin, "/api/admin/respaldo")).json()) as { operaciones: Record<string, unknown>[] };
    const guardada = respaldo.operaciones.find((o) => o.id === abrir.id)!;
    expect(guardada).toMatchObject({ persona: "Ana", enviadaPor: "Beto" });
    expect(guardada.firma).toBeUndefined(); // la sesión no queda en el registro ni en los respaldos
  });

  it("sin firma, o con la firma de otro celular, queda a nombre de quien envía", async () => {
    const sinFirma = `sin-firma-${Date.now()}`, otroCel = `otro-cel-${Date.now()}`;
    const anaEnOtroCelular = await s.token("Ana", await s.celular("Otro"));
    await s.ops(beto, [
      { ...op({ t: "abrir", cuenta: sinFirma, nombre: "X", tipo: "grupo" }), persona: "Ana" },
      { ...op({ t: "abrir", cuenta: otroCel, nombre: "Y", tipo: "grupo" }), persona: "Ana", firma: anaEnOtroCelular },
    ]);
    const foto = await s.foto(admin);
    expect(foto.estado.cuentas[sinFirma].abiertaPor).toBe("Beto");
    expect(foto.estado.cuentas[otroCel].abiertaPor).toBe("Beto");
  });

  it("poner el nombre del administrador no da sus permisos, y un nombre inventado queda como quien envía", async () => {
    const producto = { ...op({ t: "producto", producto: { id: "falso", nombre: "Falso", corto: "F", categoria: "otro", precio: 1, activo: true, fondo: "#000000", texto: "#FFFFFF" } }), persona: "Administrador" };
    const r = (await s.ops(beto, [producto])) as { rechazadas?: { motivo: string }[] };
    expect(r.rechazadas?.[0].motivo).toMatch(/administrador/i);
    const cuenta = `inventado-${Date.now()}`;
    await s.ops(beto, [{ ...op({ t: "abrir", cuenta, nombre: "X", tipo: "grupo" }), persona: "Alguien que no existe" }]);
    expect((await s.foto(admin)).estado.cuentas[cuenta].abiertaPor).toBe("Beto");
  });
});

// Fase G: quien abre la app por la dirección vieja (workers.dev) llega a la propia.
describe("dirección propia", () => {
  let s: Servidor;
  beforeAll(async () => { s = await arrancar({ direccion: "https://barra.ejemplo.test" }); });
  afterAll(() => s?.apagar());

  it("abrir la página por otra dirección lleva a la propia; la API y los archivos no se redirigen", async () => {
    // El navegador manda sec-fetch-dest «document» al abrir una página (Node no deja poner sec-fetch-mode).
    const abrir = await fetch(new URL("/?x=1", s.dir), { headers: { "sec-fetch-dest": "document" }, redirect: "manual" });
    expect(abrir.status).toBe(302);
    expect(abrir.headers.get("location")).toBe("https://barra.ejemplo.test/?x=1");
    expect((await fetch(new URL("/api/personas", s.dir), { headers: { "sec-fetch-dest": "document" }, redirect: "manual" })).status).not.toBe(302);
    expect((await fetch(new URL("/", s.dir), { redirect: "manual" })).status).not.toBe(302); // el Service Worker pide la página sin «navigate»
  });
});


// Abonos (pagos parciales): forma de las operaciones y quién puede deshacerlos.
describe("abonos en el servidor", () => {
  let s: Servidor;
  let ana: string;
  let beto: string;
  let admin: string;
  beforeAll(async () => {
    s = await arrancar();
    ana = await s.token("Ana");
    beto = await s.token("Beto");
    admin = await s.token("Administrador");
  });
  afterAll(() => s?.apagar());
  type R = { ok: string[]; rechazadas?: { id: string; motivo: string }[]; estado: any };

  it("acepta abonos por valor y por productos, y el último cobro cierra la cuenta", async () => {
    const cuenta = `abono-${Date.now()}`;
    await s.ops(ana, [op({ t: "abrir", cuenta, nombre: "Grupo que divide", tipo: "grupo" }), op({ t: "anotar", cuenta, ronda: "r1", lineas: [{ id: "a1", producto: "rubia", cantidad: 3 }] })]);
    const r = (await s.ops(ana, [
      op({ t: "cobrar", cuenta, pago: "p1", medio: "nequi", lineas: [{ linea: "a1", cantidad: 1 }] }),
      op({ t: "cobrar", cuenta, pago: "p2", medio: "efectivo", monto: 4000, recibido: 5000 }),
      op({ t: "cobrar", cuenta, pago: "p3", medio: "breve" }),
    ])) as R;
    expect(r.rechazadas ?? []).toEqual([]);
    expect(r.estado.cuentas[cuenta].pagos.map((p: any) => [p.medio, p.monto, !!p.parcial])).toEqual([["nequi", RUBIA, true], ["efectivo", RUBIA, true], ["breve", RUBIA, false]]);
  });

  it("un operador deshace su abono reciente, no el de otro; reabrir con abonos de otro es del administrador", async () => {
    const cuenta = `deshacer-${Date.now()}`;
    await s.ops(ana, [op({ t: "abrir", cuenta, nombre: "Con abonos", tipo: "grupo" }), op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["rubia", 3]]) })]);
    await s.ops(ana, [op({ t: "cobrar", cuenta, pago: "de-ana", medio: "efectivo", monto: 4000 })]);
    await s.ops(beto, [op({ t: "cobrar", cuenta, pago: "de-beto", medio: "nequi", monto: 4000 })]);

    const ajeno = (await s.ops(ana, [op({ t: "deshacer_pago", cuenta, pago: "de-beto" })])) as R;
    expect(ajeno.rechazadas?.[0].motivo).toMatch(/administrador/);
    const reabrir = (await s.ops(ana, [op({ t: "reabrir", cuenta })])) as R;
    expect(reabrir.rechazadas?.[0].motivo).toMatch(/administrador/);
    const propio = (await s.ops(ana, [op({ t: "deshacer_pago", cuenta, pago: "de-ana" })])) as R;
    expect(propio.rechazadas ?? []).toEqual([]);
    expect(propio.estado.cuentas[cuenta].pagos.filter((p: any) => !p.deshecho).map((p: any) => p.id)).toEqual(["de-beto"]);
    const delAdmin = (await s.ops(admin, [op({ t: "deshacer_pago", cuenta, pago: "de-beto" })])) as R;
    expect(delAdmin.rechazadas ?? []).toEqual([]);
  });
});

// Áreas (docs/14): quién anota platos, quién despacha, en qué caja se cobra, accesos por día.
describe("áreas por persona", () => {
  let s: Servidor;
  let ana: string;
  let beto: string;
  let admin: string;
  const personas = (b: Record<string, unknown>) => s.pedir(admin, "/api/admin/personas", { method: "POST", body: JSON.stringify(b) });
  const hoy = () => new Date(Date.now() - 10 * 3600_000).toISOString().slice(0, 10);
  type R = { ok: string[]; rechazadas?: { id: string; motivo: string }[]; estado: any; yo?: { areas: string[] } };
  beforeAll(async () => {
    s = await arrancar();
    ana = await s.token("Ana");
    beto = await s.token("Beto");
    admin = await s.token("Administrador");
    // Un plato en el catálogo; Ana es de comida, Beto de barra (como viene).
    await s.ops(admin, [op({ t: "producto", producto: { id: "sopa", nombre: "Sopa", corto: "SOPA", categoria: "comida", precio: 5000, activo: true, fondo: "#8A4F2E", texto: "#FFFFFF" } })]);
    expect((await personas({ accion: "areas", id: "ana", areas: ["comida"] })).status).toBe(200);
  });
  afterAll(() => s?.apagar());

  it("comida anota platos y bebidas (quedan por despachar) y no despacha; barra despacha y no anota platos", async () => {
    const cuenta = `mesa-${Date.now()}`;
    const r = (await s.ops(ana, [
      op({ t: "abrir", cuenta, nombre: "Mesa 2", tipo: "mesa", mesa: 2 }),
      op({ t: "anotar", cuenta, ronda: "r1", area: "comida", lineas: [{ id: "s1", producto: "sopa", cantidad: 1, nota: "sin cebolla" }, { id: "b1", producto: "rubia", cantidad: 2 }] }),
      op({ t: "despachar", cuenta }),
    ])) as R;
    expect(r.rechazadas?.map((x) => x.motivo)).toEqual(["Solo la barra despacha las bebidas."]);
    const lineas = r.estado.cuentas[cuenta].lineas;
    expect(lineas.map((l: any) => [l.id, !!l.comida, l.nota ?? null, !!l.porDespachar])).toEqual([["s1", true, "sin cebolla", false], ["b1", false, null, true]]);

    const b = (await s.ops(beto, [
      op({ t: "anotar", cuenta, ronda: "r2", lineas: [{ id: "s2", producto: "sopa", cantidad: 1 }] }),
      op({ t: "despachar", cuenta }),
    ])) as R;
    expect(b.rechazadas?.map((x) => x.motivo)).toEqual(["Solo el área de comida anota platos."]);
    expect(b.estado.cuentas[cuenta].lineas.find((l: any) => l.id === "b1").despachada.por).toBe("Beto");
  });

  it("comida ve y cobra toda la cuenta, pero solo cambia platos y bebidas suyas sin despachar", async () => {
    const cuenta = `editar-${Date.now()}`;
    await s.ops(beto, [op({ t: "abrir", cuenta, nombre: "Mesa 5", tipo: "mesa", mesa: 5 }), op({ t: "anotar", cuenta, ronda: "r1", lineas: [{ id: "de-barra", producto: "rubia", cantidad: 2 }] })]);
    await s.ops(ana, [op({ t: "anotar", cuenta, ronda: "r2", area: "comida", lineas: [{ id: "plato", producto: "sopa", cantidad: 2 }, { id: "pedida", producto: "rubia", cantidad: 1 }] })]);
    const r = (await s.ops(ana, [
      op({ t: "anular", cuenta, linea: "de-barra" }),
      op({ t: "cantidad", cuenta, linea: "de-barra", cantidad: 1 }),
      op({ t: "cantidad", cuenta, linea: "plato", cantidad: 1 }),
      op({ t: "anular", cuenta, linea: "pedida" }),
    ])) as R;
    expect(r.rechazadas?.map((x) => x.motivo.slice(0, 40))).toEqual(["Desde comida solo se cambian los platos ", "Desde comida solo se cambian los platos "]);
    const ls = r.estado.cuentas[cuenta].lineas;
    expect(ls.map((l: any) => [l.id, l.cantidad, !!l.anulada])).toEqual([["de-barra", 2, false], ["plato", 1, false], ["pedida", 1, true]]);
    // La barra sí cambia lo de comida.
    const b = (await s.ops(beto, [op({ t: "cantidad", cuenta, linea: "plato", cantidad: 3 })])) as R;
    expect(b.rechazadas ?? []).toEqual([]);
  });

  it("cada cobro queda en la caja de quien cobra; nadie cobra en una caja que no tiene", async () => {
    const cuenta = `caja-${Date.now()}`;
    await s.ops(beto, [op({ t: "abrir", cuenta, nombre: "Caja", tipo: "grupo" }), op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["rubia", 3]]) })]);
    const r = (await s.ops(beto, [
      op({ t: "cobrar", cuenta, pago: "x1", medio: "efectivo", monto: 4000, area: "comida" }),
      op({ t: "cobrar", cuenta, pago: "x2", medio: "efectivo", monto: 4000 }),
    ])) as R;
    expect(r.rechazadas?.map((x) => x.motivo)).toEqual(["Hoy no tiene acceso a comida."]);
    const a = (await s.ops(ana, [op({ t: "cobrar", cuenta, pago: "x3", medio: "efectivo" })])) as R;
    expect(a.estado.cuentas[cuenta].pagos.map((p: any) => [p.id, p.area])).toEqual([["x2", "barra"], ["x3", "comida"]]);
  });

  it("el administrador da un área por un día; sirve ese día y se puede quitar", async () => {
    expect((await personas({ accion: "dia", id: "beto", area: "comida", fecha: hoy() })).status).toBe(200);
    const cuenta = `dia-${Date.now()}`;
    const r = (await s.ops(beto, [op({ t: "abrir", cuenta, nombre: "Día", tipo: "grupo" }), op({ t: "anotar", cuenta, ronda: "r1", area: "comida", lineas: [{ id: "s", producto: "sopa", cantidad: 1 }] })])) as R;
    expect(r.rechazadas ?? []).toEqual([]);
    expect(r.yo?.areas).toEqual(["barra", "comida"]);
    expect((await personas({ accion: "dia", id: "beto", area: "comida", fecha: hoy(), dar: false })).status).toBe(200);
    const otra = (await s.ops(beto, [op({ t: "anotar", cuenta, ronda: "r2", area: "comida", lineas: [{ id: "s2", producto: "sopa", cantidad: 1 }] })])) as R;
    expect(otra.rechazadas?.[0].motivo).toBe("Hoy no tiene acceso a comida.");
    const lista = (await (await s.pedir(admin, "/api/admin/personas")).json()) as { personas: { id: string; areas: string[]; dias: unknown[] }[] };
    expect(lista.personas.find((p) => p.id === "ana")?.areas).toEqual(["comida"]);
  });

  it("un operador pasa a administrador; el último administrador no se puede quitar", async () => {
    expect((await personas({ accion: "rol", id: "ana", rol: "admin" })).status).toBe(200);
    expect((await personas({ accion: "rol", id: "administrador", rol: "operador" })).status).toBe(200);
    // Ahora la única administradora es Ana: con su sesión, no puede quitarse el rol.
    const comoAna = (b: Record<string, unknown>) => s.pedir(ana, "/api/admin/personas", { method: "POST", body: JSON.stringify(b) });
    expect((await personas({ accion: "areas", id: "ana", areas: ["comida"] })).status).toBe(403); // el Administrador ya no lo es
    const ultimo = await comoAna({ accion: "rol", id: "ana", rol: "operador" });
    expect(ultimo.status).toBe(400);
    expect(await ultimo.text()).toContain("al menos un administrador");
    // Volver como estaba.
    expect((await comoAna({ accion: "rol", id: "administrador", rol: "admin" })).status).toBe(200);
  });

  it("al saludar, el celular recibe sus áreas", async () => {
    const ws = s.wsCrudo(ana);
    const m = new Promise<any>((listo) => ws.addEventListener("message", (e) => { if (String(e.data) !== "pong") listo(JSON.parse(String(e.data))); }));
    await new Promise((listo) => ws.addEventListener("open", listo));
    ws.send(JSON.stringify({ tipo: "hola" }));
    expect((await m).yo.areas).toContain("comida");
    ws.close();
  });
});

describe("juntar cuentas en el servidor", () => {
  let s: Servidor;
  let ana: string;
  let beto: string;
  beforeAll(async () => {
    s = await arrancar();
    ana = await s.token("Ana");
    beto = await s.token("Beto");
  });
  afterAll(() => s?.apagar());
  type R = { ok: string[]; rechazadas?: { id: string; motivo: string }[]; estado: any };

  it("junta dos cuentas, rechaza cobrar la de origen y no deja separar después de un cobro", async () => {
    const a = `junta-a-${Date.now()}`, b = `junta-b-${Date.now()}`;
    await s.ops(ana, [
      op({ t: "abrir", cuenta: a, nombre: "Mesa 3", tipo: "mesa", mesa: 3 }), op({ t: "anotar", cuenta: a, ronda: `${a}-r`, lineas: lineas([["rubia", 2]]) }),
      op({ t: "abrir", cuenta: b, nombre: "Los de rojo", tipo: "grupo" }), op({ t: "anotar", cuenta: b, ronda: `${b}-r`, lineas: lineas([["rubia", 1]]) }),
    ]);
    const junta = (await s.ops(ana, [op({ t: "juntar", cuenta: a, desde: b })])) as R;
    expect(junta.rechazadas ?? []).toEqual([]);
    expect(junta.estado.cuentas[a].lineas).toHaveLength(2);
    expect(junta.estado.cuentas[b].juntadaA.nombre).toBe("Mesa 3");

    // Otro celular sin señal: juntar otra vez o cobrar la de origen se rechaza con el porqué.
    const otra = (await s.ops(beto, [op({ t: "juntar", cuenta: a, desde: b }), op({ t: "cobrar", cuenta: b, pago: `${b}-p`, medio: "efectivo" })])) as R;
    expect(otra.rechazadas?.map((x) => x.motivo)).toEqual(["Los de rojo ya se juntó con Mesa 3.", "Los de rojo se juntó con Mesa 3: cóbrela allá."]);

    const cobro = (await s.ops(ana, [op({ t: "cobrar", cuenta: a, pago: `${a}-p`, medio: "efectivo", monto: RUBIA })])) as R;
    expect(cobro.rechazadas ?? []).toEqual([]);
    const separar = (await s.ops(ana, [op({ t: "separar", cuenta: a, desde: b })])) as R;
    expect(separar.rechazadas?.[0].motivo).toMatch(/no se pueden separar/);
  });

  it("separa si no se cobró nada después", async () => {
    const a = `sep-a-${Date.now()}`, b = `sep-b-${Date.now()}`;
    await s.ops(ana, [
      op({ t: "abrir", cuenta: a, nombre: "Uno", tipo: "grupo" }), op({ t: "anotar", cuenta: a, ronda: `${a}-r`, lineas: lineas([["rubia", 1]]) }),
      op({ t: "abrir", cuenta: b, nombre: "Dos", tipo: "grupo" }), op({ t: "anotar", cuenta: b, ronda: `${b}-r`, lineas: lineas([["rubia", 1]]) }),
      op({ t: "juntar", cuenta: a, desde: b }),
    ]);
    const r = (await s.ops(beto, [op({ t: "separar", cuenta: a, desde: b })])) as R;
    expect(r.rechazadas ?? []).toEqual([]);
    expect(r.estado.cuentas[a].lineas).toHaveLength(1);
    expect(r.estado.cuentas[b].lineas).toHaveLength(1);
    expect(r.estado.cuentas[b].juntadaA).toBeUndefined();
  });
});

describe("deudas en el servidor", () => {
  let s: Servidor;
  let ana: string;
  let admin: string;
  beforeAll(async () => {
    s = await arrancar();
    ana = await s.token("Ana");
    admin = await s.token("Administrador");
  });
  afterAll(() => s?.apagar());
  type R = { ok: string[]; rechazadas?: { id: string; motivo: string }[]; estado: any };

  it("cualquiera pasa a deuda y recibe pagos; sin nombre se rechaza; anotar a mano es del administrador", async () => {
    const cuenta = `fiado-${Date.now()}`;
    await s.ops(ana, [op({ t: "abrir", cuenta, nombre: "Fiado", tipo: "grupo" }), op({ t: "anotar", cuenta, ronda: "r1", lineas: lineas([["rubia", 3]]) })]);
    const sinNombre = (await s.ops(ana, [op({ t: "cobrar", cuenta, pago: `${cuenta}-x`, medio: "deuda" })])) as R;
    expect(sinNombre.rechazadas?.[0].motivo).toBe("Escriba a nombre de quién queda la deuda.");
    const r = (await s.ops(ana, [op({ t: "cobrar", cuenta, pago: `${cuenta}-p`, medio: "deuda", deudor: "Nilson Servidor" })])) as R;
    expect(r.rechazadas ?? []).toEqual([]);
    expect(r.estado.deudas["nilson-servidor"].movimientos[0].valor).toBe(3 * RUBIA);
    const manual = (await s.ops(ana, [op({ t: "deuda_cargo", deudor: "Nilson Servidor", valor: 5000, concepto: "almuerzo" })])) as R;
    expect(manual.rechazadas?.[0].motivo).toMatch(/permiso de administrar deudas/);
    const delAdmin = (await s.ops(admin, [op({ t: "deuda_cargo", deudor: "Nilson Servidor", valor: 5000, concepto: "almuerzo", comida: true })])) as R;
    expect(delAdmin.rechazadas ?? []).toEqual([]);
    const pago = (await s.ops(ana, [op({ t: "deuda_pago", deudor: "nilson-servidor", valor: 1_000_000, medio: "efectivo" })])) as R;
    expect(pago.rechazadas ?? []).toEqual([]);
    const otro = (await s.ops(ana, [op({ t: "deuda_pago", deudor: "nilson-servidor", valor: 1000, medio: "efectivo" })])) as R;
    expect(otro.rechazadas?.[0].motivo).toBe("Nilson Servidor no debe nada.");
    const anular = (await s.ops(admin, [op({ t: "deuda_anular", deudor: "nilson-servidor", movimiento: `${cuenta}-p` })])) as R;
    expect(anular.rechazadas?.[0].motivo).toMatch(/se deshace desde el cobro de la cuenta/);
    // El detalle de la cuenta fiada se puede pedir por id (para «Deudas»).
    const r2 = await s.pedir(ana, `/api/cuentas?ids=${cuenta},no-existe`);
    const { cuentas } = (await r2.json()) as { cuentas: Record<string, any> };
    expect(Object.keys(cuentas)).toEqual([cuenta]);
    expect(cuentas[cuenta].lineas[0].cantidad).toBe(3);
  });
});

describe("permiso de administrar deudas", () => {
  let s: Servidor;
  let ana: string;
  let admin: string;
  beforeAll(async () => {
    s = await arrancar();
    ana = await s.token("Ana");
    admin = await s.token("Administrador");
  });
  afterAll(() => s?.apagar());
  type R = { ok: string[]; rechazadas?: { id: string; motivo: string }[]; estado: any; yo?: { deudas?: boolean } };

  it("sin ser administrador, con el permiso anota deudas a mano y anula; sin él, no", async () => {
    const cargo = () => op({ t: "deuda_cargo", deudor: "Vecino", valor: 8000, concepto: "almuerzo", comida: true });
    const antes = (await s.ops(ana, [cargo()])) as R;
    expect(antes.rechazadas?.length).toBe(1);
    expect(antes.yo?.deudas).toBe(false);
    const r = await s.pedir(admin, "/api/admin/personas", { method: "POST", body: JSON.stringify({ accion: "permisos", id: "ana", permisos: ["deudas"] }) });
    expect(r.status).toBe(200);
    const despues = (await s.ops(ana, [cargo()])) as R;
    expect(despues.rechazadas ?? []).toEqual([]);
    expect(despues.yo?.deudas).toBe(true);
    const id = despues.estado.deudas.vecino.movimientos[0].id;
    const anular = (await s.ops(ana, [op({ t: "deuda_anular", deudor: "vecino", movimiento: id })])) as R;
    expect(anular.rechazadas ?? []).toEqual([]);
    const lista = (await (await s.pedir(admin, "/api/admin/personas")).json()) as { personas: { id: string; permisos: string[] }[] };
    expect(lista.personas.find((p) => p.id === "ana")?.permisos).toEqual(["deudas"]);
  });
});
