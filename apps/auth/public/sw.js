const CACHE_NAME = "relay-auth-v1"

const STATIC_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  "/relay.svg",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Bypass cache for API and Convex calls
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/oauth/") ||
    url.hostname === "fabulous-reindeer-307.convex.cloud" ||
    url.hostname === "favicon.vemetric.com"
  ) {
    event.respondWith(fetch(request).catch(() => new Response(null, { status: 503 })))
    return
  }

  // Cache-first for static assets
  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font" ||
    request.destination === "image"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        return response
      }))
    )
    return
  }

  // Network-first for navigation
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        return response
      }).catch(() => caches.match("/"))
    )
    return
  }

  event.respondWith(fetch(request))
})
