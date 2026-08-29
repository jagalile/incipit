import type { BookResult, SearchField } from '../types'
import { CatalogError, type BookRef, type ErrorKind, type Provider } from './catalogCore'
import * as google from './googleBooks'
import * as openLibrary from './openLibrary'

export { CatalogError, refKey } from './catalogCore'
export type { BookRef, ErrorKind, Provider } from './catalogCore'

/**
 * De dónde salen las fichas. Google Books cerró en 2025 el acceso sin clave
 * (su proyecto anónimo responde 429 con cuota diaria 0), así que la fuente por
 * defecto es Open Library, que sigue siendo abierta de verdad.
 */
export const PROVIDERS: { id: Provider; label: string; needsKey: boolean; note: string }[] = [
  {
    id: 'openlibrary',
    label: 'Open Library',
    needsKey: false,
    note: 'Abierta y sin clave. Busca las ediciones en castellano de cada obra.',
  },
  {
    id: 'google',
    label: 'Google Books',
    needsKey: true,
    note: 'Mejor catálogo en español, pero desde 2025 exige una clave de API propia.',
  },
]

export interface SearchOptions {
  provider: Provider
  apiKey?: string
  onlySpanish?: boolean
  startIndex?: number
  signal?: AbortSignal
}

function impl(provider: Provider) {
  return provider === 'google' ? google : openLibrary
}

export interface SearchResult {
  items: BookResult[]
  total: number
  /** Qué catálogo sirvió esto de verdad. Distinto de `opts.provider` cuando
   *  ese falló y se recurrió al otro. */
  usedProvider: Provider
}

// Kinds de error tras los que vale la pena probar el otro catálogo: el
// elegido tiene un problema propio (cuota, clave, servidor caído, red), no
// que la biblioteca esté vacía o el término no exista en ningún sitio.
const FALLBACK_KINDS: ErrorKind[] = ['quota', 'auth', 'server', 'network']

export async function searchBooks(
  term: string,
  field: SearchField,
  opts: SearchOptions,
): Promise<SearchResult> {
  if (!term.trim()) return { items: [], total: 0, usedProvider: opts.provider }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CatalogError(
      'No hay conexión. Tus estantes siguen disponibles, pero la búsqueda necesita internet.',
      'offline',
      opts.provider,
    )
  }
  try {
    const result = await impl(opts.provider).search(term, field, opts)
    return { ...result, usedProvider: opts.provider }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    const fallback: Provider = opts.provider === 'google' ? 'openlibrary' : 'google'
    // Sin clave, Google no es una alternativa real: daría el mismo 429 de
    // siempre, así que solo merece la pena probar si hay algo que probar.
    const canFallback =
      err instanceof CatalogError &&
      FALLBACK_KINDS.includes(err.kind) &&
      (fallback !== 'google' || Boolean(opts.apiKey?.trim()))
    if (!canFallback) throw err
    try {
      const result = await impl(fallback).search(term, field, opts)
      return { ...result, usedProvider: fallback }
    } catch {
      // El fallo que importa es el del catálogo que el usuario eligió, no
      // el del recurso de emergencia que también falló.
      throw err
    }
  }
}

export async function getBook(
  ref: BookRef,
  opts: { apiKey?: string; signal?: AbortSignal } = {},
): Promise<BookResult> {
  return impl(ref.provider).detail(ref.id, opts)
}

/** Busca la ficha que corresponde a un libro importado de Goodreads. */
export async function findBookFor(
  seed: { title: string; authors: string[]; isbn?: string },
  opts: { provider: Provider; apiKey?: string; signal?: AbortSignal },
): Promise<BookResult | null> {
  return impl(opts.provider).findMatch(seed, opts)
}
