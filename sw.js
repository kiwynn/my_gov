const SW_VERSION = "mygov-v1.0.0";

const STATIC_CACHE = `static-${SW_VERSION}`;
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/idcard.html",
  "/offline.html",
  "/manifest.webmanifest",

  "/identity.json",
  "/id_pic.png",
  "/signiture.png",

  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon-180.png",
  "/icons/favicon-32.png",
  "/icons/favicon-16.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

function isNavigationRequest(request) {
  return request.mode === "navigate" ||
    (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || null;
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await cache.match(request);
    return cached || null;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    return null;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    if (isNavigationRequest(request)) {
      const resp = await networkFirst(request);
      if (resp) return resp;

      const cache = await caches.open(STATIC_CACHE);
      const cachedIndex = await cache.match("/index.html");
      return cachedIndex || cache.match("/offline.html");
    }

    if (url.pathname.endsWith(".json")) {
      const resp = await staleWhileRevalidate(request);
      if (resp) return resp;

      const cache = await caches.open(STATIC_CACHE);
      return (await cache.match(request)) || (await cache.match("/offline.html"));
    }

    if (url.pathname.match(/\.(png|jpg|jpeg|webp|svg)$/i)) {
      const resp = await cacheFirst(request);
      if (resp) return resp;

      const cache = await caches.open(STATIC_CACHE);
      return (await cache.match(request)) || Response.error();
    }

    const resp = await staleWhileRevalidate(request);
    if (resp) return resp;

    const staticCache = await caches.open(STATIC_CACHE);
    const cached = await staticCache.match(request);
    return cached || Response.error();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
