// Apartados, domicilios y mesa sin número (2026-11-15, pedido de comida).
import { describe, expect, it } from "vitest";
import { aplicar, apartadosPendientes, estadoVacio, type Operacion } from "../src/dominio/estado";
import { describir } from "../src/dominio/auditoria";

const T0 = 1_800_000_000_000;
let n = 0;
const op = (o: Record<string, unknown>, en = T0 + ++n): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona: "Comida", en, ...o }) as Operacion;
const correr = (ops: Operacion[]) => ops.reduce((e, o) => aplicar(e, o), estadoVacio());
const anotar = (cuenta: string, ronda: string, extra: Record<string, unknown> = {}) =>
  op({ t: "anotar", cuenta, ronda, area: "comida", lineas: [{ id: `${ronda}-l`, producto: "rubia", cantidad: 1 }], ...extra });

describe("mesa sin número y domicilios", () => {
  it("una mesa puede abrirse sin número; un número inválido no queda", () => {
    const e = correr([op({ t: "abrir", cuenta: "a", nombre: "Mesa · 1:15 p. m.", tipo: "mesa" }), op({ t: "abrir", cuenta: "b", nombre: "Mesa", tipo: "mesa", mesa: 0 }), op({ t: "abrir", cuenta: "c", nombre: "Mesa 4", tipo: "mesa", mesa: 4 })]);
    expect(e.cuentas.a.mesa).toBeUndefined();
    expect(e.cuentas.b.mesa).toBeUndefined();
    expect(e.cuentas.c.mesa).toBe(4);
  });

  it("un domicilio guarda su dirección (opcional, recortada); otros tipos no", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "d", nombre: "Doña Rosa", tipo: "domicilio", direccion: "  Vereda El Carmen, casa azul  " }),
      op({ t: "abrir", cuenta: "g", nombre: "Grupo", tipo: "grupo", direccion: "no va" }),
    ]);
    expect(e.cuentas.d.direccion).toBe("Vereda El Carmen, casa azul");
    expect(e.cuentas.g.direccion).toBeUndefined();
    expect(describir(op({ t: "abrir", cuenta: "d", nombre: "Doña Rosa", tipo: "domicilio", direccion: "Vereda El Carmen" }), e.cuentas.d).texto).toBe("Abrió la cuenta (domicilio a Vereda El Carmen)");
  });
});

describe("apartados", () => {
  it("una pedida apartada guarda la hora; sin hora también vale; ordenados por hora", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "a", nombre: "Juan", tipo: "persona" }),
      anotar("a", "r1", { apartado: { para: T0 + 5 * 3600_000 } }),
      op({ t: "abrir", cuenta: "b", nombre: "Ana", tipo: "persona" }),
      anotar("b", "r2", { apartado: {} }),
      op({ t: "abrir", cuenta: "c", nombre: "Luis", tipo: "persona" }),
      anotar("c", "r3", { apartado: { para: T0 + 2 * 3600_000 } }),
      anotar("c", "r4"),
    ]);
    expect(apartadosPendientes(Object.values(e.cuentas)).map((x) => x.ronda.id)).toEqual(["r3", "r1", "r2"]);
    expect(e.cuentas.c.rondas[1].apartado).toBeUndefined();
  });

  it("una hora absurda (más de dos días) no queda, pero sigue apartado", () => {
    const e = correr([op({ t: "abrir", cuenta: "a", nombre: "Juan", tipo: "persona" }), anotar("a", "r1", { apartado: { para: T0 + 9 * 24 * 3600_000 } })]);
    expect(e.cuentas.a.rondas[0].apartado).toEqual({});
  });

  it("entregado sale de la lista; deshacer lo devuelve; lo anulado no sale", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "a", nombre: "Juan", tipo: "persona" }),
      anotar("a", "r1", { apartado: { para: T0 + 3600_000 } }),
      op({ t: "apartado_entregado", cuenta: "a", ronda: "r1", valor: true }),
    ]);
    expect(apartadosPendientes(Object.values(e.cuentas))).toHaveLength(0);
    expect(e.cuentas.a.rondas[0].entregado?.por).toBe("Comida");
    aplicar(e, op({ t: "apartado_entregado", cuenta: "a", ronda: "r1", valor: false }));
    expect(apartadosPendientes(Object.values(e.cuentas))).toHaveLength(1);
    aplicar(e, op({ t: "anular", cuenta: "a", linea: "r1-l" }));
    expect(apartadosPendientes(Object.values(e.cuentas))).toHaveLength(0);
  });

  it("marcar entregado una pedida que no es apartado no hace nada", () => {
    const e = correr([op({ t: "abrir", cuenta: "a", nombre: "Juan", tipo: "persona" }), anotar("a", "r1"), op({ t: "apartado_entregado", cuenta: "a", ronda: "r1", valor: true })]);
    expect(e.cuentas.a.rondas[0].entregado).toBeUndefined();
  });
});

describe("bebidas desde comida sin avisar a la barra", () => {
  it("con sinDespacho la bebida no queda por despachar; sin él (como antes), sí", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "a", nombre: "Mesa", tipo: "mesa" }),
      op({ t: "anotar", cuenta: "a", ronda: "r1", area: "comida", sinDespacho: true, lineas: [{ id: "x1", producto: "rubia", cantidad: 1 }] }),
      op({ t: "anotar", cuenta: "a", ronda: "r2", area: "comida", lineas: [{ id: "x2", producto: "rubia", cantidad: 1 }] }),
    ]);
    expect(e.cuentas.a.lineas.map((l) => !!l.porDespachar)).toEqual([false, true]);
    expect(e.cuentas.a.lineas[0].despachada?.por).toBe("Comida"); // la llevó comida: sigue siendo «de comida»
  });
});
