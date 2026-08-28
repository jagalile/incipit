import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, searchBooks } from '../lib/googleBooks'
import { seriesKey } from '../lib/series'
import type { BookResult, SearchField } from '../types'
import type { LibraryApi } from '../hooks/useLibrary'
import { useDebounced } from '../hooks/useDebounced'
import { BookCard } from './BookCard'
import { SearchIcon } from './SearchIcon'
import { StatusPicker } from './StatusPicker'
import { CardsSkeleton, EmptyState, ErrorState } from './States'
import type { DetailSeed } from './BookDetail'

const FIELDS: { id: SearchField; label: string; placeholder: string }[] = [
  { id: 'todo', label: 'Todo', placeholder: 'Busca por título, autor o serie…' },
  { id: 'titulo', label: 'Título', placeholder: 'Ej. La sombra del viento' },
  { id: 'autor', label: 'Autor', placeholder: 'Ej. Almudena Grandes' },
  { id: 'serie', label: 'Serie', placeholder: 'Ej. Crónica del asesino de reyes' },
]

const SUGGESTIONS = ['Los renglones torcidos de Dios', 'Sanderson', 'Patria', 'Los Cinco']

interface Props {
  library: LibraryApi
  onOpen: (seed: DetailSeed) => void
}

export function SearchView({ library, onOpen }: Props) {
  const [term, setTerm] = useState('')
  const [field, setField] = useState<SearchField>('todo')
  const [onlySpanish, setOnlySpanish] = useState(true)
  const [results, setResults] = useState<BookResult[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const query = useDebounced(term.trim())

  useEffect(() => {
    if (!query) {
      setResults([])
      setTotal(0)
      setError(null)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    searchBooks(query, field, { signal: controller.signal, onlySpanish })
      .then(({ items, total: t }) => {
        if (controller.signal.aborted) return
        setResults(items)
        setTotal(t)
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === 'AbortError') return
        setError(err instanceof ApiError ? err.message : 'No se pudo completar la búsqueda.')
        setResults([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [query, field, onlySpanish, attempt])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const { items } = await searchBooks(query, field, { startIndex: results.length, onlySpanish })
      setResults((prev) => {
        const seen = new Set(prev.map((b) => b.volumeId))
        return [...prev, ...items.filter((b) => !seen.has(b.volumeId))]
      })
    } catch {
      setError('No se pudieron cargar más resultados.')
    } finally {
      setLoadingMore(false)
    }
  }, [query, field, results.length, onlySpanish])

  // En modo "serie" los resultados se agrupan por saga para leerlos como una colección.
  const grouped = useMemo(() => {
    if (field !== 'serie') return null
    const groups = new Map<string, { name: string; items: BookResult[] }>()
    for (const item of results) {
      const key = seriesKey(item.series) || '__sueltos'
      const entry = groups.get(key) ?? { name: item.series ?? 'Sin serie identificada', items: [] }
      entry.items.push(item)
      groups.set(key, entry)
    }
    for (const group of groups.values()) {
      group.items.sort(
        (a, b) => Number(a.seriesPosition ?? 99) - Number(b.seriesPosition ?? 99),
      )
    }
    return [...groups.entries()]
      .sort((a, b) => (a[0] === '__sueltos' ? 1 : b[0] === '__sueltos' ? -1 : b[1].items.length - a[1].items.length))
      .map(([, v]) => v)
  }, [results, field])

  const placeholder = FIELDS.find((f) => f.id === field)!.placeholder

  const renderCard = (book: BookResult) => (
    <BookCard
      key={book.volumeId}
      title={book.title}
      authors={book.authors}
      thumbnail={book.thumbnail}
      series={book.series}
      seriesPosition={book.seriesPosition}
      year={book.year}
      status={library.statusOf(book.volumeId)}
      onOpen={() => onOpen(book)}
      footer={
        <StatusPicker
          compact
          idPrefix={book.volumeId}
          value={library.statusOf(book.volumeId)}
          onChange={(status) => library.addFromSearch(book, status)}
        />
      }
    />
  )

  return (
    <section>
      <div className="page-head">
        <h1>Buscar libros</h1>
        <p>
          Resultados de Google Books. Elige el estante desde la propia tarjeta y el libro se guarda en
          tu biblioteca.
        </p>
      </div>

      <div className="toolbar">
        <div className="field">
          <span className="field__icon">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            type="search"
            value={term}
            placeholder={placeholder}
            aria-label="Buscar libros"
            onChange={(e) => setTerm(e.target.value)}
          />
          {term && (
            <button className="field__clear" onClick={() => setTerm('')} aria-label="Limpiar búsqueda">
              ×
            </button>
          )}
        </div>
        <div className="chips" role="group" aria-label="Buscar por">
          {FIELDS.map((f) => (
            <button
              key={f.id}
              className="chip"
              aria-pressed={field === f.id}
              onClick={() => setField(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          className="chip"
          aria-pressed={onlySpanish}
          onClick={() => setOnlySpanish((v) => !v)}
          title="Restringe los resultados a ediciones en castellano"
        >
          Solo en español
        </button>
      </div>

      {!query && !loading && (
        <EmptyState
          icon="🔍"
          title="Empieza a escribir"
          description="Busca por título, por autor o por el nombre de una saga. Los resultados llegan de Google Books, sin necesidad de cuenta."
          action={
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="chip"
                  onClick={() => {
                    setTerm(s)
                    inputRef.current?.focus()
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          }
        />
      )}

      {loading && <CardsSkeleton />}

      {!loading && error && (
        <ErrorState
          message={error}
          onRetry={() => setAttempt((a) => a + 1)}
          hint={
            onlySpanish ? (
              <button className="btn btn--ghost" onClick={() => setOnlySpanish(false)}>
                Buscar en todos los idiomas
              </button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && query && results.length === 0 && (
        <EmptyState
          icon="🔍"
          title={`Sin resultados para «${query}»`}
          description="Prueba con menos palabras, revisa la ortografía o amplía la búsqueda a otros idiomas."
          action={
            onlySpanish ? (
              <button className="btn" onClick={() => setOnlySpanish(false)}>
                Buscar en todos los idiomas
              </button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && results.length > 0 && (
        <>
          <p className="hint" style={{ marginBottom: 16 }} aria-live="polite">
            {results.length} de {total.toLocaleString('es-ES')} resultados
            {field === 'serie' && grouped ? ` · ${grouped.length} series detectadas` : ''}
          </p>

          {grouped ? (
            grouped.map((group) => (
              <div className="shelf" key={group.name}>
                <div className="shelf__head">
                  <h2 className="shelf__title">{group.name}</h2>
                  <span className="shelf__count">{group.items.length}</span>
                </div>
                <div className="grid">{group.items.map(renderCard)}</div>
              </div>
            ))
          ) : (
            <div className="grid">{results.map(renderCard)}</div>
          )}

          {results.length < total && (
            <div className="state__actions" style={{ marginTop: 30 }}>
              <button className="btn" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Cargando…' : 'Cargar más resultados'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
