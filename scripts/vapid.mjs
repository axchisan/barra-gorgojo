// Genera la llave VAPID de las notificaciones push (docs/18 fase 4, ADR-19) y la escribe
// en la salida, para pasarla directo a wrangler sin que quede en la terminal ni en archivos:
//
//   node scripts/vapid.mjs | pnpm wrangler secret put VAPID --env pruebas
//   node scripts/vapid.mjs | pnpm wrangler secret put VAPID          # producción
//
// Cambiar la llave obliga a cada aparato a volver a activar los avisos (sus suscripciones
// quedan con la llave vieja): generarla una sola vez por entorno.
const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const { kty, crv, x, y, d } = await crypto.subtle.exportKey("jwk", par.privateKey);
process.stdout.write(JSON.stringify({ kty, crv, x, y, d }));
