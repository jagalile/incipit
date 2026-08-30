interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  inline?: boolean
}

export function EmptyState({ icon, title, description, action, inline }: EmptyStateProps) {
  return (
    <div className={`state${inline ? ' state--inline' : ''}`}>
      <span className="state__icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="state__actions">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = 'Algo ha ido mal',
  message,
  onRetry,
  hint,
}: {
  title?: string
  message: string
  onRetry?: () => void
  hint?: React.ReactNode
}) {
  return (
    <div className="state state--error" role="alert">
      <span className="state__icon" aria-hidden="true">
        ⚠
      </span>
      <h3>{title}</h3>
      <p>{message}</p>
      {(onRetry || hint) && (
        <div className="state__actions">
          {onRetry && (
            <button className="btn" onClick={onRetry}>
              Reintentar
            </button>
          )}
          {hint}
        </div>
      )}
    </div>
  )
}

/** Esqueletos con la misma silueta que los resultados reales: en cuadrícula
 *  o en fila, según qué vista esté activa -si no, el destello de carga
 *  anticipa una forma que el resultado real nunca tiene. */
export function CardsSkeleton({ count, view = 'grid' }: { count?: number; view?: 'grid' | 'list' }) {
  if (view === 'list') {
    return (
      <div className="list" aria-busy="true" aria-label="Cargando libros">
        {Array.from({ length: count ?? 6 }, (_, i) => (
          <div className="book-row" key={i}>
            <div className="book-row__coverwrap">
              <div className="skeleton skeleton--cover book-row__cover" />
            </div>
            <div className="book-row__right">
              <div className="book-row__body">
                <div className="skeleton skeleton--line" style={{ width: '70%', height: 14, marginBottom: 8 }} />
                <div className="skeleton skeleton--line short" />
              </div>
              <div className="skeleton" style={{ height: 31, borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="grid" aria-busy="true" aria-label="Cargando libros">
      {Array.from({ length: count ?? 12 }, (_, i) => (
        <div className="card" key={i}>
          <div className="skeleton skeleton--cover" />
          <div className="card__body">
            <div className="skeleton skeleton--line" style={{ marginBottom: 7 }} />
            <div className="skeleton skeleton--line short" />
          </div>
        </div>
      ))}
    </div>
  )
}
