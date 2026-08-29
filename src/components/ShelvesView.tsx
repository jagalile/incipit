import { useMemo, useState } from 'react'
import { STATUSES, STATUS_META, type BookStatus, type StoredBook } from '../types'
import type { LibraryApi } from '../hooks/useLibrary'
import { plural } from '../lib/plural'
import { BookCard } from './BookCard'
import { BookRow } from './BookRow'
import { SearchIcon } from './SearchIcon'
import { StatusPicker } from './StatusPicker'
import { EmptyState } from './States'
import { ViewToggle, type ResultsView } from './ViewToggle'
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

function sortBooks(list: StoredBook[], sort: Sort): StoredBook[] {
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

interface Props {
  library: LibraryApi
  onOpen: (seed: DetailSeed) => void
  onGoToSearch: () => void
  onGoToGoodreads: () => void
}

/** Portada de la app: no carga toda la biblioteca de golpe (cada portada es
 *  una petición de imagen) sino solo lo imprescindible -los estantes con su
 *  recuento, y "leyendo ahora" como acceso rápido-. El resto de libros se
 *  piden solo al entrar en su estante. */
export function ShelvesView({ library, onOpen, onGoToSearch, onGoToGoodreads }: Props) {
  const [openShelf, setOpenShelf] = useState<BookStatus | null>(null)
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<Sort>('reciente')
  // Fila por defecto, igual que en Buscar; es una preferencia de lectura, no
  // algo propio de un estante en concreto, así que no se resetea al cambiar
  // de uno a otro.
  const [view, setView] = useState<ResultsView>('list')

  const openShelfView = (status: BookStatus) => {
    setOpenShelf(status)
    setTerm('')
    setSort('reciente')
  }

  const query = normalize(term.trim())

  const shelfBooks = useMemo(() => {
    if (!openShelf) return []
    const matches = (book: StoredBook) =>
      !query ||
      normalize(book.title).includes(query) ||
      book.authors.some((a) => normalize(a).includes(query)) ||
      (book.series ? normalize(book.series).includes(query) : false)
    return sortBooks(library.byStatus[openShelf].filter(matches), sort)
  }, [openShelf, library.byStatus, query, sort])

  // Ya vienen ordenados por actividad reciente desde useLibrary.
  const readingNow = library.byStatus.leyendo

  const renderCard = (book: StoredBook) => {
    const Item = view === 'grid' ? BookCard : BookRow
    return (
      <Item
        key={book.id}
        title={book.title}
        authors={book.authors}
        thumbnail={book.thumbnail}
        series={book.series}
        seriesPosition={book.seriesPosition}
        year={book.year}
        pageCount={book.pageCount}
        isbn={book.isbn}
        status={book.status}
        rating={book.rating}
        onOpen={() => onOpen(book)}
        onRemove={() => library.remove(book.id)}
        footer={
          <StatusPicker
            compact
            idPrefix={book.id}
            value={book.status}
            onChange={(next) => library.setStatus(book.id, next)}
          />
        }
      />
    )
  }

  // Miniatura para "Leyendo ahora": solo portada, título y autor -para
  // gestionar el estado o ver más, la ficha completa está a un toque (onOpen).
  const renderQuickCard = (book: StoredBook) => (
    <BookCard
      key={book.id}
      compact
      title={book.title}
      authors={book.authors}
      thumbnail={book.thumbnail}
      status={book.status}
      onOpen={() => onOpen(book)}
    />
  )

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

  if (openShelf) {
    const meta = STATUS_META[openShelf]
    return (
      <section>
        <button type="button" className="btn btn--ghost shelf-back" onClick={() => setOpenShelf(null)}>
          ← Tus estantes
        </button>
        <div className="page-head">
          <h1>{meta.label}</h1>
          <p>
            {plural(library.byStatus[openShelf].length, 'libro', 'libros')} · {meta.description}
          </p>
        </div>

        <div className="toolbar">
          <div className="field">
            <span className="field__icon">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={term}
              placeholder={`Buscar en «${meta.label}» por título, autor o serie…`}
              aria-label={`Buscar en ${meta.label}`}
              onChange={(e) => setTerm(e.target.value)}
            />
            {term && (
              <button className="field__clear" onClick={() => setTerm('')} aria-label="Limpiar búsqueda">
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
          <ViewToggle value={view} onChange={setView} />
        </div>

        {shelfBooks.length === 0 ? (
          query ? (
            <EmptyState
              icon="🔍"
              title={`Nada coincide con «${term}»`}
              description="Prueba con otro título, autor o serie."
            />
          ) : (
            <EmptyState
              icon={meta.icon}
              title={`Nada en «${meta.label}»`}
              description={
                openShelf === 'leyendo'
                  ? 'Cuando empieces un libro, muévelo aquí para tenerlo a mano.'
                  : 'Los libros que marques con este estado aparecerán en este estante.'
              }
              action={
                <button className="btn btn--primary" onClick={onGoToSearch}>
                  Buscar un libro
                </button>
              }
            />
          )
        ) : (
          <div className={view === 'grid' ? 'grid' : 'list'}>{shelfBooks.map(renderCard)}</div>
        )}
      </section>
    )
  }

  const finishedThisYear = library.byStatus.leido.filter((b) =>
    b.finishedAt?.startsWith(String(new Date().getFullYear())),
  ).length

  return (
    <section>
      <div className="page-head">
        <h1>Tus estantes</h1>
        <p>
          {plural(library.books.length, 'libro guardado', 'libros guardados')}
          {finishedThisYear > 0 &&
            ` · ${plural(finishedThisYear, 'terminado', 'terminados')} en ${new Date().getFullYear()}`}
        </p>
      </div>

      <div className="shelf">
        <div className="shelf__head">
          <h2 className="shelf__title">Leyendo ahora</h2>
          <span className="shelf__count">{readingNow.length}</span>
          <span className="shelf__desc">Acceso rápido a lo que tienes entre manos.</span>
        </div>
        {readingNow.length === 0 ? (
          <EmptyState
            inline
            icon={STATUS_META.leyendo.icon}
            title="Nada en marcha"
            description="Cuando empieces un libro, márcalo como «Leyendo» para tenerlo aquí a mano."
          />
        ) : (
          <div className="grid grid--compact">{readingNow.map(renderQuickCard)}</div>
        )}
      </div>

      <div className="shelf-tiles">
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className="shelf-tile"
            onClick={() => openShelfView(status)}
          >
            <span className={`shelf-tile__icon badge--${status}`} aria-hidden="true">
              {STATUS_META[status].icon}
            </span>
            <span className="shelf-tile__count">{library.byStatus[status].length}</span>
            <span className="shelf-tile__label">{STATUS_META[status].label}</span>
            <span className="shelf-tile__desc">{STATUS_META[status].description}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
