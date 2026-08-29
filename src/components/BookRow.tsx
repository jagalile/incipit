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
  onOpen: () => void
  onRemove?: () => void
  footer?: React.ReactNode
}

/** La misma ficha que BookCard, pero en filas: portada fija a la izquierda;
 *  a la derecha, título/autor/datos y, debajo, el selector de estado
 *  ocupando ese mismo ancho de columna (no el ancho de la portada). */
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
  onOpen,
  onRemove,
  footer,
}: Props) {
  const [brokenCover, setBrokenCover] = useState(false)
  const author = authors.length ? authors.join(', ') : 'Autor desconocido'
  // Dos líneas de datos: año y serie primero, páginas e ISBN debajo.
  const dateAndSeries = [year, series ? `${series}${seriesPosition ? ` · vol. ${seriesPosition}` : ''}` : null]
    .filter(Boolean)
    .join(' · ')
  const bibliographic = [pageCount ? `${pageCount} págs.` : null, isbn ? `ISBN ${isbn}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <article className="book-row">
      <button
        type="button"
        className="book-row__cover"
        onClick={onOpen}
        aria-label={`Ver ficha de ${title}`}
      >
        {thumbnail && !brokenCover ? (
          <img src={thumbnail} alt="" loading="lazy" onError={() => setBrokenCover(true)} />
        ) : (
          <span className="book-row__cover-fallback" aria-hidden="true">
            {title.slice(0, 1)}
          </span>
        )}
      </button>

      <div className="book-row__right">
        <button type="button" className="book-row__body" onClick={onOpen}>
          <h3 className="book-row__title">{title}</h3>
          <p className="book-row__author">{author}</p>
          {dateAndSeries && <p className="book-row__meta">{dateAndSeries}</p>}
          {bibliographic && <p className="book-row__meta">{bibliographic}</p>}
          {!!rating && (
            <p className="card__rating" aria-label={`${rating} de 5 estrellas`}>
              {'★'.repeat(rating)}
              <span style={{ opacity: 0.3 }}>{'★'.repeat(5 - rating)}</span>
            </p>
          )}
        </button>

        <div className="book-row__actions">
          {status && (
            <span className={`badge badge--${status} book-row__badge`}>
              <em style={{ fontStyle: 'normal' }} aria-hidden="true">
                {STATUS_META[status].icon}
              </em>
              {STATUS_META[status].short}
            </span>
          )}
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
      </div>
    </article>
  )
}
