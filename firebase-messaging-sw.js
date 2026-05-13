importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyDxxvnjtKdybQStd0yUT8xKE0MBgwYPZTo",
  authDomain:        "av-manager-41c40.firebaseapp.com",
  projectId:         "av-manager-41c40",
  storageBucket:     "av-manager-41c40.firebasestorage.app",
  messagingSenderId: "1047072296195",
  appId:             "1:1047072296195:web:d220ed9c196b185d016d36"
});

const messaging = firebase.messaging();

// Gestisci notifiche in background (app chiusa)
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: payload.data,
    actions: [{ action: 'open', title: 'Apri app' }]
  });
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('https://av-manager-omega.vercel.app'));
});
