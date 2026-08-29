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

export function BookCard({
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
  // Mismo criterio que en las filas: año y serie juntos en una línea,
  // páginas e ISBN en la siguiente -antes la serie tapaba el año en vez de
  // acompañarlo, y "p." decía algo distinto que "págs." en la otra vista-.
  const dateAndSeries = [year, series ? `${series}${seriesPosition ? ` · vol. ${seriesPosition}` : ''}` : null]
    .filter(Boolean)
    .join(' · ')
  const bibliographic = [pageCount ? `${pageCount} págs.` : null, isbn ? `ISBN ${isbn}` : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <article className="card">
      <button
        type="button"
        className="card__cover"
        onClick={onOpen}
        aria-label={`Ver ficha de ${title}`}
      >
        {thumbnail && !brokenCover ? (
          // Open Library devuelve un marcador de posición vacío cuando la obra no
          // tiene portada: si la imagen falla, se pinta la cubierta tipográfica.
          <img src={thumbnail} alt="" loading="lazy" onError={() => setBrokenCover(true)} />
        ) : (
          <span className="card__fallback">
            <span>{title}</span>
            <small>{author}</small>
          </span>
        )}
        {status && (
          <span className={`card__badge badge--${status}`}>
            <em style={{ fontStyle: 'normal' }} aria-hidden="true">
              {STATUS_META[status].icon}
            </em>
            {STATUS_META[status].short}
          </span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          className="card__remove"
          aria-label={`Quitar «${title}» de tu biblioteca`}
          title="Quitar de tu biblioteca"
          onClick={(e) => {
            e.stopPropagation()
            if (confirm(`¿Quitar «${title}» de tu biblioteca?`)) onRemove()
          }}
        >
          ×
        </button>
      )}
      <div className="card__body">
        <h3 className="card__title">{title}</h3>
        <p className="card__author">{author}</p>
        {/* Siempre una línea, aunque no haya ni serie ni año: si a veces está y a
            veces no, el pie de la tarjeta queda a distinta altura entre vecinas. */}
        <p className="card__series">{dateAndSeries || ' '}</p>
        {/* Igual de siempre-presente que la línea de arriba, por la misma razón. */}
        <p className="card__meta">{bibliographic || ' '}</p>
        {!!rating && (
          <p className="card__rating" aria-label={`${rating} de 5 estrellas`}>
            {'★'.repeat(rating)}
            <span style={{ opacity: 0.3 }}>{'★'.repeat(5 - rating)}</span>
          </p>
        )}
      </div>
      {footer}
    </article>
  )
}
