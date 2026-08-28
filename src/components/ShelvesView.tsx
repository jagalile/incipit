import { useMemo, useState } from 'react'
import { STATUSES, STATUS_META, type BookStatus, type StoredBook } from '../types'
import type { LibraryApi } from '../hooks/useLibrary'
import { BookCard } from './BookCard'
import { SearchIcon } from './SearchIcon'
import { StatusPicker } from './StatusPicker'
import { EmptyState } from './States'
import type { DetailSeed } from './BookDetail'

type Sort = 'reciente' | 'titulo' | 'autor' | 'serie'

const SORTS: { id: Sort; label: string }[] = [
  { id: 'reciente', label: 'Actividad reciente' },
  { id: 'titulo', label: 'Título (A–Z)' },
  { id: 'autor', label: 'Autor (A–Z)' },
  { id: 'serie', label: 'Serie' },
]

const collator = new Intl.Collator('es', { sensitivity: 'base' })

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

interface Props {
  library: LibraryApi
  onOpen: (seed: DetailSeed) => void
  onGoToSearch: () => void
  onGoToGoodreads: () => void
}

export function ShelvesView({ library, onOpen, onGoToSearch, onGoToGoodreads }: Props) {
  const [filter, setFilter] = useState<BookStatus | 'todos'>('todos')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<Sort>('reciente')

  const query = normalize(term.trim())

  const visible = useMemo(() => {
    const matches = (book: StoredBook) =>
      !query ||
      normalize(book.title).includes(query) ||
      book.authors.some((a) => normalize(a).includes(query)) ||
      (book.series ? normalize(book.series).includes(query) : false)

    const sorted = (list: StoredBook[]) => {
      const copy = [...list]
      switch (sort) {
        case 'titulo':
          return copy.sort((a, b) => collator.compare(a.title, b.title))
        case 'autor':
          return copy.sort((a, b) => collator.compare(a.authors[0] ?? 'zzz', b.authors[0] ?? 'zzz'))
        case 'serie':
          return copy.sort(
            (a, b) =>
              collator.compare(a.series ?? 'zzz', b.series ?? 'zzz') ||
              Number(a.seriesPosition ?? 99) - Number(b.seriesPosition ?? 99),
          )
        default:
          return copy.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      }
    }

    const result = {} as Record<BookStatus, StoredBook[]>
    for (const status of STATUSES) {
      result[status] = sorted(library.byStatus[status].filter(matches))
    }
    return result
  }, [library.byStatus, query, sort])

  const shown = filter === 'todos' ? STATUSES : [filter]
  const totalVisible = shown.reduce((n, s) => n + visible[s].length, 0)
  const finishedThisYear = library.byStatus.leido.filter(
    (b) => b.finishedAt?.startsWith(String(new Date().getFullYear())),
  ).length

  if (library.books.length === 0) {
    return (
      <section>
        <div className="page-head">
          <h1>Tus estantes</h1>
          <p>Todo lo que guardes vive en este navegador, sin cuentas ni servidores.</p>
        </div>
        <EmptyState
          icon="📚"
          title="Tu biblioteca está vacía"
          description="Empieza buscando un libro o trae de una vez todo tu historial desde Goodreads."
          action={
            <>
              <button className="btn btn--primary" onClick={onGoToSearch}>
                Buscar un libro
              </button>
              <button className="btn" onClick={onGoToGoodreads}>
                Importar de Goodreads
              </button>
            </>
          }
        />
      </section>
    )
  }

  return (
    <section>
      <div className="page-head">
        <h1>Tus estantes</h1>
        <p>
          {library.books.length} libros guardados
          {finishedThisYear > 0 && ` · ${finishedThisYear} terminados en ${new Date().getFullYear()}`}
        </p>
      </div>

      <div className="stats">
        <button
          className="stat"
          aria-pressed={filter === 'todos'}
          onClick={() => setFilter('todos')}
        >
          <span className="stat__value">{library.books.length}</span>
          <span className="stat__label">Todos</span>
        </button>
        {STATUSES.map((status) => (
          <button
            key={status}
            className="stat"
            aria-pressed={filter === status}
            onClick={() => setFilter(filter === status ? 'todos' : status)}
          >
            <span className="stat__value">{library.byStatus[status].length}</span>
            <span className="stat__label">{STATUS_META[status].label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="field">
          <span className="field__icon">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={term}
            placeholder="Filtrar por título, autor o serie…"
            aria-label="Filtrar mis libros"
            onChange={(e) => setTerm(e.target.value)}
          />
          {term && (
            <button className="field__clear" onClick={() => setTerm('')} aria-label="Limpiar filtro">
              ×
            </button>
          )}
        </div>
        <label className="sr-only" htmlFor="sort">
          Ordenar por
        </label>
        <select
          id="sort"
          className="select"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {query && totalVisible === 0 && (
        <EmptyState
          icon="🔍"
          title={`Nada coincide con «${term}»`}
          description="Ese libro no está todavía en tus estantes. Búscalo en Google Books para añadirlo."
          action={
            <button className="btn btn--primary" onClick={onGoToSearch}>
              Buscarlo y añadirlo
            </button>
          }
        />
      )}

      {shown.map((status) => {
        const books = visible[status]
        if (query && books.length === 0) return null
        return (
          <div className="shelf" key={status}>
            <div className="shelf__head">
              <h2 className="shelf__title">{STATUS_META[status].label}</h2>
              <span className="shelf__count">{books.length}</span>
              <span className="shelf__desc">{STATUS_META[status].description}</span>
            </div>
            {books.length === 0 ? (
              <EmptyState
                inline
                icon={STATUS_META[status].icon}
                title={`Nada en «${STATUS_META[status].label}»`}
                description={
                  status === 'leyendo'
                    ? 'Cuando empieces un libro, muévelo aquí para tenerlo a mano.'
                    : 'Los libros que marques con este estado aparecerán en este estante.'
                }
              />
            ) : (
              <div className="grid">
                {books.map((book) => (
                  <BookCard
                    key={book.id}
                    title={book.title}
                    authors={book.authors}
                    thumbnail={book.thumbnail}
                    series={book.series}
                    seriesPosition={book.seriesPosition}
                    year={book.year}
                    status={book.status}
                    rating={book.rating}
                    onOpen={() => onOpen(book)}
                    footer={
                      <StatusPicker
                        compact
                        idPrefix={book.id}
                        value={book.status}
                        onChange={(next) => library.setStatus(book.id, next)}
                      />
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
