import type { BookResult, SearchField } from '../types'
import { parseSeries } from './series'

const API = 'https://www.googleapis.com/books/v1/volumes'

export class ApiError extends Error {
  constructor(message: string, readonly kind: 'network' | 'rate-limit' | 'server' = 'server') {
    super(message)
  }
}

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
  // Google sirve las portadas por http y con "curl" de página; forzamos https y quitamos el rizo.
  return raw.replace(/^http:/, 'https:').replace('&edge=curl', '')
}

export function normalizeVolume(raw: RawVolume): BookResult {
  const info = raw.volumeInfo ?? {}
  const { cleanTitle, series, seriesPosition } = parseSeries(info.title ?? 'Sin título', info.subtitle)
  const ids = info.industryIdentifiers ?? []
  const isbn =
    ids.find((i) => i.type === 'ISBN_13')?.identifier ?? ids.find((i) => i.type === 'ISBN_10')?.identifier
  return {
    volumeId: raw.id,
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
    previewLink: info.previewLink,
  }
}

async function request(url: string, signal?: AbortSignal): Promise<any> {
  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError('No hay conexión con Google Books. Revisa tu red e inténtalo de nuevo.', 'network')
  }
  if (res.status === 429) {
    throw new ApiError('Google Books ha limitado las peticiones. Espera unos segundos.', 'rate-limit')
  }
  if (!res.ok) {
    throw new ApiError(`Google Books respondió con un error (${res.status}).`, 'server')
  }
  return res.json()
}

/** Construye la consulta según el campo elegido en el buscador. */
export function buildQuery(term: string, field: SearchField): string {
  const q = term.trim()
  if (!q) return ''
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

export async function searchBooks(
  term: string,
  field: SearchField,
  opts: { signal?: AbortSignal; startIndex?: number; onlySpanish?: boolean } = {},
): Promise<{ items: BookResult[]; total: number }> {
  const q = buildQuery(term, field)
  if (!q) return { items: [], total: 0 }
  const params = new URLSearchParams({
    q,
    printType: 'books',
    maxResults: '24',
    startIndex: String(opts.startIndex ?? 0),
    orderBy: 'relevance',
  })
  if (opts.onlySpanish !== false) params.set('langRestrict', 'es')
  const data = await request(`${API}?${params}`, opts.signal)
  const items: BookResult[] = (data.items ?? []).map(normalizeVolume)
  // Google devuelve duplicados de ediciones distintas con el mismo título+autor.
  const seen = new Set<string>()
  const unique = items.filter((b) => {
    const key = `${b.title.toLowerCase()}|${b.authors[0]?.toLowerCase() ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { items: unique, total: data.totalItems ?? 0 }
}

export async function getVolume(volumeId: string, signal?: AbortSignal): Promise<BookResult> {
  const data = await request(`${API}/${encodeURIComponent(volumeId)}`, signal)
  return normalizeVolume(data)
}

/** Busca el volumen que corresponde a un libro importado (ISBN primero, luego título + autor). */
export async function findVolumeFor(
  book: { title: string; authors: string[]; isbn?: string },
  signal?: AbortSignal,
): Promise<BookResult | null> {
  if (book.isbn) {
    const byIsbn = await request(`${API}?q=isbn:${encodeURIComponent(book.isbn)}&maxResults=1`, signal)
    const hit = byIsbn.items?.[0]
    if (hit) return normalizeVolume(hit)
  }
  const author = book.authors[0]
  const q = [`intitle:${book.title.replace(/[()[\]"]/g, ' ').trim()}`, author && `inauthor:${author}`]
    .filter(Boolean)
    .join('+')
  const data = await request(`${API}?q=${encodeURIComponent(q)}&maxResults=3&printType=books`, signal)
  const hit = data.items?.[0]
  return hit ? normalizeVolume(hit) : null
}
