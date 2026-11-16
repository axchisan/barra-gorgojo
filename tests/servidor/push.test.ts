// Notificaciones push (docs/18 fase 4) con el Worker real y un servicio de push falso en
// 127.0.0.1: quién recibe el aviso de despacho, qué dice y qué pasa con las suscripciones.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navegador } from "../navegador-push";
import { arrancar, esperar, idDe, op, type Servidor } from "./arrancar";

type Llegada = { ruta: string; headers: Record<string, string | string[] | undefined>; cuerpo: Buffer };
const NUNCA = { semanal: [], especiales: [] };

describe("notificaciones push", () => {
  let s: Servidor;
  let falso: Server;
  let base: string;
  const llegadas: Llegada[] = [];
  let admin: string, ana: string, beto: string;
  let celAna: string, celBeto: string;
  const navs: Record<string, Awaited<ReturnType<typeof navegador>>> = {};

  const suscribir = async (token: string, quien: string, cookie?: string, ruta = quien) => {
    navs[ruta] = await navegador();
    return s.pedir(token, "/api/push", { method: "POST", body: JSON.stringify({ accion: "suscribir", endpoint: `${base}/${ruta}`, keys: { p256dh: navs[ruta].p256dh, auth: navs[ruta].auth } }) }, cookie);
  };
  const de = (ruta: string) => llegadas.filter((l) => l.ruta === `/${ruta}`);
  const leer = async (ruta: string, l: Llegada) => JSON.parse((await navs[ruta].descifrar(new Uint8Array(l.cuerpo))).mensaje);
  const personas = (token: string, cuerpo: unknown) => s.pedir(token, "/api/admin/personas", { method: "POST", body: JSON.stringify(cuerpo) });
  const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeAll(async () => {
    falso = createServer((req, res) => {
      const partes: Buffer[] = [];
      req.on("data", (d) => partes.push(d));
      req.on("end", () => {
        llegadas.push({ ruta: req.url ?? "", headers: req.headers, cuerpo: Buffer.concat(partes) });
        res.statusCode = req.url?.startsWith("/vencida") ? 410 : 201;
        res.end();
      });
    });
    await new Promise<void>((r) => falso.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(falso.address() as { port: number }).port}`;
    const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]) as CryptoKeyPair;
    s = await arrancar({ vapid: JSON.stringify(await crypto.subtle.exportKey("jwk", par.privateKey)), direccion: "https://barra.example" });
    admin = await s.token("Administrador");
    celAna = await s.celular("Celular de comida");
    celBeto = await s.celular("Celular de Beto");
    // Ana solo tiene comida; Beto y el administrador, barra.
    expect((await personas(admin, { accion: "areas", id: "ana", areas: ["comida"] })).status).toBe(200);
    ana = await s.token("Ana", celAna);
    beto = await s.token("Beto", celBeto);
  });
  afterAll(async () => { await s?.apagar(); falso?.close(); });

  it("da la llave pública y dice si este aparato está suscrito", async () => {
    const r = (await (await s.pedir(admin, "/api/push")).json()) as { llave: string; suscrito: boolean };
    expect(r.llave).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(r.suscrito).toBe(false);
  });

  it("solo acepta servicios de push y llaves con forma", async () => {
    const r = await s.pedir(admin, "/api/push", { method: "POST", body: JSON.stringify({ accion: "suscribir", endpoint: "https://ejemplo.com/x", keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) } }) });
    expect(r.status).toBe(400);
    const r2 = await s.pedir(admin, "/api/push", { method: "POST", body: JSON.stringify({ accion: "suscribir", endpoint: `${base}/x`, keys: { p256dh: "corta", auth: "b" } }) });
    expect(r2.status).toBe(400);
  });

  it("una bebida pedida desde comida avisa a la barra, no a quien la pidió ni a comida", async () => {
    expect((await suscribir(admin, "admin")).status).toBe(200);
    expect((await suscribir(beto, "beto", celBeto)).status).toBe(200);
    expect((await suscribir(ana, "ana", celAna)).status).toBe(200);
    expect(((await (await s.pedir(beto, "/api/push", {}, celBeto)).json()) as { suscrito: boolean }).suscrito).toBe(true);

    await s.ops(ana, [
      op({ t: "abrir", cuenta: "m4", nombre: "Mesa 4", tipo: "mesa" }),
      op({ t: "anotar", cuenta: "m4", ronda: "r1", area: "comida", lineas: [{ id: "p1", producto: "sopa", cantidad: 1 }, { id: "b1", producto: "rubia", cantidad: 3 }] }),
    ], undefined, celAna);
    await esperar(() => de("admin").length === 1 && de("beto").length === 1);
    await pausa(200);
    expect(de("ana")).toHaveLength(0);

    const aviso = await leer("beto", de("beto")[0]);
    expect(aviso).toEqual({ titulo: "🍺 Pedido para despachar", cuerpo: "Mesa 4: 3 Rubia", etiqueta: "despacho-m4", ir: "despacho" });
    const h = de("beto")[0].headers;
    expect(h["content-encoding"]).toBe("aes128gcm");
    expect(h.ttl).toBe("600");
    expect(h.urgency).toBe("high");
    expect(String(h.authorization)).toMatch(/^vapid t=.+\..+\..+, k=[A-Za-z0-9_-]{87}$/);
  });

  it("solo platos, o lo que anota la barra misma, no avisa", async () => {
    const antes = llegadas.length;
    await s.ops(ana, [op({ t: "anotar", cuenta: "m4", ronda: "r2", area: "comida", lineas: [{ id: "p2", producto: "sopa", cantidad: 2 }] })], undefined, celAna);
    await s.ops(beto, [op({ t: "anotar", cuenta: "m4", ronda: "r3", lineas: [{ id: "b2", producto: "rubia", cantidad: 1 }] })], undefined, celBeto);
    await pausa(400);
    expect(llegadas.length).toBe(antes);
  });

  it("el aparato que lo pidió no recibe el aviso aunque tenga barra", async () => {
    // El administrador tiene las dos áreas: pide una bebida desde comida en su aparato.
    await personas(admin, { accion: "areas", id: idDe("Administrador"), areas: ["barra", "comida"] });
    const antes = de("admin").length;
    await s.ops(admin, [op({ t: "anotar", cuenta: "m4", ronda: "r4", area: "comida", lineas: [{ id: "b3", producto: "agua", cantidad: 1 }] })]);
    await esperar(() => de("beto").length === 2);
    await pausa(200);
    expect(de("admin").length).toBe(antes);
    expect((await leer("beto", de("beto")[1])).cuerpo).toBe("Mesa 4: 1 Agua");
  });

  it("quien está fuera de su horario no recibe avisos", async () => {
    await personas(admin, { accion: "horario", id: "beto", horario: NUNCA });
    const antes = de("beto").length;
    await s.ops(ana, [op({ t: "anotar", cuenta: "m4", ronda: "r5", area: "comida", lineas: [{ id: "b4", producto: "rubia", cantidad: 1 }] })], undefined, celAna);
    await esperar(() => de("admin").length === 2);
    await pausa(200);
    expect(de("beto").length).toBe(antes);
    await personas(admin, { accion: "horario", id: "beto", horario: null });
  });

  it("el aviso de prueba llega solo a este aparato", async () => {
    const antes = llegadas.length;
    const r = await s.pedir(beto, "/api/push", { method: "POST", body: JSON.stringify({ accion: "probar" }) }, celBeto);
    expect(r.status).toBe(200);
    expect(llegadas.length).toBe(antes + 1);
    expect((await leer("beto", llegadas[llegadas.length - 1])).titulo).toBe("🔔 Aviso de prueba");
  });

  it("si el servicio dice que la suscripción ya no existe (410), se borra", async () => {
    expect((await suscribir(beto, "beto", celBeto, "vencida")).status).toBe(200);
    await s.ops(ana, [op({ t: "anotar", cuenta: "m4", ronda: "r6", area: "comida", lineas: [{ id: "b5", producto: "rubia", cantidad: 1 }] })], undefined, celAna);
    await esperar(() => de("vencida").length === 1);
    await pausa(300);
    const r = (await (await s.pedir(beto, "/api/push", {}, celBeto)).json()) as { suscrito: boolean };
    expect(r.suscrito).toBe(false);
  });

  it("quitar el aparato (o dejar de recibir) borra su suscripción", async () => {
    expect((await suscribir(beto, "beto", celBeto)).status).toBe(200);
    expect((await s.pedir(beto, "/api/push", { method: "POST", body: JSON.stringify({ accion: "quitar" }) }, celBeto)).status).toBe(200);
    expect(((await (await s.pedir(beto, "/api/push", {}, celBeto)).json()) as { suscrito: boolean }).suscrito).toBe(false);

    expect((await suscribir(beto, "beto", celBeto)).status).toBe(200);
    const lista = (await (await s.pedir(admin, "/api/admin/dispositivos")).json()) as { dispositivos: { id: string; nombre: string }[] };
    const id = lista.dispositivos.find((d) => d.nombre === "Celular de Beto")!.id;
    expect((await s.pedir(admin, "/api/admin/dispositivos", { method: "POST", body: JSON.stringify({ revocar: id }) })).status).toBe(200);
    const antes = de("beto").length;
    await s.ops(ana, [op({ t: "anotar", cuenta: "m4", ronda: "r7", area: "comida", lineas: [{ id: "b6", producto: "rubia", cantidad: 1 }] })], undefined, celAna);
    await esperar(() => de("admin").length === 4);
    await pausa(200);
    expect(de("beto").length).toBe(antes);
  });

  it("un rechazo por error del sistema avisa a los administradores (uno cada 30 minutos) y queda marcado", async () => {
    const antes = de("admin").length;
    // La app manda algo que el servidor no entiende (una pedida sin cuenta): error del sistema.
    const r1 = (await s.ops(ana, [op({ t: "anotar", ronda: "x", lineas: [] })], undefined, celAna)) as any;
    expect(r1.rechazadas).toHaveLength(1);
    await esperar(() => de("admin").length === antes + 1);
    const aviso = await leer("admin", de("admin")[antes]);
    expect(aviso).toMatchObject({ titulo: "⚠️ La barra tuvo un error", etiqueta: "error", ir: "personas" });
    // Otro error enseguida: queda registrado, pero no vuelve a avisar.
    await s.ops(ana, [op({ t: "anotar", ronda: "y", lineas: [] })], undefined, celAna);
    // Un rechazo de las reglas del negocio no es error ni avisa.
    await s.ops(ana, [op({ t: "producto", producto: { id: "nuevo", nombre: "Nuevo", categoria: "otro", precio: 1000, activo: true, fondo: "#FFFFFF", texto: "#000000" } })], undefined, celAna);
    await pausa(300);
    expect(de("admin").length).toBe(antes + 1);
    const { rechazadas } = (await (await s.pedir(admin, "/api/admin/rechazadas")).json()) as { rechazadas: { motivo: string; error: number }[] };
    expect(rechazadas.slice(0, 3).map((r) => r.error)).toEqual([0, 1, 1]);
    expect(rechazadas[0].motivo).toBe("Solo el administrador cambia productos y precios.");
  });
});
