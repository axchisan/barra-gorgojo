// Un «navegador» de mentiras para las pruebas de push: sus llaves de suscripción y cómo
// descifra lo que le llega (RFC 8291), escrito aparte de src/servidor/push.ts a propósito.
// Sin importar nada de src/servidor: las pruebas del Worker corren con tipos de Node.
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const texto = new TextEncoder();

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, largo: number) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, largo * 8));
}
const juntar = (...p: Uint8Array[]) => { const r = new Uint8Array(p.reduce((t, x) => t + x.length, 0)); let i = 0; for (const x of p) { r.set(x, i); i += x.length; } return r; };

/** Un «navegador»: sus llaves de suscripción y cómo descifra (RFC 8291). */
export async function navegador() {
  const par = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const publica = new Uint8Array((await crypto.subtle.exportKey("raw", par.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    p256dh: b64url(publica),
    auth: b64url(auth),
    async descifrar(cuerpo: Uint8Array) {
      const sal = cuerpo.slice(0, 16);
      const rs = new DataView(cuerpo.buffer, cuerpo.byteOffset + 16, 4).getUint32(0);
      const largo = cuerpo[20];
      const delServidor = cuerpo.slice(21, 21 + largo);
      const cifrado = cuerpo.slice(21 + largo);
      const llave = await crypto.subtle.importKey("raw", delServidor, { name: "ECDH", namedCurve: "P-256" }, false, []);
      const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: llave }, par.privateKey, 256));
      const ikm = await hkdf(auth, compartido, juntar(texto.encode("WebPush: info\0"), publica, delServidor), 32);
      const cek = await hkdf(sal, ikm, texto.encode("Content-Encoding: aes128gcm\0"), 16);
      const nonce = await hkdf(sal, ikm, texto.encode("Content-Encoding: nonce\0"), 12);
      const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
      const plano = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, k, cifrado));
      return { rs, largo, mensaje: new TextDecoder().decode(plano.slice(0, -1)), delimitador: plano[plano.length - 1] };
    },
  };
}

