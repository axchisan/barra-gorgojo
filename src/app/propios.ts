// Las líneas anotadas desde ESTE aparato (2026-11-15). Quien pide bebidas a la barra desde
// su celular no necesita que le suene su propio pedido aunque también tenga la barra: el
// aviso es para los demás. Se cuenta por aparato y no por persona, para que la tablet de
// la barra sí suene aunque esté abierta con el mismo nombre de quien pidió.
const LLAVE = "lineas-propias";
const MAXIMO = 400;

let cache: Set<string> | null = null;

function leer(): Set<string> {
  if (cache) return cache;
  try { cache = new Set(JSON.parse(localStorage.getItem(LLAVE) ?? "[]") as string[]); } catch { cache = new Set(); }
  return cache;
}

/** Recuerda que estas líneas se anotaron aquí. */
export function marcarPropias(ids: string[]) {
  if (!ids.length) return;
  const s = leer();
  for (const id of ids) s.add(id);
  // Solo las últimas: un pedido viejo ya no está por despachar.
  const lista = [...s].slice(-MAXIMO);
  cache = new Set(lista);
  try { localStorage.setItem(LLAVE, JSON.stringify(lista)); } catch { /* sin almacenamiento */ }
}

export const esPropia = (id: string) => leer().has(id);
