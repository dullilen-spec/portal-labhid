// Modo sin conexión: guarda lo que ya se visitó. Primero intenta la red para no mostrar
// un estado viejo mientras haya señal; sin señal responde con lo guardado.
const CACHE = "labhid-v8-prueba-v03"; // v03: rediseño; obliga a renovar lo guardado

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: e.request.mode === "navigate" }).then(
          (r) => r || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }),
        ),
      ),
  );
});
