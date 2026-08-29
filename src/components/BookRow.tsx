import { useState } from 'react'
import { STATUS_META, type BookStatus } from '../types'

interface Props {
  title: string
  authors: string[]
  thumbnail?: string
  series?: string
  seriesPosition?: string
  year?: string
  pageCount?: number
  isbn?: string
  status?: BookStatus
  rating?: number
  /** Sinopsis ya resuelta. `undefined` mientras se está cargando (o si no aplica). */
  description?: string
  descriptionLoading?: boolean
  onOpen: () => void
  onRemove?: () => void
  footer?: React.ReactNode
}

/** La misma ficha que BookCard, pero en una fila horizontal con más detalle. */
export function BookRow({
  title,
  authors,
  thumbnail,
  series,
  seriesPosition,
  year,
  pageCount,
  isbn,
  status,
  rating,
  description,
  descriptionLoading,
  onOpen,
  onRemove,
  footer,
}: Props) {
  const [brokenCover, setBrokenCover] = useState(false)
  const author = authors.length ? authors.join(', ') : 'Autor desconocido'
  const meta = [pageCount ? `${pageCount} págs.` : null, isbn ? `ISBN ${isbn}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <article className="book-row">
      <button type="button" className="book-row__cover" onClick={onOpen} aria-label={`Ver ficha de ${title}`}>
        {thumbnail && !brokenCover ? (
          <img src={thumbnail} alt="" loading="lazy" onError={() => setBrokenCover(true)} />
        ) : (
          <span className="book-row__cover-fallback" aria-hidden="true">
            {title.slice(0, 1)}
          </span>
        )}
      </button>

      <button type="button" className="book-row__body" onClick={onOpen}>
        <h3 className="book-row__title">{title}</h3>
        <p className="book-row__author">{author}</p>
        <p className="book-row__series">
          {series ? `${series}${seriesPosition ? ` · vol. ${seriesPosition}` : ''}` : (year ?? ' ')}
        </p>
        {meta && <p className="book-row__meta">{meta}</p>}
        {!!rating && (
          <p className="card__rating" aria-label={`${rating} de 5 estrellas`}>
            {'★'.repeat(rating)}
            <span style={{ opacity: 0.3 }}>{'★'.repeat(5 - rating)}</span>
          </p>
        )}
        {descriptionLoading && !description && (
          <div className="book-row__excerpt-loading" aria-hidden="true">
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line short" />
          </div>
        )}
        {description && <p className="book-row__excerpt">{description}</p>}
      </button>

      {status && (
        <span className={`badge badge--${status} book-row__badge`}>
          <em style={{ fontStyle: 'normal' }} aria-hidden="true">
            {STATUS_META[status].icon}
          </em>
          {STATUS_META[status].short}
        </span>
      )}

      <div className="book-row__actions">
        {footer}
        {onRemove && (
          <button
            type="button"
            className="icon-btn book-row__remove"
            aria-label={`Quitar «${title}» de tu biblioteca`}
            title="Quitar de tu biblioteca"
            onClick={() => {
              if (confirm(`¿Quitar «${title}» de tu biblioteca?`)) onRemove()
            }}
          >
            ×
          </button>
        )}
      </div>
    </article>
  )
}
