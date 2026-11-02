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
      const porWs = new WebSocket(new URL(`/api/ws?t=${encodeURIComponent(ana)}`, s.dir.href.replace(/^http/, "ws")));
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

      expect(r.ok).toEqual([barata.id, orden.id]); // sale de la cola, pero no se aplica
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
