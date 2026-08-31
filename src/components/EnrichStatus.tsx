import type { EnrichApi } from '../hooks/useEnrichment'

/** Franja flotante, visible en cualquier pestaña, encima de la barra de
 *  navegación: progreso mientras "Buscar portadas y fichas" está en marcha,
 *  y un resumen que se cierra solo al terminar -no bloquea nada del resto
 *  de la app mientras tanto-. */
export function EnrichStatus({ enrich }: { enrich: EnrichApi }) {
  if (enrich.status === 'idle') return null

  return (
    <div className="enrich-status" role="status">
      <div className="wrap enrich-status__inner">
        {enrich.status === 'running' ? (
          <>
            <div className="enrich-status__row">
              <span className="enrich-status__text">
                {enrich.label}… {enrich.progress}%
              </span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={enrich.cancel}>
                Cancelar
              </button>
            </div>
            <div className="progress">
              <div className="progress__bar" style={{ width: `${enrich.progress}%` }} />
            </div>
          </>
        ) : (
          <div className="enrich-status__row">
            <span aria-hidden="true">{enrich.cancelled ? '⚠' : '✓'}</span>
            <span className="enrich-status__text">
              {enrich.cancelled ? 'Cancelado: ' : ''}
              {enrich.matched} de {enrich.done} {enrich.done === 1 ? 'libro enlazado' : 'libros enlazados'}.
            </span>
            <button
              type="button"
              className="icon-btn enrich-status__dismiss"
              aria-label="Cerrar aviso"
              onClick={enrich.dismiss}
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
