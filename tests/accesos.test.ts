// Accesos de empleados (docs/17): horario de acceso y lo que ve cada persona.
import { describe, expect, it } from "vitest";
import { dentroDeHorario, describirHorario, finDeFranja, HORARIO_EMPLEADO, mensajeFueraDeHorario, normalizarHorario, proximaFranja, type Horario } from "../src/dominio/horario";
import { aplicar, estadoVacio, jornada, type Operacion } from "../src/dominio/estado";
import { limitarCambios, limitarEstado } from "../src/dominio/vista";

/** Una hora de Colombia (UTC−5) como milisegundos. */
const bogota = (texto: string) => Date.parse(`${texto}-05:00`);
// 2026-11-15 es domingo.

describe("horario de acceso", () => {
  it("sin horario, siempre", () => {
    expect(dentroDeHorario(null, bogota("2026-11-17T03:00:00"))).toBe(true);
  });

  it("el de empleado: domingos de 8:00 a. m. a 3:00 p. m., hora de Colombia", () => {
    const h = HORARIO_EMPLEADO;
    expect(dentroDeHorario(h, bogota("2026-11-15T07:59:00"))).toBe(false);
    expect(dentroDeHorario(h, bogota("2026-11-15T08:00:00"))).toBe(true);
    expect(dentroDeHorario(h, bogota("2026-11-15T14:59:00"))).toBe(true);
    expect(dentroDeHorario(h, bogota("2026-11-15T15:00:00"))).toBe(false);
    expect(dentroDeHorario(h, bogota("2026-11-14T10:00:00")), "sábado").toBe(false);
    expect(finDeFranja(h, bogota("2026-11-15T09:00:00"))).toBe(bogota("2026-11-15T15:00:00"));
    expect(finDeFranja(h, bogota("2026-11-15T16:00:00"))).toBeNull();
  });

  it("un día especial suma una franja; si es de noche puede pasar de la medianoche", () => {
    const h: Horario = { semanal: [], especiales: [{ fecha: "2026-11-21", desde: 18 * 60, hasta: 26 * 60 }] };
    expect(dentroDeHorario(h, bogota("2026-11-21T17:00:00"))).toBe(false);
    expect(dentroDeHorario(h, bogota("2026-11-21T23:30:00"))).toBe(true);
    expect(dentroDeHorario(h, bogota("2026-11-22T01:30:00")), "1:30 a. m. del día siguiente").toBe(true);
    expect(dentroDeHorario(h, bogota("2026-11-22T02:00:00"))).toBe(false);
  });

  it("franjas seguidas se juntan: termina al final de la última", () => {
    const h: Horario = { semanal: [{ dia: 0, desde: 480, hasta: 900 }], especiales: [{ fecha: "2026-11-15", desde: 900, hasta: 1200 }] };
    expect(finDeFranja(h, bogota("2026-11-15T10:00:00"))).toBe(bogota("2026-11-15T20:00:00"));
  });

  it("dice cuándo puede entrar", () => {
    expect(mensajeFueraDeHorario(HORARIO_EMPLEADO, bogota("2026-11-15T06:00:00"))).toBe("Fuera de su horario. Puede entrar hoy a las 8:00 a. m.");
    expect(mensajeFueraDeHorario(HORARIO_EMPLEADO, bogota("2026-11-14T20:00:00"))).toBe("Fuera de su horario. Puede entrar mañana a las 8:00 a. m.");
    expect(mensajeFueraDeHorario(HORARIO_EMPLEADO, bogota("2026-11-17T10:00:00"))).toBe("Fuera de su horario. Puede entrar el domingo a las 8:00 a. m.");
    expect(mensajeFueraDeHorario({ semanal: [], especiales: [] }, bogota("2026-11-17T10:00:00"))).toMatch(/no tiene acceso/);
    expect(proximaFranja(HORARIO_EMPLEADO, bogota("2026-11-15T16:00:00"))?.[0]).toBe(bogota("2026-11-22T08:00:00"));
  });

  it("en una frase", () => {
    expect(describirHorario(HORARIO_EMPLEADO)).toBe("Domingos de 8:00 a. m. a 3:00 p. m.");
    expect(describirHorario(null)).toBe("Sin restricción de horario");
  });

  it("lo que manda el administrador se limpia", () => {
    expect(normalizarHorario(null)).toBeNull();
    expect(normalizarHorario({ semanal: [{ dia: 9, desde: 0, hasta: 10 }, { dia: 1, desde: 600, hasta: 500 }, { dia: 2, desde: 600, hasta: 700, x: 1 }], especiales: [{ fecha: "mañana", desde: 0, hasta: 1 }] }))
      .toEqual({ semanal: [{ dia: 2, desde: 600, hasta: 700 }], especiales: [] });
  });
});

