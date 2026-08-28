import type { BookStatus, StoredBook } from '../types'
import { parseSeries } from './series'

/**
 * La API pública de Goodreads dejó de emitir claves en diciembre de 2020 y las
 * existentes se desactivaron, así que hay dos caminos vivos para traer datos:
 *
 *  1. El CSV de "Exportar biblioteca" (goodreads.com/review/import). Es el oficial,
 *     completo y no depende de nadie más.
 *  2. Los feeds RSS por estante, que siguen funcionando pero no envían cabeceras
 *     CORS: hace falta un proxy público para leerlos desde el navegador.
 */

export interface GoodreadsEntry {
  goodreadsId: string
  title: string
  authors: string[]
  series?: string
  seriesPosition?: string
  isbn?: string
  status: BookStatus
  rating: number
  year?: string
  pageCount?: number
  thumbnail?: string
  startedAt?: string
  finishedAt?: string
  addedAt?: string
}

/* ------------------------------------------------------------------ CSV --- */

/** Parser CSV mínimo pero correcto: comillas, comas y saltos de línea dentro de campo. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((v) => v !== '')) rows.push(row)
  return rows
}

/** Goodreads exporta los ISBN como `="9788401352836"`. */
function cleanIsbn(value: string): string | undefined {
  const digits = value.replace(/^="?|"?$/g, '').trim()
  return /^\d{9,13}[\dXx]?$/.test(digits) ? digits : undefined
}

function shelfToStatus(exclusive: string, shelves: string): BookStatus {
  const all = `${exclusive} ${shelves}`.toLowerCase()
  if (/currently-reading|leyendo/.test(all)) return 'leyendo'
  if (/abandon|dnf|did-not-finish|dropped|unfinished/.test(all)) return 'cancelado'
  if (exclusive.toLowerCase() === 'read') return 'leido'
  if (/to-read|pendiente|wishlist/.test(all)) return 'pendiente'
  return 'pendiente'
}

function toIso(value: string): string | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  // Goodreads exporta las fechas sin hora ("2021/03/14"). Interpretarlas con `new Date`
  // las ancla a medianoche local, y al pasarlas a ISO se desplazan un día en casi cualquier
  // zona horaria: se fijan a mediodía UTC para que la fecha mostrada sea siempre la correcta.
  const dateOnly = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12)).toISOString()
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

export class ImportError extends Error {}

export function parseGoodreadsCsv(text: string): GoodreadsEntry[] {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new ImportError('El archivo está vacío o no tiene filas de libros.')

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name.toLowerCase())
  const iTitle = col('Title')
  const iAuthor = col('Author')
  if (iTitle === -1 || iAuthor === -1) {
    throw new ImportError(
      'No parece la exportación de Goodreads: faltan las columnas "Title" y "Author".',
    )
  }
  const idx = {
    id: col('Book Id'),
    extra: col('Additional Authors'),
    isbn13: col('ISBN13'),
    isbn: col('ISBN'),
    rating: col('My Rating'),
    pages: col('Number of Pages'),
    year: col('Original Publication Year'),
    yearPub: col('Year Published'),
    dateRead: col('Date Read'),
    dateAdded: col('Date Added'),
    shelves: col('Bookshelves'),
    exclusive: col('Exclusive Shelf'),
  }
  const at = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '').trim() : '')

  const out: GoodreadsEntry[] = []
  for (const row of rows.slice(1)) {
    const rawTitle = at(row, iTitle)
    if (!rawTitle) continue
    const { cleanTitle, series, seriesPosition } = parseSeries(rawTitle)
    const authors = [at(row, iAuthor), ...at(row, idx.extra).split(',')]
      .map((a) => a.trim())
      .filter(Boolean)
    const finishedAt = toIso(at(row, idx.dateRead))
    const status = shelfToStatus(at(row, idx.exclusive), at(row, idx.shelves))
    out.push({
      goodreadsId: at(row, idx.id) || `${cleanTitle}-${authors[0] ?? ''}`,
      title: cleanTitle,
      authors,
      series,
      seriesPosition,
      isbn: cleanIsbn(at(row, idx.isbn13)) ?? cleanIsbn(at(row, idx.isbn)),
      status,
      rating: Number(at(row, idx.rating)) || 0,
      year: at(row, idx.year) || at(row, idx.yearPub) || undefined,
      pageCount: Number(at(row, idx.pages)) || undefined,
      finishedAt: status === 'leido' ? finishedAt : undefined,
      addedAt: toIso(at(row, idx.dateAdded)),
    })
  }
  if (!out.length) throw new ImportError('El CSV no contiene ningún libro.')
  return out
}

/* ------------------------------------------------------------------ RSS --- */

export const DEFAULT_PROXY = 'https://api.allorigins.win/raw?url='

/**
 * Proxies públicos conocidos. Ninguno garantiza servicio: van y vienen, así que la
 * interfaz deja cambiar de uno a otro con un clic (y el CSV siempre queda como red).
 */
export const KNOWN_PROXIES: { label: string; url: string }[] = [
  { label: 'AllOrigins', url: 'https://api.allorigins.win/raw?url=' },
  { label: 'CodeTabs', url: 'https://api.codetabs.com/v1/proxy?quest=' },
  { label: 'cors.lol', url: 'https://api.cors.lol/?url=' },
]

const RSS_SHELVES: { shelf: string; status: BookStatus }[] = [
  { shelf: 'currently-reading', status: 'leyendo' },
  { shelf: 'to-read', status: 'pendiente' },
  { shelf: 'read', status: 'leido' },
]

export class SyncError extends Error {}

function textOf(item: Element, tag: string): string {
  return item.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
}

