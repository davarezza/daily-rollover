const CACHE = 'daily-rollover-v1';
const SHELL = [
    './',
    'index.html',
    'style.css',
    'app.js',
    'budget.js',
    'analytics.js',
    'charts.js',
    'format.js',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'icons/icon-512.png'
];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'unpkg.com', 'www.gstatic.com'];

const isCacheable = (url) => url.origin === self.location.origin || CDN_HOSTS.includes(url.hostname);

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (!isCacheable(url)) return;

    event.respondWith(
        caches.open(CACHE).then(async (cache) => {
            const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
            const network = fetch(request).then((response) => {
                if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
                return response;
            });
            if (cached) {
                network.catch(() => {});
                return cached;
            }
            return network.catch(() => (request.mode === 'navigate' ? cache.match('index.html') : Response.error()));
        })
    );
});
