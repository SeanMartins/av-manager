importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDxxvnjtKdybQStd0yUT8xKE0MBgwYPZTo",
  authDomain: "av-manager-41c40.firebaseapp.com",
  projectId: "av-manager-41c40",
  storageBucket: "av-manager-41c40.firebasestorage.app",
  messagingSenderId: "1047072296195",
  appId: "1:1047072296195:web:d220ed9c196b185d016d36"
});

const messaging = firebase.messaging();

// Gestisci notifiche in background
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  const data = payload.data || {};
  
  // Determina l'URL di destinazione in base al tipo
  let url = '/';
  if (data.type === 'chat') url = '/?page=chat';
  else if (data.type === 'forum') url = '/?page=forum';
  else if (data.type === 'agenda') url = '/?page=agenda';

  self.registration.showNotification(title || 'MMG Logistics', {
    body: body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url },
    vibrate: [200, 100, 200]
  });
});

// Click sulla notifica — naviga alla pagina giusta
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Se l'app è già aperta, portala in primo piano e naviga
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', page: url.split('page=')[1] || 'presenze' });
          return client.focus();
        }
      }
      // Altrimenti apri una nuova finestra
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
