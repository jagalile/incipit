export type ResultsView = 'grid' | 'list'

interface Props {
  value: ResultsView
  onChange: (value: ResultsView) => void
}

/** Cuadrícula ↔ filas: los mismos resultados, dos formas de leerlos. */
export function ViewToggle({ value, onChange }: Props) {
  return (
    <div className="view-toggle" role="group" aria-label="Forma de mostrar los resultados">
      <button
        type="button"
        aria-pressed={value === 'grid'}
        aria-label="Ver en cuadrícula"
        title="Cuadrícula"
        onClick={() => onChange('grid')}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="6" height="6" rx="1.1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="9" y="1" width="6" height="6" rx="1.1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="1" y="9" width="6" height="6" rx="1.1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="9" y="9" width="6" height="6" rx="1.1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      <button
        type="button"
        aria-pressed={value === 'list'}
        aria-label="Ver en filas"
        title="Filas"
        onClick={() => onChange('list')}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="1.7" width="14" height="2.6" rx="1" fill="currentColor" />
          <rect x="1" y="6.7" width="14" height="2.6" rx="1" fill="currentColor" />
          <rect x="1" y="11.7" width="14" height="2.6" rx="1" fill="currentColor" />
        </svg>
      </button>
    </div>
  )
}
