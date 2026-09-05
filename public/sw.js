// Minimal service worker just for Web Push — no offline caching, no
// asset interception. Its only job is to show a notification when a
// push arrives and to focus/open the dashboard when it's tapped.
self.addEventListener('push', (event) => {
  let data = { title: 'Doce Gestão', body: 'Você tem tarefas pendentes.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Non-JSON payload — keep the default text.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/favicon.svg',
      tag: 'doce-gestao-tarefas',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes('/dashboard') && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow('/dashboard');
        }
      }),
  );
});
