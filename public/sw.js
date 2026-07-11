// Service worker minimale: network-first con fallback alla cache = funziona offline
// senza dover conoscere i nomi dei file buildati (che cambiano a ogni build).
const CACHE = 'carico-v1'

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copy))
        return res
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./')))
  )
})
