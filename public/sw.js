// Service Worker: la app abre sin señal. La API nunca se cachea.
// El nombre del caché lo cambia la compilación (vite.config.ts, «versionar-sw») con el
// hash del paquete: cada despliegue estrena caché y borra el anterior.
const CACHE = "barra-v1";
// Lo que puede cambiar sin cambiar de nombre va primero a la red. El manifiesto también:
// servido viejo desde el caché, una app reinstalada quedaba bloqueada en vertical.
const PRIMERO_LA_RED = ["/manifest.webmanifest"];
const BASE = ["/", "/manifest.webmanifest", "/icono-192.png", "/icono-512.png"];
// Cuánto se espera a la red para abrir la app antes de usar la copia (RNF-04). Con Wi-Fi
// «conectado sin internet» la red no falla: se queda colgada, y sin este límite la app no
// abría (docs/13, punto 1).
const ESPERA_RED = 1500;

/** Archivos de /assets que pide una página. */
const archivosDe = (html) => [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);

/**
 * Guarda la página nueva solo después de tener sus archivos: así la copia nunca apunta a
 * archivos que no están (y la app abre sin señal con la versión completa).
 */
async function guardarPagina(respuesta) {
  const html = await respuesta.text();
  const c = await caches.open(CACHE);
  await c.addAll(archivosDe(html));
  await c.put("/", new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }));
}

self.addEventListener("install", (e) => {
  // Además de lo básico, guarda los archivos que pide la página, para abrir sin señal desde ya.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(BASE);
    const html = await (await fetch("/")).text();
    await c.addAll(archivosDe(html));
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
  // La página del cliente del QR (/m/…, docs/20) no es de la app del personal: va a la red.
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/m/") || url.pathname.startsWith("/cliente")) return;

  // Páginas: primero la red (para recibir versiones nuevas), pero si no responde en
  // ESPERA_RED, la copia. La red sigue en segundo plano y deja lista la versión nueva.
  if (e.request.mode === "navigate") {
    const red = fetch(e.request);
    e.waitUntil(red.then((r) => (r.ok ? guardarPagina(r.clone()) : undefined)).catch(() => {}));
    e.respondWith((async () => {
      const copia = await caches.match("/");
      if (!copia) return red; // primera vez: no hay copia, se espera a la red
      const limite = new Promise((listo) => setTimeout(() => listo(copia), ESPERA_RED));
      try {
        const r = await Promise.race([red, limite]);
        return r.ok || r === copia ? r : copia;
      } catch {
        return copia; // sin señal: la red falló rápido
      }
    })());
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

// ── Avisos con la app cerrada (docs/18 fase 4) ─────────────────────────
// El Worker manda el aviso cifrado; aquí se muestra. Con la app a la vista no se muestra:
// ya suena el timbre (salvo el aviso de prueba, que se pide desde la app abierta).
self.addEventListener("push", (e) => {
  let a = {};
  try { a = e.data ? e.data.json() : {}; } catch { /* aviso sin datos */ }
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (a.etiqueta !== "prueba" && ventanas.some((v) => v.visibilityState === "visible")) return;
    await self.registration.showNotification(a.titulo || "Barra del Gorgojo", {
      body: a.cuerpo || "",
      tag: a.etiqueta || "aviso",
      renotify: true,
      icon: "/icono-192.png",
      vibrate: [400, 150, 400, 150, 400],
      data: { ir: a.ir || "despacho" },
    });
  })());
});

// Tocar el aviso abre la app en «Despachar» (o la trae al frente si ya estaba abierta).
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const ir = (e.notification.data && e.notification.data.ir) || "despacho";
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const v = ventanas.find((c) => new URL(c.url).origin === location.origin);
    if (v) {
      await v.focus();
      v.postMessage({ tipo: "ir", ir });
      return;
    }
    await self.clients.openWindow(`/?ir=${encodeURIComponent(ir)}`);
  })());
});
