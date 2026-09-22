/* Servitech - service worker (activo solo en https)
   Estrategia:
     - Navegacion (abrir la app): red primero, con respaldo en cache
       (asi el celular recibe las mejoras al recargar)
     - Resto de archivos: se sirve la copia guardada y se actualiza
       en segundo plano (rapido y sigue funcionando sin conexion)
   Sube CACHE cada vez que cambies js/css para forzar la actualizacion.
*/
var CACHE = 'servitech-v0.6';
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
  if (url.origin !== location.origin) return;   // Firebase/CDN: siempre por red

  // Navegacion: red primero; si no hay conexion, la copia guardada.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // Otros archivos: copia guardada al instante + refresco en segundo plano.
  e.respondWith(
    caches.match(req).then(function (hit) {
      var red = fetch(req).then(function (res) {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'default')) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || red;
    })
  );
});
