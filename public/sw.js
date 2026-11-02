// Service Worker: la app abre sin señal. La API nunca se cachea.
// El nombre del caché lo cambia la compilación (vite.config.ts, «versionar-sw») con el
// hash del paquete: cada despliegue estrena caché y borra el anterior.
const CACHE = "barra-v1";
// Lo que puede cambiar sin cambiar de nombre va primero a la red. El manifiesto también:
// servido viejo desde el caché, una app reinstalada quedaba bloqueada en vertical.
const PRIMERO_LA_RED = ["/manifest.webmanifest"];
const BASE = ["/", "/manifest.webmanifest", "/icono-192.png", "/icono-512.png"];

self.addEventListener("install", (e) => {
  // Además de lo básico, guarda los archivos que pide la página, para abrir sin señal desde ya.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(BASE);
    const html = await (await fetch("/")).text();
    const archivos = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    await c.addAll(archivos);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // Páginas: primero la red (para recibir versiones nuevas), si no hay señal, la copia.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put("/", copia)); return r; })
        .catch(() => caches.match("/")),
    );
    return;
  }
  if (PRIMERO_LA_RED.includes(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then((r) => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); } return r; })
        .catch(() => caches.match(e.request)),
    );
    return;
  }
  // Archivos con hash en el nombre: primero la copia.
  e.respondWith(
    caches.match(e.request).then((guardado) =>
      guardado ||
      fetch(e.request).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
        return r;
      }),
    ),
  );
});
