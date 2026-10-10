// DOGTAG Revision offline service worker. Bump VERSION when you change any app file.
const VERSION = "v5";
const APP = "dogtag-app-" + VERSION;
const EXTERNAL = "dogtag-external";
const SHELL = [
  "./", "./index.html", "./config.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png", "./icons/favicon-32.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("dogtag-app-") && k !== APP).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve from cache straight away, refresh the cached copy in the background
function staleWhileRevalidate(cacheName, req) {
  return caches.open(cacheName).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Fonts and the Firebase sync library: keep a copy so the app opens offline
  if (["fonts.googleapis.com", "fonts.gstatic.com", "www.gstatic.com"].includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(EXTERNAL, req));
    return;
  }
  if (url.origin !== location.origin) return;   // live sync traffic goes straight to the network

  // The page itself: try the network (quick timeout) so updates arrive, fall back to the saved copy offline
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const c = await caches.open(APP);
      try {
        const r = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(no, 3000))]);
        if (r.ok) c.put("./index.html", r.clone());
        return r;
      } catch {
        return (await c.match("./index.html")) || (await c.match("./")) || Response.error();
      }
    })());
    return;
  }

  // App files (config, icons, manifest)
  e.respondWith(staleWhileRevalidate(APP, req));
});
