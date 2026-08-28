/**
 * Service worker de Incipit.
 *
 * La biblioteca vive en localStorage, así que sin conexión la app es plenamente
 * usable: solo hace falta que el propio armazón (HTML, JS, CSS) y las portadas ya
 * vistas estén en caché. Las búsquedas sí necesitan red y fallan con su mensaje.
 */

// scripts/precache.mjs sella cada build: al cambiar, `activate` borra las cachés viejas.
const VERSION = /* __VERSION__ */ 'dev'

/** La lista real la inyecta scripts/precache.mjs al terminar el build. */
const PRECACHE = /* __PRECACHE__ */ []
const SHELL = `incipit-shell-${VERSION}`
const COVERS = `incipit-covers-${VERSION}`
const DATA = `incipit-data-${VERSION}`
const FONTS = `incipit-fonts-${VERSION}`
const CACHES = [SHELL, COVERS, DATA, FONTS]

const COVER_HOSTS = ['covers.openlibrary.org', 'books.google.com', 'books.googleusercontent.com']
const DATA_HOSTS = ['openlibrary.org', 'www.googleapis.com']
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']
const MAX_COVERS = 300

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      cache.addAll(PRECACHE.map((file) => new URL(file, self.registration.scope))),
    ),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/**
 * Los servidores mandan `Vary` (Origin en local, Accept-Encoding en GitHub Pages) y
 * eso hace que una petición del navegador no case con la que guardó la precarga.
 * Ignorarlo es lo correcto aquí: la variación no cambia el recurso.
 */
const MATCH = { ignoreVary: true }

/** Evita que la caché de portadas crezca sin límite. */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= max) return
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)))
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL)
  const cached = await cache.match(request, MATCH)
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone()).catch(() => undefined)
      return res
    })
    .catch(() => cached)
  return cached ?? network
}

/**
 * `Cache.put` rechaza cualquier respuesta redirigida, y las portadas de Open Library
 * siempre redirigen a archive.org: hay que guardar una copia limpia o el guardado
 * falla y, con él, la imagen.
 */
async function cacheable(res) {
  if (!res.redirected) return res.clone()
  return new Response(await res.clone().blob(), {
    status: 200,
    statusText: 'OK',
    headers: res.headers,
  })
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request, MATCH)
  if (cached) return cached
  const res = await fetch(request)
  // Las fuentes responden opacas (sin CORS): se guardan igual, porque servirlas
  // desde caché es justo lo que hace falta sin conexión.
  if (res.ok || res.type === 'opaque') {
    // Un fallo al guardar nunca debe tumbar la respuesta que ya tenemos.
    await cache.put(request, await cacheable(res)).catch(() => undefined)
    if (cacheName === COVERS) trim(cacheName, MAX_COVERS)
  }
  return res
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(request)
    if (res.ok) cache.put(request, res.clone()).catch(() => undefined)
    return res
  } catch (err) {
    const cached = await cache.match(request, MATCH)
    if (cached) return cached
    throw err
  }
}

/** El armazón en caché para cuando se abre la app sin conexión. */
async function shellFallback() {
  const cache = await caches.open(SHELL)
  const scope = self.registration.scope
  return (
    (await cache.match(new URL('./', scope), MATCH)) ??
    (await cache.match(new URL('./index.html', scope), MATCH)) ??
    Response.error()
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches
            .open(SHELL)
            .then((c) => c.put(new URL('./', self.registration.scope), res.clone()))
            .catch(() => undefined)
          return res
        })
        .catch(shellFallback),
    )
    return
  }

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, FONTS).catch(() => fetch(request)))
    return
  }

  if (COVER_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, COVERS).catch(() => fetch(request)))
    return
  }

  if (DATA_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(request, DATA))
    return
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request))
  }
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})
