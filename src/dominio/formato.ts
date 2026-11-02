import type { Cuenta } from "./estado";

const miles = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** «$ 42.500», con espacio duro: el signo y la cifra nunca quedan en renglones distintos. */
export const pesos = (n: number) => `$\u00A0${miles.format(n)}`;

const hora = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" });
export const horaDe = (en: number) => hora.format(en);

export function haceCuanto(en: number, ahora = Date.now()): string {
  const min = Math.floor((ahora - en) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

/** En el local, cada ronda es un «chico» en las canchas y una «pedida» en lo demás. */
export const palabraRonda = (c?: Pick<Cuenta, "tipo">) => (c?.tipo === "cancha" ? "chico" : "pedida");

export const nombreCancha = (c: string) => (c === "pequena" ? "Pequeña" : c);
