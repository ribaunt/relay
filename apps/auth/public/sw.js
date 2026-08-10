const CACHE_NAME = "relay-auth-v3"

const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  "/relay.svg",
]

self.addEventListener("install", (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // App-owned requests: the app is the sole requester for data/API.
  // Never intercept these, so each request is made exactly once.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/oauth/") ||
    url.hostname === "fabulous-reindeer-307.convex.cloud" ||
    url.hostname === "favicon.vemetric.com"
  ) {
    return
  }

  // Cache-first for static assets: the service worker is the sole requester —
  // the app never fetches its own chunks, so no duplicate network calls.
  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font" ||
    request.destination === "image" ||
    request.destination === "manifest"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      }))
    )
    return
  }

  // Cache-first navigation with background refresh: serve the cached shell
  // instantly (zero network on repeat visits) and revalidate once in the
  // background, so the document is fetched at most one time per visit.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("/").then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put("/", clone))
            }
            return response
          })
          .catch(() => cached)
        return cached || network
      })
    )
    return
  }

  event.respondWith(fetch(request))
})