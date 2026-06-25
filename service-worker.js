const CACHE_NAME = 'g7-app-v72';
const APP_SHELL = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => null))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({
      error: 'offline',
      message: 'Sem conexão para atualizar dados agora.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    })));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone)).catch(() => null);
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => null);
        }
        return response;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});


// Firebase Cloud Messaging — background notifications.
try {
  importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

  firebase.initializeApp({
    apiKey: 'AIzaSyDtHxqqMm_4In7C4RdQMyzbxZxrQsF6Ygo',
    authDomain: 'futapp-8bbde.firebaseapp.com',
    databaseURL: 'https://futapp-8bbde-default-rtdb.firebaseio.com',
    projectId: 'futapp-8bbde',
    storageBucket: 'futapp-8bbde.firebasestorage.app',
    messagingSenderId: '210989129575',
    appId: '1:210989129575:web:586e89194a7210264e59c2',
    measurementId: 'G-0NPP3YZ2MK',
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || payload?.data?.title || 'G7 APP';
    const options = {
      body: payload?.notification?.body || payload?.data?.body || 'Nova atualização disponível.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: {
        url: payload?.fcmOptions?.link || payload?.data?.url || '/',
      },
    };

    self.registration.showNotification(title, options);
  });
} catch (error) {
  console.warn('FCM não iniciado no service worker:', error);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const hadWindowToFocus = clientsArr.some((windowClient) => {
        if (windowClient.url.includes(self.location.origin)) {
          windowClient.focus();
          windowClient.navigate(targetUrl);
          return true;
        }
        return false;
      });

      if (!hadWindowToFocus && self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return null;
    })
  );
});

