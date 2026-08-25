// Personal CFO — service worker
// This only works when the app is served from a real origin (GitHub Pages).
// Registration is a no-op inside the claude.ai Artifact preview, since that
// page runs in a sandboxed iframe where the browser blocks service worker
// registration outright — that's the platform's own security boundary, not
// something this file can or should work around.
//
// v2: the page (index.html) is fetched network-first, falling back to cache
// only when offline. v1 cached it cache-first, so once the shell was cached
// once, every future edit to index.html kept being masked by the stale copy
// — the exact bug this fixed: a real fix shipped to index.html but nobody
// ever saw it because the service worker never stopped serving the old one.
// Bumping this cache name is also what makes the browser notice sw.js
// itself changed and actually install this new version at all.
const CACHE = "personal-cfo-v2";
const SHELL = ["./", "./index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Page navigations: always try the network first so an update is visible
  // immediately; only fall back to the cached shell when truly offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html", { cacheName: CACHE }))
    );
    return;
  }

  // Everything else (icons, manifest): cache-first, refresh in the background.
  event.respondWith(
    caches.match(event.request, { cacheName: CACHE }).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
