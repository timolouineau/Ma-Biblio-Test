/* Service worker de MaBiblio : rend l'appli installable et permet de l'ouvrir sans réseau.

   RÈGLE D'OR : la page elle-même (index.html, config.js…) vient TOUJOURS d'Internet quand il y en a.
   Personne ne peut donc rester bloqué sur une ancienne version. Le cache ne sert qu'en secours, hors ligne.
   Les données (Firebase) et les recherches (TMDB, Google Livres, Deezer…) ne passent JAMAIS par ce cache. */
const VERSION = 'mabiblio-v3';
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

/* --- Notifications reçues sur le téléphone ---
   Le programme d'envoi (functions/index.js) transmet { title, body, url, tag } dans « data ».
   Chaque message reçu est TOUJOURS affiché (obligatoire sur iPhone). */
self.addEventListener('push', (event) => {
    let d = {};
    try {
        const j = event.data ? event.data.json() : {};
        d = (j && (j.data || j.notification)) || j || {};
    } catch (e) {
        try { d = { body: event.data ? event.data.text() : '' }; } catch (err) { d = {}; }
    }
    const title = String(d.title || 'MaBiblio').slice(0, 120);
    const body = String(d.body || 'Nouvelle activité').slice(0, 240);
    const url = /^\.\/\?notif=[A-Za-z0-9_-]{1,64}$/.test(String(d.url || '')) ? d.url : './';
    // Pastille rouge sur l'icône de l'appli : nombre de notifications non lues
    const count = parseInt(d.badge, 10);
    if (Number.isFinite(count) && count > 0 && self.navigator && self.navigator.setAppBadge) self.navigator.setAppBadge(Math.min(count, 99)).catch(() => {});
    event.waitUntil(self.registration.showNotification(title, {
        body,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: String(d.tag || '').slice(0, 64) || undefined,
        data: { url }
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || './';
    const m = url.match(/notif=([A-Za-z0-9_-]{1,64})/);
    event.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const win = wins.find(w => w.url.startsWith(self.registration.scope));
        if (win) {
            await win.focus();
            if (m) win.postMessage({ type: 'open-notif', notifId: m[1] });
            return;
        }
        await self.clients.openWindow(new URL(url, self.registration.scope).href);
    })());
});
