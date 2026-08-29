import { useState } from 'react'
import { STATUS_META, type BookStatus } from '../types'

interface Props {
  title: string
  authors: string[]
  thumbnail?: string
  series?: string
  seriesPosition?: string
  year?: string
  status?: BookStatus
  rating?: number
  onOpen: () => void
  onRemove?: () => void
  footer?: React.ReactNode
}

/** La misma ficha que BookCard, pero en una fila horizontal compacta. */
export function BookRow({
  title,
  authors,
  thumbnail,
  series,
  seriesPosition,
  year,
  status,
  rating,
  onOpen,
  onRemove,
  footer,
}: Props) {
  const [brokenCover, setBrokenCover] = useState(false)
  const author = authors.length ? authors.join(', ') : 'Autor desconocido'

  return (
    <article className="row">
      <button type="button" className="row__cover" onClick={onOpen} aria-label={`Ver ficha de ${title}`}>
        {thumbnail && !brokenCover ? (
          <img src={thumbnail} alt="" loading="lazy" onError={() => setBrokenCover(true)} />
        ) : (
          <span className="row__cover-fallback" aria-hidden="true">
            {title.slice(0, 1)}
          </span>
        )}
      </button>

      <button type="button" className="row__body" onClick={onOpen}>
        <h3 className="row__title">{title}</h3>
        <p className="row__author">{author}</p>
        <p className="row__series">
          {series ? `${series}${seriesPosition ? ` · vol. ${seriesPosition}` : ''}` : (year ?? ' ')}
        </p>
        {!!rating && (
          <p className="card__rating" aria-label={`${rating} de 5 estrellas`}>
            {'★'.repeat(rating)}
            <span style={{ opacity: 0.3 }}>{'★'.repeat(5 - rating)}</span>
          </p>
        )}
      </button>

      {status && (
        <span className={`badge badge--${status} row__badge`}>
          <em style={{ fontStyle: 'normal' }} aria-hidden="true">
            {STATUS_META[status].icon}
          </em>
          {STATUS_META[status].short}
        </span>
      )}

      <div className="row__actions">
        {footer}
        {onRemove && (
          <button
            type="button"
            className="icon-btn row__remove"
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
