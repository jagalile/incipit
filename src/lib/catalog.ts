import type { BookResult, SearchField } from '../types'
import { CatalogError, type BookRef, type Provider } from './catalogCore'
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

export async function searchBooks(
  term: string,
  field: SearchField,
  opts: SearchOptions,
): Promise<{ items: BookResult[]; total: number }> {
  if (!term.trim()) return { items: [], total: 0 }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new CatalogError(
      'No hay conexión. Tus estantes siguen disponibles, pero la búsqueda necesita internet.',
      'offline',
      opts.provider,
    )
  }
  return impl(opts.provider).search(term, field, opts)
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

/**
 * Solo la sinopsis, para completar una fila de resultados sin pagar el coste
 * de una ficha completa. Google Books ya la trae en la propia búsqueda; Open
 * Library no, así que aquí es la única fuente que hace falta pedir aparte.
 */
export async function getExcerpt(ref: BookRef, signal?: AbortSignal): Promise<string | undefined> {
  if (ref.provider !== 'openlibrary') return undefined
  return openLibrary.fetchExcerpt(ref.id, signal)
}
