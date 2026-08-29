import type { BookResult, SearchField } from '../types'
import { CatalogError } from './catalogCore'
import { parseSeries } from './series'

const API = 'https://openlibrary.org'
const COVERS = 'https://covers.openlibrary.org/b/id'

const FIELDS = [
  'key',
  'title',
  'author_name',
  'first_publish_year',
  'cover_i',
  'isbn',
  'number_of_pages_median',
  'subject',
  'editions',
  'editions.key',
  'editions.title',
  'editions.language',
  'editions.isbn',
  'editions.publish_date',
  'editions.number_of_pages',
].join(',')

/** Los campos vienen del índice Solr: los multivaluados llegan como lista. */
type Multi<T> = T | T[] | undefined

interface RawEdition {
  key?: Multi<string>
  title?: Multi<string>
  language?: string[]
  isbn?: string[]
  publish_date?: Multi<string>
  number_of_pages?: Multi<number>
}

interface RawDoc {
  key?: string
  title?: Multi<string>
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number
  isbn?: string[]
  number_of_pages_median?: number
  subject?: string[]
  editions?: { docs?: RawEdition[] }
}

function first<T>(value: Multi<T>): T | undefined {
  return Array.isArray(value) ? value[0] : value
}

function cover(id?: number, size: 'M' | 'L' = 'M'): string | undefined {
  return id ? `${COVERS}/${id}-${size}.jpg` : undefined
}

/** El id de obra viaja como "/works/OL123W"; guardamos solo la parte útil. */
function workId(key?: string): string {
  return (key ?? '').replace(/^\/works\//, '')
}

function normalizeDoc(doc: RawDoc): BookResult {
  // La obra lleva el título canónico (a menudo en inglés); la edición que devuelve
  // la búsqueda es la que coincide con el idioma pedido, y su título es el que
  // el lector reconoce.
  const edition = doc.editions?.docs?.[0]
  const rawTitle = first(edition?.title) || first(doc.title) || 'Sin título'
  const { cleanTitle, series, seriesPosition } = parseSeries(rawTitle)
  return {
    ref: { provider: 'openlibrary', id: workId(doc.key) },
    title: cleanTitle,
    authors: doc.author_name ?? [],
    series,
    seriesPosition,
    thumbnail: cover(doc.cover_i),
    isbn: edition?.isbn?.[0] ?? doc.isbn?.[0],
    year: first(edition?.publish_date)?.match(/\d{4}/)?.[0] ?? doc.first_publish_year?.toString(),
    pageCount: first(edition?.number_of_pages) ?? doc.number_of_pages_median,
    categories: doc.subject?.slice(0, 8),
  }
}

async function request(url: string, signal?: AbortSignal): Promise<any> {
  let res: Response
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new CatalogError(
      'No se pudo contactar con Open Library. Revisa tu conexión e inténtalo de nuevo.',
      'network',
      'openlibrary',
    )
  }
  if (res.status === 429) {
    throw new CatalogError(
      'Open Library está limitando las peticiones. Espera unos segundos y reintenta.',
      'quota',
      'openlibrary',
    )
  }
  if (!res.ok) {
    throw new CatalogError(
      `Open Library respondió con un error (${res.status}).`,
      'server',
      'openlibrary',
    )
  }
  return res.json()
}

