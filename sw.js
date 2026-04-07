const CACHE_NAME = 'tank-warfare-v2';
const ASSETS = ['/', '/index.html', '/style.css', '/js/utils.js', '/js/entities.js', '/js/ai.js', '/js/map.js', '/js/engine.js', '/js/editor.js', '/js/touch.js', '/js/wallet.js', '/js/main.js'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
    self.clients.claim();
});

// Network-first strategy: try network, fall back to cache
self.addEventListener('fetch', e => {
    e.respondWith(
        fetch(e.request).then(resp => {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
            return resp;
        }).catch(() => caches.match(e.request))
    );
});
