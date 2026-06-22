const CACHE_NAME = "mis-gastos-v1";
const SHELL_FILES = [
  "/", "/index.html", "/css/styles.css", "/js/app.js", "/js/api.js", "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

// Network-first para /api/, cache-first para el resto (shell estatico).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return; // nunca cachear la API

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
