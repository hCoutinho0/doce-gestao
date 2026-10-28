// Service worker do Confeitto no celular: guarda os arquivos estáticos para
// abrir rápido e mostra uma página simples quando não há internet. Dados
// (/api) nunca passam pelo cache: o painel sempre mostra o que está no banco.
const VERSAO = 'confeitto-v1';
const BASE = ['/offline.html', '/assets/brand/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSAO).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(VERSAO).then(async (cache) => {
        const guardado = await cache.match(req);
        const rede = fetch(req)
          .then((resp) => {
            if (resp.ok) cache.put(req, resp.clone());
            return resp;
          })
          .catch(() => guardado);
        return guardado || rede;
      }),
    );
  }
});
