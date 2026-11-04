// Copia del respaldo fuera de Cloudflare (docs/13 «Respaldos fuera de la cuenta»): cada
// semana, el registro completo comprimido como adjunto de un correo por Resend. Si la
// cuenta de Cloudflare se pierde, queda la copia en el correo.
//
// Sin `RESEND_API_KEY` o sin destino, no hace nada (un clon nuevo, o el entorno de pruebas
// sin configurar). Destino y remitente vienen de negocio/despliegue.json (`pnpm desplegar`).

export interface ConfigCorreo {
  RESEND_API_KEY?: string;
  /** Uno o varios correos separados por comas. */
  RESPALDO_PARA?: string;
  /** Dirección del remitente (sin nombre), de un dominio verificado en Resend. */
  RESPALDO_DE?: string;
}

/** Lunes en Colombia: el día del correo semanal. */
export const esDiaDeCorreo = (ahora: number) => new Date(ahora - 5 * 3600_000).getUTCDay() === 1;

const base64 = (datos: ArrayBuffer) => {
  const bytes = new Uint8Array(datos);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/** La petición a Resend, o null si falta configuración. Pura: se prueba sin enviar nada. */
export function peticionRespaldo(env: ConfigCorreo, d: { fecha: string; base: string; operaciones: number; comprimido: ArrayBuffer }): { url: string; init: RequestInit } | null {
  const para = (env.RESPALDO_PARA ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!env.RESEND_API_KEY || !para.length) return null;
  const de = `Barra del Gorgojo <${env.RESPALDO_DE || "respaldos@resend.dev"}>`;
  return {
    url: "https://api.resend.com/emails",
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        // Si el Cron se reintenta, Resend no lo manda dos veces.
        "idempotency-key": `respaldo-${d.base}-${d.fecha}`,
      },
      body: JSON.stringify({
        from: de,
        to: para,
        subject: `Respaldo de la barra · ${d.fecha}`,
        text: [
          `Respaldo completo de la barra del ${d.fecha}: ${d.operaciones} operaciones (base ${d.base}).`,
          "",
          "Es el registro de todas las operaciones, comprimido. Guárdelo: con él se reconstruye todo",
          "(docs/06 «Respaldos», y pnpm ensayo-restauracion <archivo> para comprobarlo).",
        ].join("\n"),
        attachments: [{ filename: `barra-${d.base}-${d.fecha}.json.gz`, content: base64(d.comprimido) }],
      }),
    },
  };
}

/** Envía el correo; no lanza: si falla, queda en los logs y el respaldo en R2 sigue igual. */
export async function enviarRespaldo(env: ConfigCorreo, d: Parameters<typeof peticionRespaldo>[1]): Promise<"enviado" | "sin-configurar" | "falló"> {
  const p = peticionRespaldo(env, d);
  if (!p) return "sin-configurar";
  try {
    const r = await fetch(p.url, p.init);
    if (r.ok) return "enviado";
    console.error(JSON.stringify({ aviso: "respaldo-correo-fallo", status: r.status, cuerpo: (await r.text()).slice(0, 300) }));
  } catch (e) {
    console.error(JSON.stringify({ aviso: "respaldo-correo-fallo", error: String(e) }));
  }
  return "falló";
}
