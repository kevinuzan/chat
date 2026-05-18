const CACHE_NAME = 'chat-pwa-v1';

const FILES_TO_CACHE = [
  '/index.html',
  '/manifest.json',
  '/src/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/') || event.request.url.includes('socket.io')) {
    return; // Não faz cache de requisições de API ou WebSockets
  }
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

// Recebe a notificação Push do servidor
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Nova Mensagem', body: 'Você tem uma nova mensagem' };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      vibrate: [100, 50, 100],
      data: { url: '/' }
    })
  );
});

// Foca na aba do chat quando o usuário clica na notificação
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});