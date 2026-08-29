import { useEffect, useRef, useState } from 'react'
import { CatalogError, findBookFor, getBook, refKey, type BookRef, type Provider } from '../lib/catalog'
import { STATUS_META, type BookResult, type BookStatus, type SearchField, type StoredBook } from '../types'
import type { LibraryApi } from '../hooks/useLibrary'
import { StatusPicker } from './StatusPicker'
import { ErrorState } from './States'

export interface DetailSeed {
  ref?: BookRef
  title: string
  authors: string[]
  thumbnail?: string
  isbn?: string
  year?: string
  pageCount?: number
  series?: string
  seriesPosition?: string
}

interface Props {
  seed: DetailSeed
  stored?: StoredBook
  library: LibraryApi
  provider: Provider
  apiKey?: string
  onSearch: (term: string, field: SearchField) => void
  onClose: () => void
}

/** Convierte la descripción (que llega con HTML ligero) en párrafos de texto plano. */
function toParagraphs(html?: string): string[] {
  if (!html) return []
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** Copia `over` sobre `base` ignorando lo que venga vacío. */
function overlay<T extends object>(base: T, over: Partial<T>): T {
  const out = { ...base }
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue
    ;(out as Record<string, unknown>)[key] = value
  }
  return out
}

function formatDate(iso?: string): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? undefined
    : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function BookDetail({ seed, stored, library, provider, apiKey, onSearch, onClose }: Props) {
  const [detail, setDetail] = useState<BookResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [brokenCover, setBrokenCover] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        // La referencia al catálogo es el único dato que guardamos para reconstruir la ficha.
        const found = seed.ref
          ? await getBook(seed.ref, { apiKey, signal: controller.signal })
          : await findBookFor(seed, { provider, apiKey, signal: controller.signal })
        if (controller.signal.aborted) return
        if (!found) {
          setError('No encontramos este libro en el catálogo. Puedes seguir usándolo en tus estantes.')
        } else {
          setDetail(found)
          // Cachea el vínculo con el catálogo para las próximas aperturas.
          if (stored && !stored.ref) {
            library.update(stored.id, {
              ref: found.ref,
              thumbnail: stored.thumbnail ?? found.thumbnail,
              pageCount: stored.pageCount ?? found.pageCount,
              isbn: stored.isbn ?? found.isbn,
            })
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof CatalogError ? err.message : 'No se pudo cargar la ficha del libro.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey(seed.ref), seed.title, attempt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // La ficha del catálogo completa (sinopsis, categorías, portada grande), pero el
  // título y el autor que ya conocemos mandan: Open Library devuelve el título
  // canónico de la obra, casi siempre en inglés, y no es el que el lector eligió.
  const view = overlay<DetailSeed & Partial<BookResult>>(
    { ...detail } as DetailSeed & Partial<BookResult>,
    seed,
  )
  const cover = stored?.thumbnail ?? detail?.thumbnail ?? seed.thumbnail
  const status = stored?.status
  const paragraphs = toParagraphs(detail?.description)

  const handleStatus = (next: BookStatus) => {
    if (stored) {
      library.setStatus(stored.id, next)
    } else {
      library.addFromSearch(
        {
          ref: detail?.ref ?? seed.ref ?? { provider, id: `manual-${Date.now()}` },
          title: view.title,
          authors: view.authors,
          series: view.series,
          seriesPosition: view.seriesPosition,
          thumbnail: cover,
          isbn: view.isbn,
          year: view.year,
          pageCount: view.pageCount,
        },
        next,
      )
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={view.title}
        ref={dialogRef}
        tabIndex={-1}
      >
        <button className="icon-btn dialog__close" onClick={onClose} aria-label="Cerrar ficha">
          ×
        </button>
        <div className="dialog__body">
          <div className="dialog__top">
            <div>
              <div className="dialog__cover">
                {cover && !brokenCover ? (
                  <img
                    src={cover}
                    alt={`Portada de ${view.title}`}
                    onError={() => setBrokenCover(true)}
                  />
                ) : (
                  <span className="card__fallback">
                    <span>{view.title}</span>
                  </span>
                )}
              </div>
            </div>
            <div>
              <h2>{view.title}</h2>
              <p className="dialog__author">
                {view.authors.length
                  ? view.authors.map((author, i) => (
                      <span key={author}>
                        {i > 0 && ', '}
                        <button
                          type="button"
                          className="link-inline"
                          onClick={() => onSearch(author, 'autor')}
                        >
                          {author}
                        </button>
                      </span>
                    ))
                  : 'Autor desconocido'}
              </p>

              {view.series && (
                <p className="card__series" style={{ marginTop: -6, marginBottom: 12 }}>
                  <button
                    type="button"
                    className="link-inline"
                    onClick={() => onSearch(view.series!, 'serie')}
                  >
                    {view.series}
                  </button>
                  {view.seriesPosition ? ` · volumen ${view.seriesPosition}` : ''}
                </p>
              )}

              <div className="meta">
                {view.year && <span>{view.year}</span>}
                {view.pageCount ? <span>{view.pageCount} págs.</span> : null}
                {detail?.publisher && <span>{detail.publisher}</span>}
                {view.isbn && <span>ISBN {view.isbn}</span>}
                {detail?.averageRating && <span>★ {detail.averageRating}</span>}
                {loading && <span aria-live="polite">Cargando ficha…</span>}
              </div>

              <StatusPicker value={status} onChange={handleStatus} idPrefix="detail" />

              {status && (
                <p className="hint" style={{ marginTop: 10 }}>
                  En «{STATUS_META[status].label}»
                  {formatDate(stored?.finishedAt) && ` · terminado el ${formatDate(stored?.finishedAt)}`}
                  {!stored?.finishedAt &&
                    formatDate(stored?.startedAt) &&
                    ` · empezado el ${formatDate(stored?.startedAt)}`}
                </p>
              )}

              {stored && (
                <button
                  className="link-danger"
                  onClick={() => {
                    if (confirm(`¿Quitar «${stored.title}» de tu biblioteca?`)) {
                      library.remove(stored.id)
                      onClose()
                    }
                  }}
                >
                  Quitar de mi biblioteca
                </button>
              )}
            </div>
          </div>

          {stored && (
            <>
              <div className="section">
                <h3 className="section__label">Tu valoración</h3>
                <div className="stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      data-on={n <= (stored.rating ?? 0)}
                      aria-label={`${n} de 5 estrellas`}
                      onClick={() =>
                        library.update(stored.id, { rating: stored.rating === n ? 0 : n })
                      }
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div className="section">
                <h3 className="section__label">Notas</h3>
                <textarea
                  className="textarea"
                  placeholder="Una cita, una impresión, por dónde vas…"
                  defaultValue={stored.notes ?? ''}
                  onBlur={(e) => library.update(stored.id, { notes: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="section">
            <h3 className="section__label">Sinopsis</h3>
            {loading && !detail ? (
              <div>
                <div className="skeleton skeleton--line" style={{ marginBottom: 9 }} />
                <div className="skeleton skeleton--line" style={{ marginBottom: 9 }} />
                <div className="skeleton skeleton--line short" />
              </div>
            ) : error ? (
              <ErrorState
                title="No se pudo cargar la ficha"
                message={error}
                onRetry={() => setAttempt((a) => a + 1)}
              />
            ) : paragraphs.length ? (
              <div className="description">
                {paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            ) : (
              <p className="hint">Este libro no tiene sinopsis en Google Books.</p>
            )}
          </div>

          {detail?.categories?.length ? (
            <div className="section">
              <h3 className="section__label">Categorías</h3>
              <div className="tags">
                {detail.categories.map((c) => (
                  <span className="tag" key={c}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {detail?.link && (
            <div className="dialog__footer">
              <a className="btn btn--sm" href={detail.link} target="_blank" rel="noreferrer">
                {detail.ref.provider === 'google' ? 'Ver en Google Books ↗' : 'Ver en Open Library ↗'}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
