const CACHE = 'cancha-v14';
const FILES = ['./', './index.html', './styles.css', './app.js', './scoring.js', './sw.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(FILES.map(async file => {
    const url = new URL(file, self.registration.scope);
    const response = await fetch(`${url.href}?v=${CACHE}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`No se pudo guardar ${file} para uso sin conexión.`);
    await cache.put(url.href, response);
  }))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
