const CACHE = 'av-v3';
const ASSETS = ['/', '/index.html', '/manifest.json'];

// ── INSTALL: pre-cache assets ──────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting()) // attiva subito senza aspettare
  );
});

// ── ACTIVATE: elimina cache vecchie ───────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()) // prende controllo di tutte le tab aperte
  );
});

// ── FETCH: network-first per HTML, cache-first per resto ──
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Per index.html usa sempre network-first (per ricevere aggiornamenti)
  if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Per tutto il resto: cache-first con fallback network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// ── AUTO-UPDATE ogni 30 minuti ─────────────────────
// Controlla se c'è una nuova versione del SW e la attiva
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// Periodico check: invia messaggio a tutti i client ogni 30 min
const CHECK_INTERVAL = 30 * 60 * 1000; // 30 minuti in ms

async function checkForUpdates() {
  // Invalida la cache di index.html per forzare il refetch
  const cache = await caches.open(CACHE);
  await cache.delete('/');
  await cache.delete('/index.html');

  // Notifica tutti i client connessi
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => {
    client.postMessage({ type: 'UPDATE_AVAILABLE' });
  });
}

// Avvia il timer dopo l'attivazione
self.addEventListener('activate', () => {
  setInterval(checkForUpdates, CHECK_INTERVAL);
});

