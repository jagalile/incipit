import { STATUSES, STATUS_META, type BookStatus } from '../types'

interface Props {
  value?: BookStatus
  onChange: (status: BookStatus) => void
  compact?: boolean
  idPrefix: string
}

export function StatusPicker({ value, onChange, compact, idPrefix }: Props) {
  return (
    <div
      className={`status-picker${compact ? ' status-picker--compact' : ''}`}
      role="group"
      aria-label="Estado de lectura"
    >
      {STATUSES.map((status) => {
        const meta = STATUS_META[status]
        return (
          <button
            key={`${idPrefix}-${status}`}
            type="button"
            data-status={status}
            aria-pressed={value === status}
            title={meta.short}
            onClick={(e) => {
              e.stopPropagation()
              onChange(status)
            }}
          >
            <em style={{ fontStyle: 'normal' }} aria-hidden="true">
              {meta.icon}
            </em>
            <span>{meta.short}</span>
          </button>
        )
      })}
    </div>
  )
}
