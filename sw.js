const CACHE_NAME = 'club-shell-dev';
const PRECACHE = [];
const NAVIGATION_TIMEOUT = 3500;
const scopeOrigin = self.location.origin;
const publicAssets = new Set(PRECACHE.map(path => new URL(path, scopeOrigin).href));

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith('club-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

async function navigation(request) {
    const cache = await caches.open(CACHE_NAME);
    let timer;
    const network = fetch(request).then(response => response.ok ? response : null).catch(() => null);
    try {
        const response = await Promise.race([network, new Promise(resolve => { timer = setTimeout(() => resolve(null), NAVIGATION_TIMEOUT); })]);
        if (response) return response;
        // The install is atomic: this HTML always belongs to the cached bundle and CSS.
        const saved = await cache.match('/index.html');
        if (saved) return saved;
        return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Интеллигенция</title><h1>Нет соединения</h1><p>Проверь интернет и открой приложение ещё раз</p><button onclick="location.reload()">Повторить</button>', {
            status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    } finally { clearTimeout(timer); }
}

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    // Never retain APIs, Telegram credentials, private responses, map tiles or external resources.
    if (request.method !== 'GET' || url.origin !== scopeOrigin || url.pathname.startsWith('/api/')) return;
    if (request.mode === 'navigate' && ['/', '/index.html'].includes(url.pathname)) {
        event.respondWith(navigation(request));
    } else if (publicAssets.has(url.href) && url.pathname !== '/index.html') {
        event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(request)) || fetch(request)));
    }
});
