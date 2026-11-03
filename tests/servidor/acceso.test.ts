// Acceso por persona (fase D): celular vinculado + PIN, y el rol revisado en el servidor.
// Ver docs/03 «Acceso y seguridad» y ADR-10.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { arrancar, CLAVE, esperar, idDe, op, PIN, type Servidor } from "./arrancar";

describe("acceso por persona", () => {
  let s: Servidor;
  let admin: string;
  let ana: string;
  let beto: string;
  beforeAll(async () => {
    s = await arrancar();
    admin = await s.token("Administrador");
    ana = await s.token("Ana");
    beto = await s.token("Beto");
  });
  afterAll(() => s?.apagar());
  const json = async (r: Response) => ({ status: r.status, datos: (await r.json()) as any });
  const sinCookie = (ruta: string, init: RequestInit = {}) => fetch(new URL(ruta, s.dir), init);

  describe("vincular el celular", () => {
    it("sin celular vinculado no hay personas ni entrada", async () => {
      expect(await json(await sinCookie("/api/personas"))).toMatchObject({ status: 401, datos: { error: "dispositivo" } });
      const r = await sinCookie("/api/entrar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona: "ana", pin: PIN }) });
      expect(r.status).toBe(401);
    });

    it("la llave de instalación equivocada no saca códigos", async () => {
      expect((await sinCookie("/api/instalacion/codigo", { method: "POST", headers: { "x-llave": "otra" } })).status).toBe(403);
    });

    it("un código sirve una sola vez; uno inventado no sirve", async () => {
      const { codigo } = (await (await sinCookie("/api/instalacion/codigo", { method: "POST", headers: { "x-llave": CLAVE } })).json()) as { codigo: string };
      expect(codigo).toMatch(/^\d{6}$/);
      const vincular = (c: string) => sinCookie("/api/vincular", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo: c, nombre: "Otro" }) });
      const primera = await vincular(codigo);
      expect(primera.status).toBe(200);
      expect(primera.headers.get("set-cookie")).toMatch(/bg_disp=.+HttpOnly; Secure; SameSite=Strict/);
      expect((await vincular(codigo)).status).toBe(400);
      expect((await vincular("000000")).status).toBe(400);
    });

    it("la llave de instalación lee la foto y el respaldo (solo lectura); sin ella, no", async () => {
      expect((await sinCookie("/api/instalacion/foto", { headers: { "x-llave": CLAVE } })).status).toBe(200);
      const r = await sinCookie("/api/instalacion/respaldo", { headers: { "x-llave": CLAVE } });
      expect(((await r.json()) as { operaciones: unknown[] }).operaciones).toBeInstanceOf(Array);
      expect((await sinCookie("/api/instalacion/respaldo", { headers: { "x-llave": "otra" } })).status).toBe(403);
      expect((await sinCookie("/api/instalacion/foto")).status).toBe(403);
    });

    it("el administrador saca códigos desde la app; un operador no", async () => {
      expect((await s.pedir(admin, "/api/admin/codigo", { method: "POST" })).status).toBe(200);
      expect((await s.pedir(ana, "/api/admin/codigo", { method: "POST" })).status).toBe(403);
    });
  });

  describe("PIN", () => {
    it("la lista pública no trae PIN y marca al administrador", async () => {
      const { datos } = await json(await fetch(new URL("/api/personas", s.dir), { headers: { cookie: s.cookie } }));
      const nombres = datos.personas.map((p: { nombre: string }) => p.nombre);
      expect(nombres).toEqual(expect.arrayContaining(["Ana", "Beto", "Apoyo", "Administrador"]));
      expect(JSON.stringify(datos)).not.toContain(PIN);
      expect(datos.personas.find((p: { nombre: string }) => p.nombre === "Administrador").admin).toBe(true);
    });

    it("la primera vez se crea el PIN; después hay que escribirlo", async () => {
      expect(await json(await s.entrar("Apoyo", PIN))).toMatchObject({ status: 409, datos: { error: "sin-pin" } });
      expect((await s.entrar("Apoyo", "", { pinNuevo: "12" })).status).toBe(409);
      expect((await s.entrar("Apoyo", "", { pinNuevo: "4321" })).status).toBe(200);
      expect((await s.entrar("Apoyo", "4321")).status).toBe(200);
      expect((await s.entrar("Apoyo", "0000")).status).toBe(401);
    });

    it("5 PIN equivocados bloquean 5 minutos a esa persona en ese celular, aunque después acierte", async () => {
      const otro = await s.celular("Celular del bloqueo");
      await s.token("Beto", otro);
      for (let i = 1; i <= 4; i++) {
        const r = await json(await s.entrar("Beto", "9999", { cookie: otro }));
        expect(r.status).toBe(401);
        expect(r.datos.error).toContain(`Quedan ${5 - i}`);
      }
      expect((await s.entrar("Beto", "9999", { cookie: otro })).status).toBe(429);
      expect((await s.entrar("Beto", PIN, { cookie: otro })).status).toBe(429);
      // En otro celular sigue entrando.
      expect((await s.entrar("Beto", PIN)).status).toBe(200);
    });

    it("cada persona cambia su PIN con el actual", async () => {
      const cambiar = (actual: string, nuevo: string) => s.pedir(ana, "/api/mi-pin", { method: "POST", body: JSON.stringify({ actual, nuevo }) });
      expect((await cambiar("0000", "5555")).status).toBe(403);
      expect((await cambiar(PIN, "5555")).status).toBe(200);
      expect((await s.entrar("Ana", "5555")).status).toBe(200);
      expect((await cambiar("5555", PIN)).status).toBe(200);
    });

    it("el administrador ve y cambia los PIN; un operador no", async () => {
      const { datos } = await json(await s.pedir(admin, "/api/admin/personas"));
      expect(datos.personas.find((p: { id: string }) => p.id === "ana").pin).toBe(PIN);
      expect((await s.pedir(ana, "/api/admin/personas")).status).toBe(403);
      await s.pedir(admin, "/api/admin/personas", { method: "POST", body: JSON.stringify({ accion: "pin", id: "apoyo", pin: "2468" }) });
      expect((await s.entrar("Apoyo", "2468")).status).toBe(200);
    });

    it("la sesión de un celular no sirve con la cookie de otro", async () => {
      const otro = await s.celular("Ajeno");
      const r = await fetch(new URL("/api/foto", s.dir), { headers: { authorization: `Bearer ${ana}`, cookie: otro } });
      expect(r.status).toBe(401);
    });
  });

  describe("quitar y desactivar", () => {
    it("quitar un celular lo deja sin acceso al instante, también su WebSocket", async () => {
      const otro = await s.celular("Celular perdido");
      const t = await s.token("Ana", otro);
      const ws = s.wsCrudo(t, otro);
      let cortado = false;
      ws.addEventListener("close", () => { cortado = true; });
      ws.addEventListener("message", (e) => { if (JSON.parse(String(e.data)).tipo === "acceso") cortado = true; });
      await new Promise((r) => ws.addEventListener("open", r));
      const { datos } = await json(await s.pedir(admin, "/api/admin/dispositivos"));
      const id = datos.dispositivos.find((d: { nombre: string; revocado: number | null }) => d.nombre === "Celular perdido" && !d.revocado).id;
      expect((await s.pedir(admin, "/api/admin/dispositivos", { method: "POST", body: JSON.stringify({ revocar: id }) })).status).toBe(200);
      await esperar(() => cortado);
      ws.close();
      expect((await fetch(new URL("/api/foto", s.dir), { headers: { authorization: `Bearer ${t}`, cookie: otro } })).status).toBe(401);
      expect((await s.entrar("Ana", PIN, { cookie: otro })).status).toBe(401);
    });

    it("una persona desactivada no entra ni sigue con su sesión", async () => {
      await s.pedir(admin, "/api/admin/personas", { method: "POST", body: JSON.stringify({ accion: "crear", nombre: "Temporal", rol: "operador" }) });
      const t = await s.token("Temporal");
      expect((await s.foto(t)).seq).toBeGreaterThanOrEqual(0);
      await s.pedir(admin, "/api/admin/personas", { method: "POST", body: JSON.stringify({ accion: "activa", id: idDe("Temporal"), activa: false }) });
      expect((await s.pedir(t, "/api/foto")).status).toBe(401);
      expect((await s.entrar("Temporal")).status).toBe(400);
    });
  });

  describe("permisos en cada operación", () => {
    const cuentaCon = async (token: string, cuenta: string, productos = true) => {
      const ops = [op({ t: "abrir", cuenta, nombre: cuenta, tipo: "grupo" })];
      if (productos) ops.push(op({ t: "anotar", cuenta, ronda: `r-${cuenta}`, lineas: [{ id: `l-${cuenta}`, producto: "rubia", cantidad: 2 }] }));
      await s.ops(token, ops);
    };

    it("quién la hizo lo dice la sesión", async () => {
      const r = await s.ops(beto, [op({ t: "abrir", cuenta: "de-beto", nombre: "De Beto", tipo: "grupo", persona: "Administrador" })]);
      expect(r.estado.cuentas["de-beto"].abiertaPor).toBe("Beto");
    });

    it("un operador anula una cuenta vacía, pero no una con productos", async () => {
      await cuentaCon(ana, "vacia", false);
      await cuentaCon(ana, "llena");
      const r = (await s.ops(ana, [op({ t: "anular_cuenta", cuenta: "vacia" }), op({ t: "anular_cuenta", cuenta: "llena" })])) as any;
      expect(r.estado.cuentas.vacia.anulada).toBe(true);
      expect(r.estado.cuentas.llena.anulada).toBe(false);
      expect(r.rechazadas.map((x: { motivo: string }) => x.motivo)).toEqual(["Solo el administrador anula una cuenta con productos."]);
    });

    it("el administrador anula una cuenta con productos solo con motivo, y queda quién y por qué", async () => {
      await cuentaCon(admin, "con-motivo");
      const sin = (await s.ops(admin, [op({ t: "anular_cuenta", cuenta: "con-motivo" })])) as any;
      expect(sin.rechazadas).toHaveLength(1);
      const con = (await s.ops(admin, [op({ t: "anular_cuenta", cuenta: "con-motivo", motivo: "Cuenta repetida" })])) as any;
      expect(con.estado.cuentas["con-motivo"].anulacion).toMatchObject({ por: "Administrador", motivo: "Cuenta repetida" });
    });

    it("quien cobró puede deshacer (reabrir); otro operador no; el administrador sí", async () => {
      await cuentaCon(ana, "cobro-ana");
      await s.ops(ana, [op({ t: "cobrar", cuenta: "cobro-ana", pago: "p-ana", medio: "efectivo" })]);
      const otro = (await s.ops(beto, [op({ t: "reabrir", cuenta: "cobro-ana" })])) as any;
      expect(otro.rechazadas[0].motivo).toBe("Solo el administrador reabre una cuenta cobrada.");
      const propio = (await s.ops(ana, [op({ t: "reabrir", cuenta: "cobro-ana" })])) as any;
      expect(propio.rechazadas).toEqual([]);
      expect(propio.estado.cuentas["cobro-ana"].pagos.every((p: { deshecho?: boolean }) => p.deshecho)).toBe(true);

      await s.ops(ana, [op({ t: "cobrar", cuenta: "cobro-ana", pago: "p-ana-2", medio: "nequi" })]);
      const delAdmin = (await s.ops(admin, [op({ t: "reabrir", cuenta: "cobro-ana" })])) as any;
      expect(delAdmin.rechazadas).toEqual([]);
    });

    it("«Deshacer» después de anular una cuenta la devuelve (reabrir quita la anulación)", async () => {
      await cuentaCon(ana, "se-arrepiente", false);
      await s.ops(ana, [op({ t: "anular_cuenta", cuenta: "se-arrepiente" })]);
      const r = (await s.ops(ana, [op({ t: "reabrir", cuenta: "se-arrepiente" })])) as any;
      expect(r.estado.cuentas["se-arrepiente"].anulada).toBe(false);
    });

    it("cualquiera cierra el día; los días anteriores y el CSV son del administrador", async () => {
      await cuentaCon(beto, "para-el-dia");
      await s.ops(beto, [op({ t: "cobrar", cuenta: "para-el-dia", pago: "p-dia", medio: "efectivo" })]);
      const hoy = new Date(Date.now() - 10 * 3600_000).toISOString().slice(0, 10);
      const r = (await s.ops(beto, [op({ t: "cerrar_jornada", fecha: hoy, contado: 5000 })])) as any;
      expect(r.rechazadas).toEqual([]);
      expect(r.estado.jornadas[hoy].at(-1)).toMatchObject({ por: "Beto", contado: 5000 });

      expect((await s.pedir(beto, "/api/admin/jornadas")).status).toBe(403);
      const { datos } = await json(await s.pedir(admin, "/api/admin/jornadas"));
      const dia = datos.dias.find((d: { fecha: string }) => d.fecha === hoy);
      expect(dia.vendido).toBeGreaterThan(0);
      expect(dia.cierres.at(-1).por).toBe("Beto");

      const csv = await s.pedir(admin, `/api/admin/jornadas/csv?fecha=${hoy}`);
      expect(csv.headers.get("content-type")).toContain("text/csv");
      expect(csv.headers.get("content-disposition")).toContain(`barra-${hoy}.csv`);
      const bytes = new Uint8Array(await csv.arrayBuffer());
      expect([...bytes.slice(0, 3)], "BOM, para que Excel lea las tildes").toEqual([0xef, 0xbb, 0xbf]);
      const texto = new TextDecoder().decode(bytes);
      expect(texto).toContain("para-el-dia");
      expect((await s.pedir(beto, `/api/admin/jornadas/csv?fecha=${hoy}`)).status).toBe(403);
    });

    it("lo rechazado queda registrado para el administrador", async () => {
      const { datos } = await json(await s.pedir(admin, "/api/admin/rechazadas"));
      expect(datos.rechazadas.length).toBeGreaterThan(0);
      expect(datos.rechazadas[0]).toHaveProperty("motivo");
    });
  });
});
