// Nombre del caché (cámbialo SIEMPRE si actualizas los archivos principales)
const CACHE_NAME = 'ctrl-paq-cache-v8'; // Incrementado para aplicar cambios

// "App Shell" - Archivos necesarios para que la app funcione offline
// IMPORTANTE: Usar rutas RELATIVAS para GitHub Pages
const urlsToCache = [
  './',
  './index.html',
  './main.html',
  './styles.css',
  './app.js',
  './sql-lite.js',
  './supabase-client.js',
  './zxing.min.js',
  './icon-192.svg',
  './icon-512.svg',
  './manifest.webmanifest',
];

// URLs que siempre deben cargarse desde la red (Librerías externas)
// IMPORTANTE: Agregar CDN de Supabase para que funcione en móviles
const externalUrls = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];


// Evento "install": se dispara cuando el SW se instala
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  // GUARANTEE: Se espera a que TODOS los archivos esenciales (incluyendo el CDN) se guarden en caché.
  // Esto es la base para el funcionamiento offline inicial.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Abriendo caché y guardando app shell');
        return cache.addAll(urlsToCache.concat(externalUrls));
      })
      .then(() => self.skipWaiting()) // Forzar al SW a activarse
      .catch(err => console.error('[SW] Fallo crítico al precachear:', err))
  );
});

// Evento "activate": se dispara cuando el SW se activa (limpia cachés viejos)
self.addEventListener('activate', event => {
  console.log('[SW] Activado.');
  // GUARANTEE: Se borran cachés antiguos para ahorrar espacio.
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          // Borrar todos los cachés que no sean el actual
          return cacheName.startsWith('ctrl-paq-cache-') && cacheName !== CACHE_NAME;
        }).map(cacheName => {
          console.log(`[SW] Borrando caché antiguo: ${cacheName}`);
          return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim()) // Tomar control inmediato de las páginas
  );
});

// Estrategia: Stale While Revalidate para archivos locales
// Sirve el caché inmediatamente y actualiza el caché en segundo plano.
function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then(cache => {
    return cache.match(request).then(cachedResponse => {
      // 1. Siempre devuelve la versión en caché inmediatamente si existe.
      // ESTO ES LO QUE GARANTIZA EL OFFLINE.
      const networkFetch = fetch(request).then(response => {
        // Almacena la nueva versión en caché para la próxima vez
        if (response && response.status === 200 && request.method === 'GET') {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(error => {
        console.error('[SW] Fallo al revalidar desde la red:', error, request.url);
        throw error;
      });

      // 2. Si hay una respuesta en caché, la devuelve de inmediato.
      // Si no hay caché, espera la respuesta de red (o falla si está offline).
      return cachedResponse || networkFetch;
    });
  });
}

// Evento "fetch": se dispara cada vez que la app pide un recurso
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // ★★★ CAMBIO: Ahora todos los archivos de la app son locales, usamos siempre Stale While Revalidate ★★★
  const isLocalFile = url.origin === location.origin && urlsToCache.some(u => url.pathname.endsWith(u.replace('/', '')));
  const isExternalLibrary = externalUrls.includes(event.request.url);

  if (event.request.method !== 'GET') {
    return;
  }

  // 1. Archivos de la aplicación - Usar Stale While Revalidate
  if (isLocalFile || isExternalLibrary) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // 2. Otros (Imágenes dinámicas, etc.) - Solo red con fallback a caché
  event.respondWith(fetch(event.request).catch(error => {
    console.error('[SW] Fallo de red:', error, event.request.url);
    return caches.match(event.request);
  }));
});