/** Escapa lo que rompería la sintaxis de consulta de Solr. */
function clean(term: string): string {
  return term.replace(/["\\:()[\]{}^~*?]/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildQuery(term: string, field: SearchField, onlySpanish: boolean): string {
  const t = clean(term)
  const lang = onlySpanish ? ' language:spa' : ''
  switch (field) {
    case 'titulo':
      return `title:"${t}"${lang}`
    case 'autor':
      return `author:"${t}"${lang}`
    // El campo `series` de Open Library no es una lista de sagas: es una
    // etiqueta de comunidad casi siempre en inglés (p. ej. "series:Stormlight
    // Archive") que solo cubre un puñado de libros de cada saga (comprobado
    // contra la API: 2 de 6 en El Archivo de las Tormentas). El nombre en
    // español vive en el propio título, entre paréntesis, así que se busca ahí.
    case 'serie':
      return `title:"${t}"${lang}`
    default:
      return `${t}${lang}`
  }
}

async function run(
  q: string,
  startIndex: number,
  signal?: AbortSignal,
): Promise<{ items: BookResult[]; total: number }> {
  const params = new URLSearchParams({
    q,
    fields: FIELDS,
    limit: '24',
    offset: String(startIndex),
  })
  const data = await request(`${API}/search.json?${params}`, signal)
  return {
    items: (data.docs ?? []).filter((d: RawDoc) => d.key).map(normalizeDoc),
    total: data.numFound ?? 0,
  }
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Open Library indexa el subtítulo dentro del propio campo `title`: una
 * búsqueda de "juramentada" no solo encuentra el libro que se llama así, sino
 * cualquier tratado jurídico cuyo subtítulo diga "la guerra juramentada
 * contra el infiel". No se ocultan esos resultados (siguen siendo del
 * catálogo), pero se ordenan detrás de los que sí coinciden en el campo por
 * el que se está buscando.
 */
function reorderByRelevance(items: BookResult[], term: string, field: SearchField): BookResult[] {
  const needle = normalizeForMatch(term)
  const relevant = (item: BookResult) => {
    const haystack = normalizeForMatch(
      field === 'autor' ? item.authors.join(' ') : field === 'serie' ? (item.series ?? '') : item.title,
    )
    return haystack.includes(needle)
  }
  // Sort estable: dentro de cada grupo se conserva el orden que ya trae Open Library.
  return [...items].sort((a, b) => Number(relevant(b)) - Number(relevant(a)))
}

export async function search(
  term: string,
  field: SearchField,
  opts: { onlySpanish?: boolean; startIndex?: number; signal?: AbortSignal },
): Promise<{ items: BookResult[]; total: number }> {
  const onlySpanish = opts.onlySpanish !== false
  const start = opts.startIndex ?? 0
  let result = await run(buildQuery(term, field, onlySpanish), start, opts.signal)

  // Una búsqueda en español sin resultados casi siempre significa que la obra no
  // tiene edición traducida catalogada, no que no exista.
  if (result.total === 0 && onlySpanish) {
    result = await run(buildQuery(term, field, false), start, opts.signal)
  }
  return { ...result, items: reorderByRelevance(result.items, term, field) }
}

function descriptionOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'value' in value) {
    return String((value as { value: unknown }).value)
  }
  return undefined
}

/**
 * Solo la sinopsis, sin resolver autores ni el resto de la ficha: `detail()`
 * hace hasta 4 peticiones (la obra + hasta 3 autores) y está pensada para
 * abrir UNA ficha bajo demanda, no para pedirla de golpe en cada fila de una
 * lista de resultados.
 */
export async function fetchExcerpt(id: string, signal?: AbortSignal): Promise<string | undefined> {
  const work = await request(`${API}/works/${encodeURIComponent(id)}.json`, signal)
  return descriptionOf(work.description)
}

export async function detail(
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<BookResult> {
  const work = await request(`${API}/works/${encodeURIComponent(id)}.json`, opts.signal)
  const { cleanTitle, series, seriesPosition } = parseSeries(work.title ?? 'Sin título')

  // Los autores llegan como referencias; se resuelven en paralelo.
  const authorKeys: string[] = (work.authors ?? [])
    .map((a: any) => a?.author?.key)
    .filter(Boolean)
    .slice(0, 3)
  const authors = await Promise.all(
    authorKeys.map((key) =>
      request(`${API}${key}.json`, opts.signal)
        .then((a) => a.name as string)
        .catch(() => null),
    ),
  )

  return {
    ref: { provider: 'openlibrary', id },
    title: cleanTitle,
    authors: authors.filter((a): a is string => Boolean(a)),
    series,
    seriesPosition,
    thumbnail: cover(work.covers?.[0], 'L'),
    description: descriptionOf(work.description),
    categories: (work.subjects ?? []).slice(0, 8),
    year: work.first_publish_date?.match(/\d{4}/)?.[0],
    link: `https://openlibrary.org/works/${id}`,
  }
}

export async function findMatch(
  seed: { title: string; authors: string[]; isbn?: string },
  opts: { signal?: AbortSignal } = {},
): Promise<BookResult | null> {
  if (seed.isbn) {
    const byIsbn = await run(`isbn:${clean(seed.isbn)}`, 0, opts.signal)
    if (byIsbn.items.length) return byIsbn.items[0]
  }
  const author = seed.authors[0]
  const q = [`title:"${clean(seed.title)}"`, author && `author:"${clean(author)}"`]
    .filter(Boolean)
    .join(' ')
  const found = await run(q, 0, opts.signal)
  return found.items[0] ?? null
}
