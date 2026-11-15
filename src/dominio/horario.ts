// Horario de acceso de una persona (docs/17 «Accesos de empleados»). El administrador
// decide en qué franjas puede entrar cada empleado: semanales (domingos de 8:00 a. m. a
// 3:00 p. m.) y días especiales (un evento). Fuera de ellas la persona no entra y, si ya
// estaba adentro, sale al terminar la franja. Sin horario: acceso libre, como antes.
//
// Las horas son de Colombia (UTC−5, sin horario de verano). Una franja puede pasar de la
// medianoche (`hasta` mayor que 24:00), para los eventos que terminan de madrugada.

export interface Franja {
  /** Día de la semana: 0 = domingo … 6 = sábado. */
  dia: number;
  /** Minutos desde la medianoche: 480 = 8:00 a. m. */
  desde: number;
  /** Minutos desde la medianoche del mismo día; hasta 2.880 (las 24 h del día siguiente). */
  hasta: number;
}

export interface Especial {
  /** Día del calendario, AAAA-MM-DD (no la jornada de las 5:00 a. m.). */
  fecha: string;
  desde: number;
  hasta: number;
}

export interface Horario {
  semanal: Franja[];
  especiales: Especial[];
}

/** El de los empleados nuevos: domingos de 8:00 a. m. a 3:00 p. m. */
export const HORARIO_EMPLEADO: Horario = { semanal: [{ dia: 0, desde: 8 * 60, hasta: 15 * 60 }], especiales: [] };

const HORA = 3600_000;
const DIA = 24 * HORA;
/** Medianoche de Colombia (05:00 UTC) del día de calendario en que cae `en`. */
const medianoche = (en: number) => Math.floor((en - 5 * HORA) / DIA) * DIA + 5 * HORA;
const fechaDe = (inicioDia: number) => new Date(inicioDia).toISOString().slice(0, 10);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const minutoValido = (x: unknown, max: number): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max;

/** Lo que llega del administrador, limpio; `null` si no es un horario (acceso libre). */
export function normalizarHorario(x: unknown): Horario | null {
  if (!x || typeof x !== "object") return null;
  const h = x as { semanal?: unknown; especiales?: unknown };
  const semanal = (Array.isArray(h.semanal) ? h.semanal : [])
    .filter((f): f is Franja => !!f && typeof f === "object" && Number.isInteger(f.dia) && f.dia >= 0 && f.dia <= 6 && minutoValido(f.desde, 1439) && minutoValido(f.hasta, 2880) && f.hasta > f.desde)
    .map((f) => ({ dia: f.dia, desde: f.desde, hasta: f.hasta }))
    .slice(0, 30);
  const especiales = (Array.isArray(h.especiales) ? h.especiales : [])
    .filter((f): f is Especial => !!f && typeof f === "object" && typeof f.fecha === "string" && FECHA.test(f.fecha) && minutoValido(f.desde, 1439) && minutoValido(f.hasta, 2880) && f.hasta > f.desde)
    .map((f) => ({ fecha: f.fecha, desde: f.desde, hasta: f.hasta }))
    .slice(0, 60);
  return { semanal, especiales };
}

/** Las franjas concretas (inicio y fin en ms) desde el día anterior a `en` hasta `dias` después. */
function ventanas(h: Horario, en: number, dias = 8): [number, number][] {
  const r: [number, number][] = [];
  const hoy = medianoche(en);
  for (let k = -1; k <= dias; k++) {
    const inicio = hoy + k * DIA;
    const dia = new Date(inicio - 5 * HORA).getUTCDay();
    const fecha = fechaDe(inicio);
    for (const f of h.semanal) if (f.dia === dia) r.push([inicio + f.desde * 60_000, inicio + f.hasta * 60_000]);
    for (const f of h.especiales) if (f.fecha === fecha) r.push([inicio + f.desde * 60_000, inicio + f.hasta * 60_000]);
  }
  // Juntas las que se tocan: una franja semanal y un evento seguido son un solo rato.
  r.sort((a, b) => a[0] - b[0]);
  const juntas: [number, number][] = [];
  for (const v of r) {
    const u = juntas[juntas.length - 1];
    if (u && v[0] <= u[1]) u[1] = Math.max(u[1], v[1]);
    else juntas.push([v[0], v[1]]);
  }
  return juntas;
}

/** Si con este horario se puede entrar en `en`. Sin horario, siempre. */
export function dentroDeHorario(h: Horario | null, en: number): boolean {
  if (!h) return true;
  return ventanas(h, en).some(([a, b]) => en >= a && en < b);
}

/** Cuándo termina la franja en curso (ms), o `null` si no hay franja ahora o no hay horario. */
export function finDeFranja(h: Horario | null, en: number): number | null {
  if (!h) return null;
  return ventanas(h, en).find(([a, b]) => en >= a && en < b)?.[1] ?? null;
}

/** La próxima franja que empieza después de `en` (en las próximas 5 semanas), o `null`. */
export function proximaFranja(h: Horario | null, en: number): [number, number] | null {
  if (!h) return null;
  return ventanas(h, en, 35).find(([a]) => a > en) ?? null;
}

const DIAS = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
const DIAS_UNO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** 480 → «8:00 a. m.»; 900 → «3:00 p. m.»; 1500 → «1:00 a. m.» (del día siguiente). */
export function horaMinutos(m: number): string {
  const t = m % 1440;
  const h = Math.floor(t / 60);
  const mm = String(t % 60).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${h < 12 ? "a. m." : "p. m."}`;
}

/** El horario en una frase: «Domingos de 8:00 a. m. a 3:00 p. m.». */
export function describirHorario(h: Horario | null, hoy = ""): string {
  if (!h) return "Sin restricción de horario";
  const partes = [
    ...h.semanal.map((f) => `${DIAS[f.dia]} de ${horaMinutos(f.desde)} a ${horaMinutos(f.hasta)}`),
    ...h.especiales.filter((f) => !hoy || f.fecha >= hoy).map((f) => `el ${f.fecha} de ${horaMinutos(f.desde)} a ${horaMinutos(f.hasta)}`),
  ];
  if (!partes.length) return "Sin acceso (no tiene franjas)";
  const t = partes.join("; ");
  return t[0].toUpperCase() + t.slice(1);
}

/** Para la entrada: por qué no puede entrar y cuándo sí. */
export function mensajeFueraDeHorario(h: Horario | null, en: number): string {
  const p = proximaFranja(h, en);
  if (!p) return "Hoy no tiene acceso a la app. Pídale acceso al administrador.";
  const inicio = p[0];
  const dia = DIAS_UNO[new Date(inicio - 5 * HORA).getUTCDay()];
  const cuando = medianoche(inicio) === medianoche(en) ? "hoy" : medianoche(inicio) === medianoche(en) + DIA ? "mañana" : `el ${dia}`;
  const minutos = Math.round((inicio - medianoche(inicio)) / 60_000);
  return `Fuera de su horario. Puede entrar ${cuando} a las ${horaMinutos(minutos)}`;
}

/** «HH:MM» → minutos; `null` si no sirve. */
export function minutosDe(texto: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[1]) <= 23 && Number(m[2]) <= 59 ? v : null;
}

/** Minutos → «HH:MM» (para los campos de hora). */
export const textoMinutos = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
