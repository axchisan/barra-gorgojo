// Lugares con código QR (mesas y canchas) y el interruptor de los pedidos por QR (docs/20).
// Como las personas y los celulares, es configuración del negocio: vive en tablas del
// Durable Object, no en el registro de operaciones.

import type { Cancha } from "../dominio/estado";
import type { LugarSolicitud } from "../dominio/solicitudes";
import { aleatorio } from "./acceso";

export interface Lugar extends LugarSolicitud {
  activo: boolean;
  creado: number;
}

type FilaLugar = { token: string; tipo: string; numero: number | null; cancha: string | null; nombre: string; activo: number; creado: number };

const aLugar = (f: FilaLugar): Lugar => ({
  token: f.token, tipo: f.tipo === "cancha" ? "cancha" : "mesa", nombre: f.nombre, activo: !!f.activo, creado: f.creado,
  ...(f.numero ? { numero: f.numero } : {}), ...(f.cancha ? { cancha: f.cancha as Cancha } : {}),
});

/** Cuántos pedidos acepta un mismo código: uno cada 20 s y 10 por hora. */
export const ESPERA_ENTRE_PEDIDOS = 20_000;
export const PEDIDOS_POR_HORA = 10;

export class Lugares {
  constructor(private sql: SqlStorage) {}

  preparar() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS lugares_qr (
      token TEXT PRIMARY KEY, tipo TEXT NOT NULL, numero INTEGER, cancha TEXT, nombre TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1, creado INTEGER NOT NULL)`);
    this.sql.exec("CREATE TABLE IF NOT EXISTS pedidos_qr (token TEXT NOT NULL, en INTEGER NOT NULL)");
    this.sql.exec("CREATE INDEX IF NOT EXISTS pedidos_qr_token ON pedidos_qr (token, en)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)");
  }

  /** Si se reciben pedidos por QR. Apagado de entrada: lo enciende el administrador. */
  encendido(): boolean {
    return this.sql.exec<{ valor: string }>("SELECT valor FROM ajustes WHERE clave = 'qr'").toArray()[0]?.valor === "1";
  }

  encender(si: boolean) {
    this.sql.exec("INSERT INTO ajustes (clave, valor) VALUES ('qr', ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor", si ? "1" : "0");
  }

  listar(): Lugar[] {
    return this.sql.exec<FilaLugar>("SELECT * FROM lugares_qr ORDER BY tipo DESC, numero, cancha, creado").toArray().map(aLugar);
  }

  porToken(token: string): Lugar | undefined {
    if (!/^[\w-]{10,64}$/.test(token)) return undefined;
    const f = this.sql.exec<FilaLugar>("SELECT * FROM lugares_qr WHERE token = ?", token).toArray()[0];
    return f ? aLugar(f) : undefined;
  }

  /** Un lugar nuevo con su código (o el mismo lugar si ya existe uno activo igual). */
  crear(tipo: "mesa" | "cancha", numero: number | undefined, cancha: Cancha | undefined): Lugar | { error: string } {
    if (tipo === "mesa" && !(numero && numero > 0 && numero < 1000)) return { error: "Escriba el número de la mesa." };
    if (tipo === "cancha" && !cancha) return { error: "Escoja la cancha." };
    const nombre = tipo === "mesa" ? `Mesa ${numero}` : `Cancha ${cancha === "pequena" ? "pequeña" : cancha}`;
    const ya = this.listar().find((l) => l.activo && l.nombre === nombre);
    if (ya) return ya;
    const token = aleatorio(16);
    this.sql.exec("INSERT INTO lugares_qr (token, tipo, numero, cancha, nombre, activo, creado) VALUES (?, ?, ?, ?, ?, 1, ?)",
      token, tipo, tipo === "mesa" ? numero! : null, tipo === "cancha" ? cancha! : null, nombre, Date.now());
    return this.porToken(token)!;
  }

  /** Cambia el código de un lugar (si alguien copió el QR): el viejo deja de servir. */
  rotar(token: string): Lugar | { error: string } {
    const l = this.porToken(token);
    if (!l) return { error: "Ese código no existe." };
    const nuevo = aleatorio(16);
    this.sql.exec("UPDATE lugares_qr SET token = ? WHERE token = ?", nuevo, token);
    return this.porToken(nuevo)!;
  }

  activar(token: string, activo: boolean) {
    this.sql.exec("UPDATE lugares_qr SET activo = ? WHERE token = ?", activo ? 1 : 0, token);
  }

  /** Si este código puede pedir ya; si no, cuánto falta (ms). Cuenta el pedido si puede. */
  puedePedir(token: string, ahora = Date.now()): { ok: true } | { ok: false; espera: number } {
    this.sql.exec("DELETE FROM pedidos_qr WHERE en < ?", ahora - 3600_000);
    const en = this.sql.exec<{ en: number }>("SELECT en FROM pedidos_qr WHERE token = ? ORDER BY en DESC", token).toArray().map((f) => f.en);
    if (en[0] && ahora - en[0] < ESPERA_ENTRE_PEDIDOS) return { ok: false, espera: ESPERA_ENTRE_PEDIDOS - (ahora - en[0]) };
    if (en.length >= PEDIDOS_POR_HORA) return { ok: false, espera: en[en.length - 1] + 3600_000 - ahora };
    this.sql.exec("INSERT INTO pedidos_qr (token, en) VALUES (?, ?)", token, ahora);
    return { ok: true };
  }
}
