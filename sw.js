// Service worker: stale-while-revalidate, aplikasi tetap jalan offline.
const CACHE = 'sakuin-v2';
const CORE = ['./', 'index.html', 'css/style.css', 'js/app.js', 'manifest.webmanifest',
  'assets/logo.svg', 'assets/preset-konser.svg', 'assets/preset-gadget.svg',
  'assets/preset-liburan.svg', 'assets/preset-kendaraan.svg', 'assets/icon-192.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => {
    const net = fetch(e.request).then(r => {
      if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
      return r;
    }).catch(() => hit || caches.match('index.html'));
    return hit || net;
  }));
});
