/* Servitech - service worker (activo solo en https)

   Estrategia: RED PRIMERO para todo lo propio del sitio.

   Motivo: con "caché primero" (o "stale-while-revalidate") el navegador
   servía el index.html nuevo pero el JavaScript viejo guardado en caché,
   así que la app quedaba una versión por detrás y las mejoras no se
   aplicaban nunca. Comprobado en pruebas: cabecera v0.5 con cloud.js antiguo.

   Si no hay conexión, se usa la copia guardada: la app sigue funcionando
   sin señal. Sube CACHE cada vez que cambies js/css.
*/
var CACHE = 'servitech-v1.1';
var ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/firebase-config.js',
  './js/cloud.js',
  './js/store.js',
  './js/app.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;   // Firebase y CDN: siempre por red

  e.respondWith(
    fetch(req).then(function (res) {
      // Guardamos una copia fresca para poder funcionar sin conexión.
      if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      // Sin conexión: tiramos de lo guardado.
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Sin conexion' });
      });
    })
  );
});
