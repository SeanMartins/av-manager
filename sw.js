// ── Bump VERSION on every deploy → forces immediate update on all devices ──
const VERSION = 'av-v20260508-b';
const CACHE   = VERSION;
const ASSETS  = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({type:'window'}).then(clients => {
        clients.forEach(c => c.navigate(c.url));
      }))
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isLocal = url.hostname === self.location.hostname || url.hostname === 'localhost';
  const isHTML  = url.pathname === '/' || url.pathname.endsWith('.html');

  // External (Firebase, fonts, CDN) — pass through, don't cache
  if (!isLocal) {
    e.respondWith(fetch(e.request).catch(() => new Response('',{status:503})));
    return;
  }
  // HTML — network first (always fresh)
  if (isHTML) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200)
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }
  // Local assets — cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached ||
      fetch(e.request).then(res => {
        if (res && res.status === 200)
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match('/index.html'))
    )
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
