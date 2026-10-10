// DOGTAG Revision offline service worker. Bump VERSION when you change any app file.
const VERSION = "v3";
const APP = "dogtag-app-" + VERSION;
const FONTS = "dogtag-fonts";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
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

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts: serve from cache, refresh in the background
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

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

  // Icons, manifest etc: cache first
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) caches.open(APP).then(c => c.put(req, r.clone()));
    return r;
  })));
});
