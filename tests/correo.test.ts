// Copia semanal del respaldo por correo (docs/13 «Respaldos fuera de la cuenta»).
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { esDiaDeCorreo, peticionRespaldo } from "../src/servidor/correo";

const comprimido = async (texto: string) => new Response(new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();

describe("correo del respaldo", () => {
  it("sin llave o sin destino no envía nada", async () => {
    const d = { fecha: "2026-11-09", base: "b", operaciones: 1, comprimido: await comprimido("{}") };
    expect(peticionRespaldo({}, d)).toBeNull();
    expect(peticionRespaldo({ RESEND_API_KEY: "re_x" }, d)).toBeNull();
    expect(peticionRespaldo({ RESPALDO_PARA: "a@b.co" }, d)).toBeNull();
  });

  it("arma el correo con el registro comprimido adjunto, varios destinos y una llave de idempotencia", async () => {
    const texto = JSON.stringify({ base: "v3", operaciones: [{ id: "x" }] });
    const p = peticionRespaldo(
      { RESEND_API_KEY: "re_prueba", RESPALDO_PARA: "a@b.co, c@d.co", RESPALDO_DE: "respaldos@ejemplo.com" },
      { fecha: "2026-11-09", base: "v3", operaciones: 1, comprimido: await comprimido(texto) },
    )!;
    expect(p.url).toBe("https://api.resend.com/emails");
    const h = p.init.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer re_prueba");
    expect(h["idempotency-key"]).toBe("respaldo-v3-2026-11-09");
    const cuerpo = JSON.parse(String(p.init.body));
    expect(cuerpo.to).toEqual(["a@b.co", "c@d.co"]);
    expect(cuerpo.from).toBe("Barra del Gorgojo <respaldos@ejemplo.com>");
    expect(cuerpo.attachments[0].filename).toBe("barra-v3-2026-11-09.json.gz");
    expect(gunzipSync(Buffer.from(cuerpo.attachments[0].content, "base64")).toString("utf8")).toBe(texto);
  });

  it("se manda los lunes, en hora de Colombia", () => {
    expect(esDiaDeCorreo(Date.parse("2026-11-09T10:30:00Z"))).toBe(true); // lunes 5:30 a. m. en Colombia
    expect(esDiaDeCorreo(Date.parse("2026-11-10T10:30:00Z"))).toBe(false);
    expect(esDiaDeCorreo(Date.parse("2026-11-09T03:00:00Z"))).toBe(false); // domingo 10 p. m. en Colombia
  });
});
