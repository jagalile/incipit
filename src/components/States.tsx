interface EmptyStateProps {
  icon: string
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

/** Rejilla de esqueletos con la misma silueta que las tarjetas reales. */
export function CardsSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid" aria-busy="true" aria-label="Cargando libros">
      {Array.from({ length: count }, (_, i) => (
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
