// La tabla de conflictos de docs/04, fila por fila (regla 6), y la propiedad de
// convergencia: secuencias al azar de tres celulares, entregadas con duplicados y
// reintentos, terminan en el mismo estado que el servidor (E6 de docs/12).
import { describe, expect, it } from "vitest";
import { PRECIO_CANCHA_DESDE, aplicar, estadoVacio, saldo, situacion, total, type Estado, type Operacion } from "../src/dominio/estado";

let n = 0;
const op = (o: Record<string, unknown>, persona = "Ana"): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona, en: PRECIO_CANCHA_DESDE + 1_000 + n, ...o }) as Operacion;
const correr = (ops: Operacion[], e: Estado = estadoVacio()) => ops.reduce((x, o) => aplicar(x, o), e);

describe("tabla de conflictos (docs/04)", () => {
  it("se anota en una cuenta que otro ya cobró: se acepta y se reabre con saldo (RF-26)", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "a", nombre: "A", tipo: "grupo" }),
      op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [{ id: "l1", producto: "rubia", cantidad: 2 }] }),
      op({ t: "cobrar", cuenta: "a", pago: "p1", medio: "nequi" }, "Beto"),
      op({ t: "anotar", cuenta: "a", ronda: "r2", lineas: [{ id: "l2", producto: "rubia", cantidad: 1 }] }),
    ]);
    expect(e.cuentas.a.reabierta).toBe(true);
    expect(situacion(e.cuentas.a)).toBe("abierta");
    expect(saldo(e.cuentas.a)).toBe(4000);
  });

  it("se anota en una mesa pasada a comida y ya cobrada en cocina: vuelve a quedar pendiente", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "m", nombre: "Mesa 2", tipo: "mesa", mesa: 2 }),
      op({ t: "anotar", cuenta: "m", ronda: "r1", lineas: [{ id: "l1", producto: "rubia", cantidad: 1 }] }),
      op({ t: "cobrar", cuenta: "m", pago: "p1", medio: "comida" }),
      op({ t: "comida_cobrada", cuenta: "m", valor: true }),
      op({ t: "anotar", cuenta: "m", ronda: "r2", lineas: [{ id: "l2", producto: "rubia", cantidad: 1 }] }),
    ]);
    expect(e.cuentas.m.comidaCobrada).toBe(false);
    expect(e.cuentas.m.reabierta).toBe(true);
    expect(saldo(e.cuentas.m)).toBe(4000);
  });

  it("se anota en una cuenta anulada: se acepta y se reactiva (si alguien anotó, había clientes)", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "a", nombre: "A", tipo: "grupo" }),
      op({ t: "anular_cuenta", cuenta: "a" }),
      op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [{ id: "l1", producto: "rubia", cantidad: 1 }] }),
    ]);
    expect(e.cuentas.a.anulada).toBe(false);
    expect(total(e.cuentas.a)).toBe(4000);
  });

  it("dos celulares anulan la misma línea: la segunda no hace nada y queda quién fue primero", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "a", nombre: "A", tipo: "grupo" }),
      op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [{ id: "l1", producto: "rubia", cantidad: 1 }, { id: "l2", producto: "rubia", cantidad: 1 }] }),
      op({ t: "anular", cuenta: "a", linea: "l1" }, "Ana"),
      op({ t: "anular", cuenta: "a", linea: "l1" }, "Beto"),
    ]);
    expect(e.cuentas.a.lineas[0].anulada?.por).toBe("Ana");
    expect(total(e.cuentas.a)).toBe(4000);
  });

  it("dos celulares cobran la misma cuenta: cobra el primero; el segundo no cobra doble", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "a", nombre: "A", tipo: "grupo" }),
      op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [{ id: "l1", producto: "rubia", cantidad: 2 }] }),
      op({ t: "cobrar", cuenta: "a", pago: "p1", medio: "nequi" }, "Ana"),
      op({ t: "cobrar", cuenta: "a", pago: "p2", medio: "efectivo" }, "Beto"),
    ]);
    expect(e.cuentas.a.pagos.map((p) => [p.persona, p.medio, p.monto])).toEqual([["Ana", "nequi", 8000]]);
  });

  it("dos celulares renombran la misma cuenta: gana el último en llegar", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "a", nombre: "A", tipo: "grupo" }),
      op({ t: "renombrar", cuenta: "a", nombre: "Los de rojo" }),
      op({ t: "renombrar", cuenta: "a", nombre: "Los de azul" }),
    ]);
    expect(e.cuentas.a.nombre).toBe("Los de azul");
  });
});

// ── Propiedad de convergencia ─────────────────────────────────────────────────

/** Generador con semilla: la misma semilla da la misma secuencia (si falla, se reproduce). */
function azar(semilla: number) {
  let s = semilla >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return { r, de: <T>(xs: T[]) => xs[Math.floor(r() * xs.length)], entero: (a: number, b: number) => a + Math.floor(r() * (b - a + 1)) };
}

