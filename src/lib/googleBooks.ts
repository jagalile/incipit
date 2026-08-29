import type { BookResult, SearchField } from '../types'
import { CatalogError, fetchWithRetry } from './catalogCore'
import { parseSeries } from './series'

const API = 'https://www.googleapis.com/books/v1/volumes'

interface RawVolume {
  id: string
  volumeInfo?: {
    title?: string
    subtitle?: string
    authors?: string[]
    publishedDate?: string
    publisher?: string
    pageCount?: number
    language?: string
    categories?: string[]
    description?: string
    averageRating?: number
    previewLink?: string
    imageLinks?: Record<string, string>
    industryIdentifiers?: { type: string; identifier: string }[]
  }
}

function pickCover(links?: Record<string, string>): string | undefined {
  const raw = links?.thumbnail ?? links?.smallThumbnail
  if (!raw) return undefined
  // Google sirve las portadas por http y con "rizo" de página; forzamos https y lo quitamos.
  return raw.replace(/^http:/, 'https:').replace('&edge=curl', '')
}

function normalizeVolume(raw: RawVolume): BookResult {
  const info = raw.volumeInfo ?? {}
  const { cleanTitle, series, seriesPosition } = parseSeries(info.title ?? 'Sin título', info.subtitle)
  const ids = info.industryIdentifiers ?? []
  const isbn =
    ids.find((i) => i.type === 'ISBN_13')?.identifier ?? ids.find((i) => i.type === 'ISBN_10')?.identifier
  return {
    ref: { provider: 'google', id: raw.id },
    title: cleanTitle || info.title || 'Sin título',
    subtitle: info.subtitle,
    authors: info.authors ?? [],
    series,
    seriesPosition,
    thumbnail: pickCover(info.imageLinks),
    isbn,
    year: info.publishedDate?.slice(0, 4),
    pageCount: info.pageCount,
    publisher: info.publisher,
    language: info.language,
    categories: info.categories,
    description: info.description,
    averageRating: info.averageRating,
    link: info.previewLink,
  }
}

async function request(url: string, signal?: AbortSignal): Promise<any> {
  let res: Response
  try {
    // Un 5xx se reintenta solo (es un fallo transitorio conocido de las APIs
    // de Google); un fallo de red, no -no hay nada que un reintento arregle-.
    res = await fetchWithRetry(url, { signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new CatalogError(
      'No hay conexión con Google Books. Revisa tu red e inténtalo de nuevo.',
      'network',
      'google',
    )
  }
  if (res.status === 429 || res.status === 403) {
    // Desde 2025 el proyecto anónimo de Google Books tiene la cuota diaria a cero:
    // sin clave propia, toda petición vuelve con este error.
    throw new CatalogError(
      'Google Books ha rechazado la petición por cuota. Necesita una clave de API propia, o puedes buscar con Open Library.',
      res.status === 403 ? 'auth' : 'quota',
      'google',
    )
  }
  if (!res.ok) {
    throw new CatalogError(
      res.status >= 500
        ? `Google Books ha fallado tras varios intentos (${res.status}). Es un fallo pasajero de su servidor: suele bastar con esperar unos segundos.`
        : `Google Books respondió con un error (${res.status}).`,
      'server',
      'google',
    )
  }
  return res.json()
}

function buildQuery(term: string, field: SearchField): string {
  const q = term.trim()
  switch (field) {
    case 'titulo':
      return `intitle:${q}`
    case 'autor':
      return `inauthor:${q}`
    // Google Books no indexa la serie como campo propio: casi siempre aparece
    // dentro del título, así que se busca ahí y luego se agrupa por serie.
    case 'serie':
      return `intitle:${q}`
    default:
      return q
  }
}

function withKey(params: URLSearchParams, apiKey?: string): URLSearchParams {
  if (apiKey?.trim()) params.set('key', apiKey.trim())
  // `country` es un parámetro documentado para saltarse la geolocalización
  // por IP y decirle a Google directamente desde qué país se pregunta. Sin
  // él, Google la deduce de la IP -y con redes móviles/de operador (varios
  // usuarios reales detrás de una IP compartida, cambiando de sitio) a veces
  // no puede, y esa deducción fallida es una causa documentada del 503
  // intermitente. Se fija a España porque toda la app está en español; no
  // cambia el idioma de los resultados, solo evita ese fallo concreto.
  params.set('country', 'ES')
  return params
}

export async function search(
  term: string,
  field: SearchField,
  opts: { apiKey?: string; onlySpanish?: boolean; startIndex?: number; signal?: AbortSignal },
): Promise<{ items: BookResult[]; total: number }> {
  const params = withKey(
    new URLSearchParams({
      q: buildQuery(term, field),
      printType: 'books',
      maxResults: '24',
      startIndex: String(opts.startIndex ?? 0),
      orderBy: 'relevance',
    }),
    opts.apiKey,
  )
  if (opts.onlySpanish !== false) params.set('langRestrict', 'es')
  const data = await request(`${API}?${params}`, opts.signal)
  const items: BookResult[] = (data.items ?? []).map(normalizeVolume)
  // Google devuelve ediciones distintas del mismo libro como resultados separados.
  const seen = new Set<string>()
  const unique = items.filter((b) => {
    const key = `${b.title.toLowerCase()}|${b.authors[0]?.toLowerCase() ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { items: unique, total: data.totalItems ?? 0 }
}

export async function detail(
  id: string,
  opts: { apiKey?: string; signal?: AbortSignal } = {},
): Promise<BookResult> {
  const params = withKey(new URLSearchParams(), opts.apiKey)
  const query = params.toString()
  const data = await request(`${API}/${encodeURIComponent(id)}${query ? `?${query}` : ''}`, opts.signal)
  return normalizeVolume(data)
}

export async function findMatch(
  seed: { title: string; authors: string[]; isbn?: string },
  opts: { apiKey?: string; signal?: AbortSignal } = {},
): Promise<BookResult | null> {
  if (seed.isbn) {
    const params = withKey(new URLSearchParams({ q: `isbn:${seed.isbn}`, maxResults: '1' }), opts.apiKey)
    const byIsbn = await request(`${API}?${params}`, opts.signal)
    if (byIsbn.items?.[0]) return normalizeVolume(byIsbn.items[0])
  }
  const author = seed.authors[0]
  const q = [`intitle:${seed.title.replace(/[()[\]"]/g, ' ').trim()}`, author && `inauthor:${author}`]
    .filter(Boolean)
    .join('+')
  const params = withKey(new URLSearchParams({ q, maxResults: '3', printType: 'books' }), opts.apiKey)
  const data = await request(`${API}?${params}`, opts.signal)
  return data.items?.[0] ? normalizeVolume(data.items[0]) : null
}
