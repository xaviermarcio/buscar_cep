/**
 * CEP_ — Service Worker
 * Estratégia: Cache-first para assets estáticos,
 *             Network-first para chamadas à API ViaCEP.
 */

const CACHE_NAME   = 'cep-v2.0';
const CACHE_STATIC = 'cep-static-v2.0';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/css/style.css',
  '/src/js/cep.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap'
];

/* ── INSTALL ────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* ── ACTIVATE ───────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CACHE_STATIC)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── FETCH ──────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  /* API ViaCEP → Network-first, fallback offline */
  if (url.hostname === 'viacep.com.br') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached || new Response(
              JSON.stringify({ erro: 'offline' }),
              { headers: { 'Content-Type': 'application/json' } }
            )
          )
        )
    );
    return;
  }

  /* Assets estáticos → Cache-first */
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});

/* ── MENSAGEM SKIP_WAITING ──────────────────── */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
