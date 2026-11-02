import { describe, expect, it } from "vitest";
import { PRECIO_CANCHA_DESDE, aplicar, catalogo, estadoVacio, recortar, saldo, situacion, total, totalComida, type Operacion } from "../src/dominio/estado";

let n = 0;
const op = (o: Record<string, unknown>): Operacion => ({ id: `op-${++n}-xxxxxxxx`, persona: "Ana", en: PRECIO_CANCHA_DESDE + 1_000 + n, ...o }) as Operacion;
const abrir = (cuenta: string, tipo = "grupo") => op({ t: "abrir", cuenta, nombre: cuenta, tipo, mesa: tipo === "mesa" ? 4 : undefined });
const anotar = (cuenta: string, ronda: string, lineas: [string, number, number?][]) =>
  op({ t: "anotar", cuenta, ronda, lineas: lineas.map(([producto, cantidad, precio], i) => ({ id: `${ronda}-${i}`, producto, cantidad, precio })) });
const correr = (ops: Operacion[]) => ops.reduce((e, o) => aplicar(e, o), estadoVacio());

describe("reglas de la barra", () => {
  it("suma con los precios del catálogo, no con los que manda el celular", () => {
    const e = correr([abrir("a"), anotar("a", "r1", [["rubia", 2, 1], ["light", 1], ["importada", 1]])]);
    expect(total(e.cuentas.a)).toBe(2 * 4000 + 4500 + 6000);
  });

  it("el mecato vale lo que se escribe, con tope", () => {
    const e = correr([abrir("a"), anotar("a", "r1", [["mecato", 2, 2000], ["mecato", 1, 9_999_999]])]);
    expect(total(e.cuentas.a)).toBe(4000);
  });

  it("«Otro» guarda el nombre escrito y el valor; sin nombre queda como «Otro»", () => {
    const e = correr([abrir("a"), op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [
      { id: "x1", producto: "otro", cantidad: 2, precio: 3500, nombre: "  Agua con gas " },
      { id: "x2", producto: "otro", cantidad: 1, precio: 1000 },
    ] })]);
    expect(e.cuentas.a.lineas.map((l) => l.nombre)).toEqual(["Agua con gas", "Otro"]);
    expect(total(e.cuentas.a)).toBe(8000);
  });

  it("el nombre escrito solo vale en «Otro», no en productos del catálogo", () => {
    const e = correr([abrir("a"), op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [{ id: "x1", producto: "rubia", cantidad: 1, nombre: "Gratis" }] })]);
    expect(e.cuentas.a.lineas[0].nombre).toBe("Rubia");
  });

  it("no anota productos sin precio confirmado", () => {
    const e = correr([abrir("a"), anotar("a", "r1", [["licor", 1]])]);
    expect(total(e.cuentas.a)).toBe(0);
  });

  it("reintentar la misma operación no duplica nada", () => {
    const a = abrir("a");
    const r = anotar("a", "r1", [["rubia", 2]]);
    const e = correr([a, r, a, r, r]);
    expect(total(e.cuentas.a)).toBe(8000);
    expect(e.cuentas.a.rondas).toHaveLength(1);
  });

  it("anular deja la línea tachada y la saca del total", () => {
    const e = correr([abrir("a"), anotar("a", "r1", [["rubia", 2], ["negra", 1]]), op({ t: "anular", cuenta: "a", linea: "r1-0" })]);
    expect(total(e.cuentas.a)).toBe(4000);
    expect(e.cuentas.a.lineas[0].anulada).toBeTruthy();
  });

  it("cobrar deja la cuenta cobrada; dos cobros no cobran doble", () => {
    const e = correr([
      abrir("a"), anotar("a", "r1", [["rubia", 2]]),
      op({ t: "cobrar", cuenta: "a", pago: "p1", medio: "nequi" }),
      op({ t: "cobrar", cuenta: "a", pago: "p2", medio: "efectivo" }),
    ]);
    expect(situacion(e.cuentas.a)).toBe("cobrada");
    expect(e.cuentas.a.pagos).toHaveLength(1);
  });

  it("anotar en una cuenta ya cobrada la reabre con saldo pendiente", () => {
    const e = correr([
      abrir("a"), anotar("a", "r1", [["rubia", 2]]),
      op({ t: "cobrar", cuenta: "a", pago: "p1", medio: "efectivo", recibido: 10000 }),
      anotar("a", "r2", [["rubia", 1]]),
    ]);
    expect(situacion(e.cuentas.a)).toBe("abierta");
    expect(e.cuentas.a.reabierta).toBe(true);
    expect(saldo(e.cuentas.a)).toBe(4000);
  });

  it("solo una mesa se puede pasar a comida, y anotar después la saca de la lista de cocina", () => {
    const e = correr([
      abrir("g"), anotar("g", "r1", [["rubia", 1]]),
      op({ t: "cobrar", cuenta: "g", pago: "p1", medio: "comida" }),
      abrir("m", "mesa"), anotar("m", "r2", [["gaseosa", 3]]),
      op({ t: "cobrar", cuenta: "m", pago: "p2", medio: "comida" }),
      op({ t: "comida_cobrada", cuenta: "m", valor: true }),
      anotar("m", "r3", [["agua", 1]]),
    ]);
    expect(situacion(e.cuentas.g)).toBe("abierta");
    expect(e.cuentas.m.comidaCobrada).toBe(false);
    expect(saldo(e.cuentas.m)).toBe(2500);
  });

  it("deshacer un cobro (reabrir) devuelve el saldo", () => {
    const e = correr([abrir("a"), anotar("a", "r1", [["negra", 1]]), op({ t: "cobrar", cuenta: "a", pago: "p", medio: "breve" }), op({ t: "reabrir", cuenta: "a" })]);
    expect(situacion(e.cuentas.a)).toBe("abierta");
    expect(saldo(e.cuentas.a)).toBe(4000);
  });

  it("converge: los pendientes reaplicados sobre lo confirmado dan lo mismo", () => {
    const ops = [abrir("a"), anotar("a", "r1", [["rubia", 2]]), anotar("a", "r2", [["light", 1]]), op({ t: "cobrar", cuenta: "a", pago: "p", medio: "efectivo" })];
    const servidor = correr(ops);
    const celular = [...ops.slice(1), ...ops].reduce((e, o) => aplicar(e, o), correr(ops.slice(0, 2)));
    expect(celular).toEqual(servidor);
  });

  it("«Otro» acepta valores grandes, como $ 90.000", () => {
    const e = correr([abrir("a"), op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [{ id: "x1", producto: "otro", cantidad: 1, precio: 90000, nombre: "Botella de whisky" }] })]);
    expect(total(e.cuentas.a)).toBe(90000);
  });

  it("un petaco son 30 cervezas al precio de cada una", () => {
    const e = correr([abrir("a"), anotar("a", "r1", [["rubia", 30], ["light", 15]])]);
    expect(total(e.cuentas.a)).toBe(30 * 4000 + 15 * 4500);
  });

  it("el administrador crea un producto y se puede anotar con su precio", () => {
    const nuevo = { id: "club-dorada-ab12", nombre: "Club Colombia", corto: "CLUB", categoria: "cerveza", precio: 4500, activo: true, fondo: "#B8892E", texto: "#241206" };
    const e = correr([op({ t: "producto", producto: nuevo }), abrir("a"), anotar("a", "r1", [["club-dorada-ab12", 2]])]);
    expect(total(e.cuentas.a)).toBe(9000);
    expect(catalogo(e).some((p) => p.id === "club-dorada-ab12" && p.activo)).toBe(true);
  });

  it("cambiar un precio no toca lo ya anotado", () => {
    const rubia = { id: "rubia", nombre: "Rubia", corto: "RUBIA", categoria: "cerveza", precio: 5000, activo: true, fondo: "#F2C230", texto: "#241206" };
    const e = correr([abrir("a"), anotar("a", "r1", [["rubia", 1]]), op({ t: "producto", producto: rubia }), anotar("a", "r2", [["rubia", 1]])]);
    expect(e.cuentas.a.lineas.map((l) => l.precio)).toEqual([4000, 5000]);
  });

  it("ocultar un producto lo saca del catálogo para anotar, y la foto conserva los productos", () => {
    const oculto = { id: "negra", nombre: "Negra", corto: "NEGRA", categoria: "cerveza", precio: 4000, activo: false, fondo: "#7A1F1C", texto: "#FFFFFF" };
    const e = correr([op({ t: "producto", producto: oculto })]);
    expect(catalogo(e).find((p) => p.id === "negra")?.activo).toBe(false);
    expect(recortar(e, Date.now()).productos?.negra?.activo).toBe(false);
  });

  it("rechaza productos sin nombre o con precio inválido", () => {
    const e = correr([
      op({ t: "producto", producto: { id: "malo-1", nombre: "", precio: 1000, categoria: "otro", activo: true, fondo: "#000000", texto: "#FFFFFF" } }),
      op({ t: "producto", producto: { id: "malo-2", nombre: "X", precio: -5, categoria: "otro", activo: true, fondo: "#000000", texto: "#FFFFFF" } }),
    ]);
    expect(Object.keys(e.productos ?? {})).toHaveLength(0);
  });

  it("las líneas de un petaco guardan su etiqueta; las sueltas no", () => {
    const pq = { id: "pq-1", tipo: "petaco", mixto: true };
    const e = correr([abrir("a"), op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [
      { id: "x1", producto: "light", cantidad: 15, paquete: pq },
      { id: "x2", producto: "lager", cantidad: 15, paquete: pq },
      { id: "x3", producto: "rubia", cantidad: 2 },
      { id: "x4", producto: "negra", cantidad: 1, paquete: { id: "raro", tipo: "caja", mixto: false } },
    ] })]);
    const [l1, l2, l3, l4] = e.cuentas.a.lineas;
    expect(l1.paquete).toEqual(pq);
    expect(l2.paquete?.id).toBe("pq-1");
    expect(l3.paquete).toBeUndefined();
    expect(l4.paquete).toBeUndefined(); // tipo de paquete desconocido: se anota suelta
    expect(total(e.cuentas.a)).toBe(15 * 4500 + 15 * 4000 + 2 * 4000 + 4000);
  });

  it("cambiar la cantidad de una línea ajusta el total y guarda cuánto era", () => {
    const e = correr([abrir("a"), anotar("a", "r1", [["rubia", 4]]), op({ t: "cantidad", cuenta: "a", linea: "r1-0", cantidad: 3 }), op({ t: "cantidad", cuenta: "a", linea: "r1-0", cantidad: 2 })]);
    expect(total(e.cuentas.a)).toBe(8000);
    expect(e.cuentas.a.lineas[0].editada?.antes).toBe(4);
  });

  it("subir la cantidad de una cuenta cobrada la reabre con saldo", () => {
    const e = correr([abrir("a"), anotar("a", "r1", [["rubia", 2]]), op({ t: "cobrar", cuenta: "a", pago: "p", medio: "nequi" }), op({ t: "cantidad", cuenta: "a", linea: "r1-0", cantidad: 3 })]);
    expect(situacion(e.cuentas.a)).toBe("abierta");
    expect(e.cuentas.a.reabierta).toBe(true);
    expect(saldo(e.cuentas.a)).toBe(4000);
  });

  it("no cambia líneas anuladas ni acepta cantidades inválidas", () => {
    const e = correr([abrir("a"), anotar("a", "r1", [["rubia", 2], ["negra", 1]]), op({ t: "anular", cuenta: "a", linea: "r1-1" }),
      op({ t: "cantidad", cuenta: "a", linea: "r1-1", cantidad: 5 }), op({ t: "cantidad", cuenta: "a", linea: "r1-0", cantidad: 0 })]);
    expect(e.cuentas.a.lineas.map((l) => l.cantidad)).toEqual([2, 1]);
  });

  it("el orden del administrador cambia el orden del catálogo", () => {
    const e = correr([op({ t: "orden", ids: ["negra", "rubia"] })]);
    const ids = catalogo(e).map((p) => p.id);
    expect(ids.slice(0, 2)).toEqual(["negra", "rubia"]);
    expect(ids).toContain("light");
  });

  it("«Otro» marcado como comida se suma aparte; el catálogo nunca es comida", () => {
    const e = correr([abrir("a"), op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [
      { id: "x1", producto: "otro", cantidad: 1, precio: 240000, nombre: "Comida", comida: true },
      { id: "x2", producto: "rubia", cantidad: 2, comida: true },
    ] })]);
    expect(total(e.cuentas.a)).toBe(248000);
    expect(totalComida(e.cuentas.a)).toBe(240000);
  });

  it("se puede marcar y desmarcar como comida algo ya anotado con «Otro»", () => {
    const base = [abrir("a"), op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [{ id: "x1", producto: "otro", cantidad: 1, precio: 240000, nombre: "Comida" }] }), anotar("a", "r2", [["rubia", 1]])];
    const marcada = correr([...base, op({ t: "comida_linea", cuenta: "a", linea: "x1", valor: true }), op({ t: "comida_linea", cuenta: "a", linea: "r2-0", valor: true })]);
    expect(totalComida(marcada.cuentas.a)).toBe(240000);
    const desmarcada = correr([...base, op({ t: "comida_linea", cuenta: "a", linea: "x1", valor: true }), op({ t: "comida_linea", cuenta: "a", linea: "x1", valor: false })]);
    expect(totalComida(desmarcada.cuentas.a)).toBe(0);
  });

  it("en una cuenta de cancha rige el precio de cancha; sin él, el normal", () => {
    const e = correr([
      op({ t: "abrir", cuenta: "k", nombre: "Cancha 1", tipo: "cancha", cancha: "1" }),
      anotar("k", "r1", [["rubia", 2], ["roja", 1], ["gaseosa", 1], ["light", 1]]),
      abrir("g"), anotar("g", "r2", [["rubia", 2], ["roja", 1]]),
    ]);
    expect(total(e.cuentas.k)).toBe(2 * 4500 + 4000 + 3000 + 4500);
    expect(total(e.cuentas.g)).toBe(2 * 4000 + 3500);
  });

  it("el administrador cambia o quita el precio de cancha", () => {
    const rubia = { id: "rubia", nombre: "Rubia", corto: "RUBIA", categoria: "cerveza", precio: 4000, precioCancha: 5000, activo: true, fondo: "#F2C230", texto: "#241206" };
    const sinCancha = { ...rubia, id: "negra", nombre: "Negra", precioCancha: null };
    const e = correr([
      op({ t: "producto", producto: rubia }), op({ t: "producto", producto: sinCancha }),
      op({ t: "abrir", cuenta: "k", nombre: "Cancha 2", tipo: "cancha", cancha: "2" }), anotar("k", "r1", [["rubia", 1], ["negra", 1]]),
    ]);
    expect(e.cuentas.k.lineas.map((l) => l.precio)).toEqual([5000, 4000]);
  });

  it("lo anotado en cancha antes de que existiera el precio de cancha conserva el precio normal", () => {
    const antes = PRECIO_CANCHA_DESDE - 60_000;
    const e = correr([
      { ...op({ t: "abrir", cuenta: "k", nombre: "Cancha 2", tipo: "cancha", cancha: "2" }), en: antes },
      { ...anotar("k", "r1", [["rubia", 11], ["lager", 4]]), en: antes },
      { ...anotar("k", "r2", [["rubia", 1]]), en: PRECIO_CANCHA_DESDE + 60_000 },
    ]);
    expect(e.cuentas.k.lineas.map((l) => l.precio)).toEqual([4000, 4000, 4500]);
  });

  it("el precio fijado por el servidor manda sobre el catálogo", () => {
    const e = correr([abrir("a"), op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [{ id: "x1", producto: "rubia", cantidad: 1, precioFijado: 2800 }] })]);
    expect(total(e.cuentas.a)).toBe(2800);
  });

  it("mecato y «Otro» editados por el administrador siguen siendo de valor libre (su comportamiento lo da el id)", () => {
    const otro = { id: "otro", nombre: "Otra cosa", corto: "＋ OTRA", categoria: "otro", precio: null, activo: true, fondo: "#FFFDF8", texto: "#241206" };
    const mecato = { id: "mecato", nombre: "Mecato", corto: "MECATO", categoria: "otro", precio: null, activo: true, fondo: "#8A4F2E", texto: "#FFFFFF" };
    const e = correr([op({ t: "producto", producto: otro }), op({ t: "producto", producto: mecato }), abrir("a"),
      op({ t: "anotar", cuenta: "a", ronda: "r1", lineas: [{ id: "x1", producto: "otro", cantidad: 1, precio: 7000, nombre: "Picada" }, { id: "x2", producto: "mecato", cantidad: 2, precio: 1500 }] })]);
    expect([e.productos?.otro?.libre, e.productos?.otro?.conNombre, e.productos?.otro?.activo]).toEqual([true, true, true]);
    expect([e.productos?.mecato?.libre, e.productos?.mecato?.conNombre]).toEqual([true, undefined]);
    expect(total(e.cuentas.a)).toBe(7000 + 3000);
    expect(e.cuentas.a.lineas[0].nombre).toBe("Picada");
  });

  it("la foto deja fuera lo cerrado de hace más de 36 horas y conserva lo pendiente", () => {
    const e = correr([
      abrir("cobrada"), anotar("cobrada", "r1", [["rubia", 1]]), op({ t: "cobrar", cuenta: "cobrada", pago: "p1", medio: "efectivo" }),
      abrir("vacia"),
      abrir("debe"), anotar("debe", "r2", [["rubia", 1]]),
      abrir("m", "mesa"), anotar("m", "r3", [["agua", 1]]), op({ t: "cobrar", cuenta: "m", pago: "p2", medio: "comida" }),
    ]);
    const ultima = Math.max(...Object.values(e.cuentas).map((c) => c.ultima));
    expect(Object.keys(recortar(e, ultima + 35 * 3600_000).cuentas).sort()).toEqual(["cobrada", "debe", "m", "vacia"]);
    // Pasadas 36 horas: sigue lo que tiene saldo y lo pasado a comida sin cobrar allá.
    expect(Object.keys(recortar(e, ultima + 37 * 3600_000).cuentas).sort()).toEqual(["debe", "m"]);
  });
});
