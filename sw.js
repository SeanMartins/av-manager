// ── Cambia questo numero ad ogni deploy per forzare aggiornamento immediato ──
const VERSION = 'mmg-v' + Date.now();
const CACHE = VERSION;
 
self.addEventListener('install', e => {
  // Installa e attiva SUBITO senza aspettare che le vecchie tab si chiudano
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['/', '/index.html', '/manifest.json', '/logo.png']))
  );
});
 
self.addEventListener('activate', e => {
  e.waitUntil(
    // Elimina tutte le cache vecchie
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()) // Prende controllo di tutte le tab aperte immediatamente
      .then(() => {
        // Forza reload su tutti i client aperti
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then(clients => clients.forEach(client => client.navigate(client.url)));
      })
  );
});
 
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isLocal = url.hostname === self.location.hostname;
 
  // Firebase, CDN esterni — sempre da rete, mai caching
  if (!isLocal) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }
 
  // index.html — SEMPRE da rete (così prende sempre la versione aggiornata)
  if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
 
  // Altri file locali (icone, manifest) — cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached ||
      fetch(e.request).then(res => {
        if (res && res.status === 200)
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => new Response('', { status: 503 }))
    )
  );
});
 
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
