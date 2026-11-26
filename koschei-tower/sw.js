// Koschei's Tower service worker: network-first (new builds arrive whenever there's signal), cache fallback for offline play.
const CACHE = 'koschei-tower-v1';
const SHELL = ['./', 'index.html', 'model.js', 'app.js', 'assets/manifest.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  e.respondWith(fetch(req).then((res) => { if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then((m) => m || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
