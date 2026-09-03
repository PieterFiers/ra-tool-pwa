// RA Tool Service Worker — offline cache met update-strategie
//
// Eigen app-bestanden (HTML/JS/CSS/manifest): network-first met een korte
// timeout, zodat een nieuwe versie meteen wordt opgehaald zodra er netwerk
// is, met de cache als snelle offline-terugval. Voorheen was alles
// cache-first, waardoor een oude versie kon blijven hangen tot zowel de
// cachenaam wijzigde als alle vensters gesloten waren.
//
// CDN-libraries (xlsx/jszip): cache-first — die URL's zijn gepind op een
// exacte versie en veranderen dus nooit.
const CACHE = 'ra-tool-v4';
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data.js',
  './manifest.json'
];
const CDN_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];
const ASSETS = [...APP_FILES, ...CDN_LIBS];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function putInCache(request, response) {
  if (response && response.status === 200) {
    caches.open(CACHE).then(c => c.put(request, response.clone()));
  }
  return response;
}

function networkFirst(request) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error('netwerk-timeout')), NETWORK_TIMEOUT_MS))
  ])
    .then(res => putInCache(request, res))
    .catch(() => caches.match(request));
}

function cacheFirst(request) {
  return caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(res => putInCache(request, res));
  });
}

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // API-verkeer nooit onderscheppen, dat heeft altijd live netwerk nodig.
  if (url.includes('api.anthropic.com')) return;

  const sameOrigin = url.startsWith(self.location.origin);
  e.respondWith(sameOrigin ? networkFirst(e.request) : cacheFirst(e.request));
});
