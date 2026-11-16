// Notificaciones push (docs/18 fase 4): el cifrado y la firma VAPID se prueban haciendo lo
// que hace el navegador al recibir (descifrar con su llave privada) y lo que hace el
// servicio de push (verificar la firma con la llave pública).
import { describe, expect, it } from "vitest";
import { b64url, cifrar, deB64url, endpointValido, firmaVapid, leerVapid } from "../src/servidor/push";
import { navegador } from "./navegador-push";

const texto = new TextEncoder();

async function llaveVapid() {
  const par = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  return { jwk: JSON.stringify(await crypto.subtle.exportKey("jwk", par.privateKey)), verificar: par.publicKey };
}

describe("push: cifrado (RFC 8291, aes128gcm)", () => {
  it("el navegador descifra el aviso con su llave", async () => {
    const n = await navegador();
    const aviso = JSON.stringify({ titulo: "🍺 Pedido para despachar", cuerpo: "Mesa 4: 3 Águila" });
    const r = await n.descifrar(await cifrar(aviso, n.p256dh, n.auth));
    expect(r.mensaje).toBe(aviso);
    expect(r.delimitador).toBe(2); // último registro
    expect(r.rs).toBe(4096);
    expect(r.largo).toBe(65); // llave pública sin comprimir
  });

  it("cada aviso lleva sal y llave propias: dos cifrados del mismo texto no se parecen", async () => {
    const n = await navegador();
    const a = await cifrar("hola", n.p256dh, n.auth);
    const b = await cifrar("hola", n.p256dh, n.auth);
    expect(b64url(a)).not.toBe(b64url(b));
  });

  it("con otras llaves no se descifra", async () => {
    const n = await navegador();
    const otro = await navegador();
    await expect(otro.descifrar(await cifrar("hola", n.p256dh, n.auth))).rejects.toThrow();
  });
});

describe("push: VAPID (RFC 8292)", () => {
  it("la firma la verifica la llave pública, con el origen del servicio en aud", async () => {
    const { jwk, verificar } = await llaveVapid();
    const vapid = (await leerVapid(jwk))!;
    expect(vapid).not.toBeNull();
    const ahora = Date.UTC(2026, 10, 16, 12);
    const cabecera = await firmaVapid(vapid, "https://fcm.googleapis.com/fcm/send/abc", "https://barra.example", ahora);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(cabecera)!;
    expect(m).not.toBeNull();
    const datos = JSON.parse(new TextDecoder().decode(deB64url(m[2])));
    expect(datos).toEqual({ aud: "https://fcm.googleapis.com", exp: ahora / 1000 + 12 * 3600, sub: "https://barra.example" });
    expect(m[4]).toBe(vapid.publica);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verificar, deB64url(m[3]), texto.encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
    // La pública es la del par (0x04 || x || y).
    const cruda = new Uint8Array((await crypto.subtle.exportKey("raw", verificar)) as ArrayBuffer);
    expect(vapid.publica).toBe(b64url(cruda));
  });

  it("sin llave, o con una que no es P-256 privada, push queda apagado", async () => {
    expect(await leerVapid(undefined)).toBeNull();
    expect(await leerVapid("no es json")).toBeNull();
    expect(await leerVapid(JSON.stringify({ kty: "EC", crv: "P-256", x: "a", y: "b" }))).toBeNull();
  });
});

describe("push: a dónde se manda", () => {
  it("solo a servicios de push conocidos, por https", () => {
    expect(endpointValido("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(endpointValido("https://web.push.apple.com/QF1")).toBe(true);
    expect(endpointValido("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(endpointValido("https://ejemplo.com/push")).toBe(false);
    expect(endpointValido("http://fcm.googleapis.com/x")).toBe(false);
    expect(endpointValido("https://fcm.googleapis.com.ejemplo.com/x")).toBe(false);
    expect(endpointValido("http://127.0.0.1:9999/x")).toBe(false);
    expect(endpointValido("http://127.0.0.1:9999/x", true)).toBe(true);
    expect(endpointValido(42)).toBe(false);
  });
});