describe("lo que ve cada persona", () => {
  const ahora = bogota("2026-11-15T12:00:00");
  const ayer = ahora - 24 * 3600_000;
  let n = 0;
  const op = (o: Record<string, unknown>, en = ahora): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona: "Ana", en, ...o }) as Operacion;
  const estado = () => [
    op({ t: "abrir", cuenta: "vieja", nombre: "Vieja", tipo: "grupo" }, ayer),
    op({ t: "anotar", cuenta: "vieja", ronda: "r1", lineas: [{ id: "l1", producto: "rubia", cantidad: 1 }] }, ayer),
    op({ t: "cobrar", cuenta: "vieja", pago: "p1", medio: "deuda", deudor: "Pedro" }, ayer),
    op({ t: "abrir", cuenta: "abierta-ayer", nombre: "Abierta", tipo: "grupo" }, ayer),
    op({ t: "anotar", cuenta: "abierta-ayer", ronda: "r2", lineas: [{ id: "l2", producto: "rubia", cantidad: 1 }] }, ayer),
    op({ t: "abrir", cuenta: "hoy", nombre: "Hoy", tipo: "grupo" }),
    op({ t: "anotar", cuenta: "hoy", ronda: "r3", lineas: [{ id: "l3", producto: "rubia", cantidad: 2 }] }),
    op({ t: "cobrar", cuenta: "hoy", pago: "p3", medio: "deuda", deudor: "Pedro" }),
    op({ t: "cerrar_jornada", fecha: jornada(ayer), contado: 0 }, ayer),
  ].reduce((e, o) => aplicar(e, o), estadoVacio());

  it("con todo, nada cambia", () => {
    const e = estado();
    expect(limitarEstado(e, { dia: true, historial: true }, ahora)).toBe(e);
  });

  it("sin el día, no le llegan los cierres de caja", () => {
    const e = limitarEstado(estado(), { dia: false, historial: true }, ahora);
    expect(e.jornadas).toBeUndefined();
    expect(Object.keys(e.cuentas)).toHaveLength(3);
  });

  it("sin historial: cuentas abiertas y de hoy; de las deudas, solo lo de hoy", () => {
    const e = limitarEstado(estado(), { dia: false, historial: false }, ahora);
    expect(Object.keys(e.cuentas).sort()).toEqual(["abierta-ayer", "hoy"]);
    expect(e.deudas?.pedro.movimientos.map((m) => m.valor)).toEqual([8000]);
    // El estado completo no se toca.
    expect(estado().deudas?.pedro.movimientos).toHaveLength(2);
  });

  it("los cambios después de cada operación también se recortan", () => {
    const e = estado();
    const c = limitarCambios({ cuentas: { vieja: e.cuentas.vieja, hoy: e.cuentas.hoy }, jornadas: e.jornadas, deudas: e.deudas }, { dia: false, historial: false }, ahora);
    expect(Object.keys(c.cuentas ?? {})).toEqual(["hoy"]);
    expect(c.jornadas).toBeUndefined();
    expect(c.deudas?.pedro.movimientos).toHaveLength(1);
  });
});