function parseRss(xml: string, status: BookStatus): GoodreadsEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    throw new SyncError('La respuesta no es un feed válido. Prueba con la importación por CSV.')
  }
  return Array.from(doc.getElementsByTagName('item')).map((item) => {
    const rawTitle = textOf(item, 'title')
    const { cleanTitle, series, seriesPosition } = parseSeries(rawTitle)
    const cover =
      textOf(item, 'book_large_image_url') ||
      textOf(item, 'book_medium_image_url') ||
      textOf(item, 'book_image_url')
    return {
      goodreadsId: textOf(item, 'book_id') || rawTitle,
      title: cleanTitle,
      authors: [textOf(item, 'author_name')].filter(Boolean),
      series,
      seriesPosition,
      isbn: cleanIsbn(textOf(item, 'isbn')),
      status,
      rating: Number(textOf(item, 'user_rating')) || 0,
      year: textOf(item, 'book_published') || undefined,
      pageCount: Number(textOf(item, 'num_pages')) || undefined,
      thumbnail: cover ? cover.replace(/^http:/, 'https:') : undefined,
      finishedAt: status === 'leido' ? toIso(textOf(item, 'user_read_at')) : undefined,
      addedAt: toIso(textOf(item, 'user_date_added')),
    }
  })
}

/** Descarga los tres estantes públicos de un usuario a través del proxy indicado. */
export async function syncFromGoodreads(
  userId: string,
  proxy: string,
  onProgress?: (shelf: string) => void,
): Promise<GoodreadsEntry[]> {
  const id = userId.trim().match(/\d+/)?.[0]
  if (!id) throw new SyncError('El identificador de usuario debe contener números (ej. 12345678).')
  if (!proxy.trim()) throw new SyncError('Configura un proxy CORS para poder leer los feeds.')

  const all: GoodreadsEntry[] = []
  for (const { shelf, status } of RSS_SHELVES) {
    onProgress?.(shelf)
    const target = `https://www.goodreads.com/review/list_rss/${id}?shelf=${shelf}&per_page=200`
    let res: Response
    try {
      res = await fetch(proxy + encodeURIComponent(target))
    } catch {
      throw new SyncError(
        'No se pudo contactar con el proxy. Comprueba la URL del proxy o usa el CSV.',
      )
    }
    if (res.status === 404) {
      throw new SyncError(`No existe un perfil público con el id ${id}.`)
    }
    if (!res.ok) {
      throw new SyncError(`El proxy respondió con un error (${res.status}). Prueba con otro o usa el CSV.`)
    }
    const xml = await res.text()
    if (/<html/i.test(xml.slice(0, 200))) {
      throw new SyncError(
        'Goodreads devolvió una página en lugar del feed: puede que el perfil sea privado.',
      )
    }
    all.push(...parseRss(xml, status))
  }
  if (!all.length) {
    throw new SyncError('El perfil no tiene libros públicos en sus estantes.')
  }
  return all
}

/* --------------------------------------------------------------- merge --- */

export interface MergeResult {
  books: StoredBook[]
  added: number
  updated: number
  skipped: number
}

/** Fusiona lo importado con la biblioteca actual sin perder ediciones locales. */
export function mergeEntries(
  library: StoredBook[],
  entries: GoodreadsEntry[],
  strategy: 'merge' | 'replace',
): MergeResult {
  const now = new Date().toISOString()
  const byGoodreads = new Map(library.filter((b) => b.goodreadsId).map((b) => [b.goodreadsId!, b]))
  const byTitle = new Map(
    library.map((b) => [`${b.title.toLowerCase()}|${(b.authors[0] ?? '').toLowerCase()}`, b]),
  )

  const result = new Map(library.map((b) => [b.id, b]))
  let added = 0
  let updated = 0
  let skipped = 0

  for (const entry of entries) {
    const existing =
      byGoodreads.get(entry.goodreadsId) ??
      byTitle.get(`${entry.title.toLowerCase()}|${(entry.authors[0] ?? '').toLowerCase()}`)

    if (!existing) {
      const book: StoredBook = {
        id: `gr:${entry.goodreadsId}`,
        goodreadsId: entry.goodreadsId,
        title: entry.title,
        authors: entry.authors,
        series: entry.series,
        seriesPosition: entry.seriesPosition,
        thumbnail: entry.thumbnail,
        isbn: entry.isbn,
        year: entry.year,
        pageCount: entry.pageCount,
        status: entry.status,
        rating: entry.rating,
        addedAt: entry.addedAt ?? now,
        updatedAt: now,
        finishedAt: entry.finishedAt,
        source: 'goodreads',
      }
      result.set(book.id, book)
      added++
      continue
    }

    if (strategy === 'merge' && existing.status !== entry.status && existing.source !== 'goodreads') {
      // El estado local manda: solo se completan los huecos.
      skipped++
    }
    const merged: StoredBook = {
      ...existing,
      goodreadsId: entry.goodreadsId,
      status: strategy === 'replace' ? entry.status : (existing.status ?? entry.status),
      rating: existing.rating || entry.rating,
      series: existing.series ?? entry.series,
      seriesPosition: existing.seriesPosition ?? entry.seriesPosition,
      isbn: existing.isbn ?? entry.isbn,
      year: existing.year ?? entry.year,
      pageCount: existing.pageCount ?? entry.pageCount,
      thumbnail: existing.thumbnail ?? entry.thumbnail,
      finishedAt: existing.finishedAt ?? entry.finishedAt,
      updatedAt: now,
    }
    if (strategy === 'replace') merged.status = entry.status
    result.set(existing.id, merged)
    updated++
  }

  return { books: [...result.values()], added, updated, skipped }
}
