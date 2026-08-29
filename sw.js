/* Prompter Cero — service worker
   Regla de oro: la pagina SIEMPRE intenta traer la version nueva primero.
   El cache es solo la red de seguridad para cuando no hay senal.
   Asi nunca te queda pegada una version vieja en el telefono. */

var CACHE = "prompter-cero-v8";
var ESENCIALES = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./guiones.js",
  "./grabador-disco.js",
  "./prueba.html",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (ev) {
  self.skipWaiting();
  ev.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(ESENCIALES).catch(function () { /* si falla uno, seguimos igual */ });
    })
  );
});

self.addEventListener("activate", function (ev) {
  ev.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(
        nombres.map(function (n) {
          if (n !== CACHE) return caches.delete(n);
        })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (ev) {
  var req = ev.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // no deberia haber nada de afuera

  /* Red primero para TODO lo que es la app: la pagina, el codigo y los estilos.
     Antes solo la pagina venia de la red y el app.js salia del cache, asi que un
     arreglo podia no llegar NUNCA al telefono aunque el HTML fuera nuevo.
     (Paso de verdad: el commit 1930813 cambio app.js y no subio la version del
     cache.) Solo los iconos y el manifiesto, que no cambian, van del cache. */
  var esApp = req.mode === "navigate" ||
              /\.(html|js|css)$/.test(url.pathname) ||
              url.pathname.endsWith("/");

  if (esApp) {
    // red primero: siempre la version mas nueva
    ev.respondWith(
      fetch(req).then(function (res) {
        var copia = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match("./index.html"); });
      })
    );
    return;
  }

  // iconos y manifiesto: cache primero, que casi nunca cambian
  ev.respondWith(
    caches.match(req).then(function (r) {
      return r || fetch(req).then(function (res) {
        var copia = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); });
        return res;
      });
    })
  );
});
