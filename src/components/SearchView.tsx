import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CatalogError, PROVIDERS, getExcerpt, refKey, searchBooks, type Provider } from '../lib/catalog'
import { seriesKey } from '../lib/series'
import { stripHtml, truncate } from '../lib/text'
import type { BookResult, SearchField } from '../types'
import type { LibraryApi } from '../hooks/useLibrary'
import { useDebounced } from '../hooks/useDebounced'
import { plural } from '../lib/plural'
import { BookCard } from './BookCard'
import { BookRow } from './BookRow'
import { SearchIcon } from './SearchIcon'
import { StatusPicker } from './StatusPicker'
import { CardsSkeleton, EmptyState, ErrorState } from './States'
import { ViewToggle, type ResultsView } from './ViewToggle'
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
  provider: Provider
  apiKey?: string
  onOpen: (seed: DetailSeed) => void
  onGoToSettings: () => void
  /** Consulta que llega desde fuera (p. ej. al pulsar un autor en una ficha). */
  pendingQuery?: { term: string; field: SearchField } | null
  onConsumePending?: () => void
}

export function SearchView({
  library,
  provider,
  apiKey,
  onOpen,
  onGoToSettings,
  pendingQuery,
  onConsumePending,
}: Props) {
  const [term, setTerm] = useState('')
  const [field, setField] = useState<SearchField>('todo')
  const [onlySpanish, setOnlySpanish] = useState(true)
  const [view, setView] = useState<ResultsView>('grid')
  const [results, setResults] = useState<BookResult[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<string>('server')
  const [attempt, setAttempt] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const query = useDebounced(term.trim())

  useEffect(() => {
    if (!pendingQuery) return
    setTerm(pendingQuery.term)
    setField(pendingQuery.field)
    onConsumePending?.()
  }, [pendingQuery, onConsumePending])

  // Sinopsis para la vista de filas. Google Books ya la trae en la propia
  // búsqueda; Open Library no, así que hay que pedirla aparte — pero solo
  // mientras se está viendo en filas, y con un tope de peticiones a la vez
  // para no lanzar 24 de golpe contra la API.
  const [excerpts, setExcerpts] = useState<Record<string, string | null>>({})
  useEffect(() => {
    if (view !== 'list') return
    const pending = results.filter(
      (b) => b.ref.provider === 'openlibrary' && !b.description && !(refKey(b.ref) in excerpts),
    )
    if (!pending.length) return
    let cancelled = false
    const CONCURRENCY = 3
    let cursor = 0
    const worker = async () => {
      while (!cancelled && cursor < pending.length) {
        const book = pending[cursor++]
        let value: string | null = null
        try {
          const desc = await getExcerpt(book.ref)
          value = desc ? truncate(stripHtml(desc)) : null
        } catch {
          value = null
        }
        if (!cancelled) setExcerpts((prev) => ({ ...prev, [refKey(book.ref)]: value }))
      }
    }
    Promise.all(Array.from({ length: CONCURRENCY }, worker)).catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, results])

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
    searchBooks(query, field, { provider, apiKey, signal: controller.signal, onlySpanish })
      .then(({ items, total: t }) => {
        if (controller.signal.aborted) return
        setResults(items)
        setTotal(t)
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === 'AbortError') return
        setError(err instanceof CatalogError ? err.message : 'No se pudo completar la búsqueda.')
        setErrorKind(err instanceof CatalogError ? err.kind : 'server')
        setResults([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [query, field, onlySpanish, provider, apiKey, attempt])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const { items } = await searchBooks(query, field, {
        provider,
        apiKey,
        startIndex: results.length,
        onlySpanish,
      })
      setResults((prev) => {
        const seen = new Set(prev.map((b) => refKey(b.ref)))
        return [...prev, ...items.filter((b) => !seen.has(refKey(b.ref)))]
      })
    } catch {
      setError('No se pudieron cargar más resultados.')
    } finally {
      setLoadingMore(false)
    }
  }, [query, field, results.length, onlySpanish, provider, apiKey])

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

  const renderCard = (book: BookResult) => {
    const key = refKey(book.ref)
    const removeFromLibrary = library.statusOf(book.ref)
      ? () => {
          const stored = library.books.find((b) => refKey(b.ref) === key)
          if (stored) library.remove(stored.id)
        }
      : undefined
    const footer = (
      <StatusPicker
        compact={view === 'grid'}
        idPrefix={key}
        value={library.statusOf(book.ref)}
        onChange={(status) => library.addFromSearch(book, status)}
      />
    )

    if (view === 'grid') {
      return (
        <BookCard
          key={key}
          title={book.title}
          authors={book.authors}
          thumbnail={book.thumbnail}
          series={book.series}
          seriesPosition={book.seriesPosition}
          year={book.year}
          pageCount={book.pageCount}
          isbn={book.isbn}
          status={library.statusOf(book.ref)}
          onOpen={() => onOpen(book)}
          onRemove={removeFromLibrary}
          footer={footer}
        />
      )
    }

    // Google ya trae la sinopsis en la propia búsqueda; para Open Library se
    // resuelve aparte y llega vía `excerpts`. Ausente de ese registro = aún sin
    // pedir; `null` = ya se pidió y no había sinopsis (distinto de "cargando").
    const resolved = key in excerpts ? excerpts[key] : undefined
    const excerpt = book.description ? truncate(stripHtml(book.description)) : (resolved ?? undefined)
    const stillLoading = !book.description && book.ref.provider === 'openlibrary' && !(key in excerpts)
    return (
      <BookRow
        key={key}
        title={book.title}
        authors={book.authors}
        thumbnail={book.thumbnail}
        series={book.series}
        seriesPosition={book.seriesPosition}
        year={book.year}
        pageCount={book.pageCount}
        isbn={book.isbn}
        status={library.statusOf(book.ref)}
        description={excerpt}
        descriptionLoading={stillLoading}
        onOpen={() => onOpen(book)}
        onRemove={removeFromLibrary}
        footer={footer}
      />
    )
  }

  return (
    <section>
      <div className="page-head">
        <h1>Buscar libros</h1>
        <p>
          Resultados de {PROVIDERS.find((p) => p.id === provider)?.label ?? 'el catálogo'}. Elige el
          estante desde la propia tarjeta y el libro se guarda en tu biblioteca.
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
        <ViewToggle value={view} onChange={setView} />
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
          title={errorKind === 'offline' ? 'Sin conexión' : 'No se pudo buscar'}
          message={error}
          onRetry={errorKind === 'offline' ? undefined : () => setAttempt((a) => a + 1)}
          hint={
            errorKind === 'quota' || errorKind === 'auth' ? (
              <button className="btn btn--primary" onClick={onGoToSettings}>
                Cambiar de catálogo
              </button>
            ) : onlySpanish ? (
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
            {results.length} de {plural(total, 'resultado', 'resultados')}
            {field === 'serie' && grouped
              ? ` · ${plural(grouped.length, 'serie detectada', 'series detectadas')}`
              : ''}
          </p>

          {grouped ? (
            grouped.map((group) => (
              <div className="shelf" key={group.name}>
                <div className="shelf__head">
                  <h2 className="shelf__title">{group.name}</h2>
                  <span className="shelf__count">{group.items.length}</span>
                </div>
                <div className={view === 'grid' ? 'grid' : 'list'}>{group.items.map(renderCard)}</div>
              </div>
            ))
          ) : (
            <div className={view === 'grid' ? 'grid' : 'list'}>{results.map(renderCard)}</div>
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
