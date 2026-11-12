/* Voice Timer service worker: keeps a copy of every file on the device so the app works offline. */
var CACHE = 'voice-timer-v1';
var FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'audio/n1.wav',
  'audio/n2.wav',
  'audio/n3.wav',
  'audio/n4.wav',
  'audio/n5.wav',
  'audio/n6.wav',
  'audio/n7.wav',
  'audio/n8.wav',
  'audio/n9.wav',
  'audio/n10.wav',
  'audio/n11.wav',
  'audio/n12.wav',
  'audio/n13.wav',
  'audio/n14.wav',
  'audio/n15.wav',
  'audio/n20.wav',
  'audio/n30.wav',
  'audio/n40.wav',
  'audio/n50.wav',
  'audio/n60.wav',
  'audio/n70.wav',
  'audio/n80.wav',
  'audio/n90.wav',
  'audio/s55.wav',
  'audio/s60.wav',
  'audio/s65.wav',
  'audio/s70.wav',
  'audio/s75.wav',
  'audio/s80.wav',
  'audio/s85.wav',
  'audio/s90.wav',
  'audio/done.wav'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE) return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Answer from the saved copy straight away (works offline), and quietly fetch a
// fresh copy in the background so an updated app shows up the next time it is opened.
self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(request, { ignoreSearch: true }).then(function (cached) {
        var refresh = fetch(request).then(function (response) {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        });
        if (cached) {
          event.waitUntil(refresh.catch(function () {}));
          return cached;
        }
        return refresh.catch(function () {
          if (request.mode === 'navigate') return cache.match('index.html');
          return Response.error();
        });
      });
    })
  );
});