/** Lo que tres celulares podrían anotar sin verse, sobre unas pocas cuentas. */
function generar(semilla: number): Operacion[] {
  const { r, de, entero } = azar(semilla);
  const personas = ["Ana", "Beto", "Apoyo"];
  const cuentas = ["c1", "c2", "c3", "m1"];
  const ops: Operacion[] = cuentas.map((c) => op({ t: "abrir", cuenta: c, nombre: c, tipo: c.startsWith("m") ? "mesa" : "grupo", mesa: c.startsWith("m") ? 1 : undefined }, de(personas)));
  const lineas: [string, string][] = [];
  for (let i = 0; i < 40; i++) {
    const cuenta = de(cuentas), persona = de(personas), k = r();
    if (k < 0.45) {
      const id = `l-${semilla}-${i}`;
      lineas.push([cuenta, id]);
      ops.push(op({ t: "anotar", cuenta, ronda: `r-${semilla}-${i}`, lineas: [{ id, producto: de(["rubia", "negra", "light", "gaseosa"]), cantidad: entero(1, 4) }] }, persona));
    } else if (k < 0.55 && lineas.length) {
      const [c, l] = de(lineas);
      ops.push(op({ t: "anular", cuenta: c, linea: l }, persona));
    } else if (k < 0.65 && lineas.length) {
      const [c, l] = de(lineas);
      ops.push(op({ t: "cantidad", cuenta: c, linea: l, cantidad: entero(1, 5) }, persona));
    } else if (k < 0.82) {
      ops.push(op({ t: "cobrar", cuenta, pago: `p-${semilla}-${i}`, medio: cuenta.startsWith("m") && r() < 0.5 ? "comida" : de(["efectivo", "nequi", "breve"]) }, persona));
    } else if (k < 0.9) {
      ops.push(op({ t: "reabrir", cuenta }, persona));
    } else if (k < 0.95) {
      ops.push(op({ t: "renombrar", cuenta, nombre: `${cuenta}-${i}` }, persona));
    } else {
      ops.push(op({ t: "comida_cobrada", cuenta, valor: r() < 0.7 }, persona));
    }
  }
  return ops;
}

/** Baraja con la misma semilla (orden de llegada al servidor). */
const barajar = <T>(xs: T[], semilla: number) => {
  const { r } = azar(semilla);
  const ys = [...xs];
  for (let i = ys.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ys[i], ys[j]] = [ys[j], ys[i]]; }
  return ys;
};

describe("convergencia (propiedad, 200 secuencias al azar)", () => {
  const SEMILLAS = Array.from({ length: 200 }, (_, i) => 1000 + i);

  it("aplicar dos veces cualquier operación da lo mismo que una (reintentos)", () => {
    for (const semilla of SEMILLAS.slice(0, 50)) {
      const ops = generar(semilla);
      const una = correr(ops);
      const dos = ops.reduce((e, o) => aplicar(aplicar(e, o), o), estadoVacio());
      expect(dos, `semilla ${semilla}`).toEqual(una);
    }
  });

  it("los celulares terminan con el estado del servidor, aunque lleguen en otro orden, repetidas y con pendientes reaplicados", () => {
    for (const semilla of SEMILLAS) {
      // Las abre uno; el resto llega al servidor en cualquier orden, con duplicados.
      const ops = generar(semilla);
      const [aperturas, resto] = [ops.slice(0, 4), ops.slice(4)];
      const llegada = [...aperturas, ...barajar([...resto, ...barajar(resto, semilla).slice(0, 8)], semilla + 7)];
      const vistos = new Set<string>();
      const registro = llegada.filter((o) => (vistos.has(o.id) ? false : (vistos.add(o.id), true))); // el servidor guarda una vez por id
      const servidor = correr(registro);

      // Cada celular: lo confirmado hasta un punto, y encima sus pendientes (algunos ya confirmados).
      for (const corte of [0, Math.floor(registro.length / 2), registro.length]) {
        const confirmado = correr(registro.slice(0, corte));
        const pendientes = barajar(registro.slice(Math.max(0, corte - 5)), semilla + corte).filter((_, i) => i % 3 !== 0);
        // Al confirmarse todo, el celular rehace lo visible con lo confirmado + lo que le falta.
        const final = correr([...registro.slice(corte)], structuredClone(confirmado));
        expect(final, `semilla ${semilla} corte ${corte}`).toEqual(servidor);
        // Mientras tanto, reaplicar pendientes ya confirmados no rompe nada: el total nunca baja de lo cobrado por error doble.
        const visible = correr(pendientes, structuredClone(confirmado));
        for (const c of Object.values(visible.cuentas)) {
          const cobros = c.pagos.filter((p) => !p.deshecho);
          expect(new Set(cobros.map((p) => p.id)).size, `semilla ${semilla}`).toBe(cobros.length);
        }
      }

      // Nunca se cobra de más: cada cobro que entra cobra exactamente el saldo que había.
      const e = estadoVacio();
      for (const o of registro) {
        const c = "cuenta" in o ? e.cuentas[o.cuenta] : undefined;
        const antes = c ? { pagos: c.pagos.length, saldo: saldo(c) } : null;
        aplicar(e, o);
        if (o.t === "cobrar" && c && antes && c.pagos.length > antes.pagos) {
          expect(antes.saldo, `semilla ${semilla}: cobro sin saldo`).toBeGreaterThan(0);
          expect(c.pagos.at(-1)!.monto, `semilla ${semilla}: cobró distinto del saldo`).toBe(antes.saldo);
          expect(saldo(c), `semilla ${semilla}`).toBe(0);
        }
      }
    }
  });
});
