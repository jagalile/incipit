import type { BookStatus } from '../types'

interface Props {
  status: BookStatus
  size?: number
}

/** Un icono por estado, todos de la misma familia -objetos de lectura, no
 *  símbolos sueltos-: libro abierto, marcapáginas, libro cerrado y libro
 *  cerrado con una X (abandonado es "iba a leerlo, ya no": el mismo libro
 *  cerrado que "leído", tachado). Trazos de Lucide (MIT), el tamaño de
 *  trazo ajustado al peso del resto de iconos de la app. */
export function StatusIcon({ status, size = 15 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  }
  switch (status) {
    case 'leyendo':
      return (
        <svg {...common}>
          <path d="M12 5v16" />
          <path d="M20.001 19A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2 5 5 0 0 1 4-2z" />
        </svg>
      )
    case 'pendiente':
      return (
        <svg {...common}>
          <path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z" />
        </svg>
      )
    case 'leido':
      return (
        <svg {...common}>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
        </svg>
      )
    case 'cancelado':
      return (
        <svg {...common}>
          <path d="m14.5 7.5-5 5" />
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
          <path d="m9.5 7.5 5 5" />
        </svg>
      )
  }
}
