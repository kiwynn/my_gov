const SW_VERSION = "mygov-v1.0.2";

const STATIC_CACHE = `static-${SW_VERSION}`;
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;

// NOTE:
// - No offline.html (requested)
// - All paths are RELATIVE so GitHub Pages / subpaths work.
const PRECACHE_URLS = [
  "index.html",
  "idcard.html",
  "manifest.webmanifest",

  "identity.json",
  "id_pic.png",
  "signiture.png",

  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-192.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon-180.png",
  "icons/favicon-32.png",
  "icons/favicon-16.png"
];

async function safePrecache(cache) {
  // Cache what exists; skip missing files instead of failing SW install.
  await Promise.all(
    PRECACHE_URLS.map(async (url) => {
      try {
        const req = new Request(url, { cache: "reload" });
        const res = await fetch(req);
        if (res && res.ok) {
          await cache.put(req, res);
        }
      } catch (_) {}
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await safePrecache(cache);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    (request.method === "GET" && request.headers.get("accept")?.includes("text/html"))
  );
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
  } catch (_) {
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
  } catch (_) {
    return null;
  }
}

function inlineOfflineHtml() {
  const html = `<!doctype html>
<html lang="az">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0f14">
<title>Offline</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f14;color:#fff;font-family:-apple-system,BlinkMacSystemFont,Inter,Segoe UI,Roboto,Arial,sans-serif}
  .box{max-width:520px;padding:18px 16px;text-align:center;opacity:.9}
  .t{font-size:18px;font-weight:700;margin-bottom:8px}
  .p{font-size:14px;line-height:1.35;opacity:.85}
</style>
</head>
<body>
  <div class="box">
    <div class="t">İnternet bağlantısı yoxdur</div>
    <div class="p">Əlaqə bərpa olunanda yenidən yoxla. Əsas səhifə cache-dən göstərilə bilər.</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      // HTML navigations
      if (isNavigationRequest(request)) {
        const resp = await networkFirst(request);
        if (resp) return resp;

        const staticCache = await caches.open(STATIC_CACHE);
        const cachedIndex = await staticCache.match("index.html");
        return cachedIndex || inlineOfflineHtml();
      }

      // JSON
      if (url.pathname.endsWith(".json")) {
        const resp = await staleWhileRevalidate(request);
        if (resp) return resp;

        const staticCache = await caches.open(STATIC_CACHE);
        const cached = await staticCache.match(request);
        return cached || new Response("{}", { headers: { "Content-Type": "application/json" } });
      }

      // Images / icons
      if (url.pathname.match(/\.(png|jpg|jpeg|webp|svg)$/i)) {
        const resp = await cacheFirst(request);
        if (resp) return resp;

        const staticCache = await caches.open(STATIC_CACHE);
        const cached = await staticCache.match(request);
        return cached || Response.error();
      }

      // Everything else
      const resp = await staleWhileRevalidate(request);
      if (resp) return resp;

      const staticCache = await caches.open(STATIC_CACHE);
      const cached = await staticCache.match(request);
      return cached || Response.error();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
