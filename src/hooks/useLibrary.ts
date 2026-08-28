import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BookResult, BookStatus, StoredBook } from '../types'
import { loadLibrary, saveLibrary } from '../lib/storage'

export interface LibraryApi {
  books: StoredBook[]
  byStatus: Record<BookStatus, StoredBook[]>
  statusOf: (volumeId: string) => BookStatus | undefined
  persistenceError: boolean
  addFromSearch: (result: BookResult, status: BookStatus) => void
  setStatus: (id: string, status: BookStatus) => void
  update: (id: string, patch: Partial<StoredBook>) => void
  remove: (id: string) => void
  replaceAll: (books: StoredBook[]) => void
}

const EMPTY: Record<BookStatus, StoredBook[]> = {
  leyendo: [],
  pendiente: [],
  leido: [],
  cancelado: [],
}

export function useLibrary(): LibraryApi {
  const [books, setBooks] = useState<StoredBook[]>(() => loadLibrary())
  const [persistenceError, setPersistenceError] = useState(false)

  useEffect(() => {
    if (!saveLibrary(books)) setPersistenceError(true)
  }, [books])

  // Mantiene sincronizadas dos pestañas abiertas a la vez.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'incipit.library.v1') setBooks(loadLibrary())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const byStatus = useMemo(() => {
    const groups: Record<BookStatus, StoredBook[]> = {
      leyendo: [],
      pendiente: [],
      leido: [],
      cancelado: [],
    }
    for (const book of books) (groups[book.status] ?? groups.pendiente).push(book)
    for (const key of Object.keys(groups) as BookStatus[]) {
      groups[key].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    }
    return groups
  }, [books])

  const volumeIndex = useMemo(() => {
    const map = new Map<string, BookStatus>()
    for (const b of books) if (b.volumeId) map.set(b.volumeId, b.status)
    return map
  }, [books])

  const statusOf = useCallback((volumeId: string) => volumeIndex.get(volumeId), [volumeIndex])

  const addFromSearch = useCallback((result: BookResult, status: BookStatus) => {
    const now = new Date().toISOString()
    setBooks((prev) => {
      const existing = prev.find((b) => b.volumeId === result.volumeId)
      if (existing) {
        return prev.map((b) =>
          b.id === existing.id ? { ...b, status, updatedAt: now, ...datesFor(status, b) } : b,
        )
      }
      const book: StoredBook = {
        id: `gb:${result.volumeId}`,
        volumeId: result.volumeId,
        title: result.title,
        authors: result.authors,
        series: result.series,
        seriesPosition: result.seriesPosition,
        thumbnail: result.thumbnail,
        isbn: result.isbn,
        year: result.year,
        pageCount: result.pageCount,
        status,
        rating: 0,
        addedAt: now,
        updatedAt: now,
        source: 'google',
        ...datesFor(status, undefined),
      }
      return [book, ...prev]
    })
  }, [])

  const setStatus = useCallback((id: string, status: BookStatus) => {
    const now = new Date().toISOString()
    setBooks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status, updatedAt: now, ...datesFor(status, b) } : b)),
    )
  }, [])

  const update = useCallback((id: string, patch: Partial<StoredBook>) => {
    setBooks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b)),
    )
  }, [])

  const remove = useCallback((id: string) => {
    setBooks((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const replaceAll = useCallback((next: StoredBook[]) => setBooks(next), [])

  return {
    books,
    byStatus: books.length ? byStatus : EMPTY,
    statusOf,
    persistenceError,
    addFromSearch,
    setStatus,
    update,
    remove,
    replaceAll,
  }
}

/** Rellena las fechas de inicio/fin al cambiar de estante, sin pisar las ya puestas. */
function datesFor(status: BookStatus, book?: StoredBook): Partial<StoredBook> {
  const now = new Date().toISOString()
  if (status === 'leyendo') return { startedAt: book?.startedAt ?? now }
  if (status === 'leido') return { startedAt: book?.startedAt, finishedAt: book?.finishedAt ?? now }
  return {}
}
