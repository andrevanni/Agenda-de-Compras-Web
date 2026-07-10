const CACHE = 'agenda-compras-v68';

// Assets locais (mesmo domínio): precache obrigatório e atômico.
const LOCAL_ASSETS = [
  '/',
  '/index.html',
  '/instalar.html',
  '/styles.css',
  '/script_state.js',
  '/script_utils.js',
  '/script_render.js',
  '/script_forms.js',
  '/script_data.js',
  '/script_main.js',
  '/script_eficiencia.js',
  '/script_atividades.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Assets de CDN externa: best-effort. NUNCA podem derrubar a instalação —
// se a CDN falhar (comum no Safari), a versão nova ainda instala e ativa.
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(LOCAL_ASSETS)
        .then(() => Promise.allSettled(CDN_ASSETS.map(u => cache.add(u)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// NETWORK-FIRST: online sempre pega a versão mais nova; o cache é só fallback
// offline. Elimina o estado "Frankenstein" (mistura de versões presas no cache)
// que o cache-first causava quando uma atualização não ativava.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Não intercepta chamadas de API / Supabase (auth e dados sempre direto à rede)
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();   // clone SÍNCRONO antes de qualquer await
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))   // sem rede → serve do cache
  );
});
