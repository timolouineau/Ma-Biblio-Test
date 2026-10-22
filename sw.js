/* Service worker de MaBiblio : rend l'appli installable et permet de l'ouvrir sans réseau.

   RÈGLE D'OR : la page elle-même (index.html, config.js…) vient TOUJOURS d'Internet quand il y en a.
   Personne ne peut donc rester bloqué sur une ancienne version. Le cache ne sert qu'en secours, hors ligne.
   Les données (Firebase) et les recherches (TMDB, Google Livres, Deezer…) ne passent JAMAIS par ce cache. */
const VERSION = 'mabiblio-v1';
const SHELL = ['./', './index.html', './config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
// Fichiers externes qui ne changent jamais (versions figées) : servis depuis le cache une fois téléchargés
const IMMUTABLE = [/^https:\/\/www\.gstatic\.com\/firebasejs\/\d+\.\d+\.\d+\//, /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/\d/, /^https:\/\/fonts\.gstatic\.com\//];
// Fichiers externes qui peuvent évoluer : Internet d'abord, cache en secours
const NETWORK_FIRST = [/^https:\/\/cdn\.tailwindcss\.com\/?/, /^https:\/\/fonts\.googleapis\.com\/css2/];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(VERSION).then(cache => Promise.all(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)))));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const networkFirst = async (request) => {
    const cache = await caches.open(VERSION);
    try {
        const fresh = await fetch(request, request.mode === 'navigate' ? { cache: 'no-store' } : undefined);
        if (fresh && (fresh.ok || fresh.type === 'opaque')) cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
    } catch (e) {
        const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
        if (cached) return cached;
        if (request.mode === 'navigate') { const shell = await cache.match('./index.html') || await cache.match('./'); if (shell) return shell; }
        throw e;
    }
};
const cacheFirst = async (request) => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(request);
    if (cached) return cached;
    const fresh = await fetch(request);
    if (fresh && (fresh.ok || fresh.type === 'opaque')) cache.put(request, fresh.clone()).catch(() => {});
    return fresh;
};

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = req.url;
    const sameOrigin = url.startsWith(self.location.origin);
    if (sameOrigin) {
        // Seulement les fichiers de l'appli elle-même (pas les éventuelles autres pages du site)
        event.respondWith(networkFirst(req));
        return;
    }
    if (IMMUTABLE.some(r => r.test(url))) { event.respondWith(cacheFirst(req)); return; }
    if (NETWORK_FIRST.some(r => r.test(url))) { event.respondWith(networkFirst(req)); return; }
    // Tout le reste (Firebase, recherches, affiches…) : le navigateur s'en occupe normalement
});
