import type { BookRef, Provider } from './lib/catalogCore'

export type BookStatus = 'pendiente' | 'leyendo' | 'leido' | 'cancelado'

export const STATUSES: BookStatus[] = ['leyendo', 'pendiente', 'leido', 'cancelado']

export const STATUS_META: Record<
  BookStatus,
  { label: string; short: string; icon: string; description: string }
> = {
  leyendo: {
    label: 'Leyendo',
    short: 'Leyendo',
    icon: '▶',
    description: 'Lecturas en curso ahora mismo.',
  },
  pendiente: {
    label: 'Pendientes',
    short: 'Pendiente',
    icon: '⚑',
    description: 'Libros que quieres leer más adelante.',
  },
  leido: {
    label: 'Leídos',
    short: 'Leído',
    icon: '✓',
    description: 'Lecturas terminadas.',
  },
  cancelado: {
    label: 'Abandonados',
    short: 'Abandonado',
    icon: '✕',
    description: 'Los que decidiste no terminar.',
  },
}

/**
 * Lo que se guarda en localStorage. Es deliberadamente ligero: el identificador
 * de Google Books (`volumeId`) basta para recuperar la ficha completa bajo demanda;
 * el resto son los mínimos para pintar los estantes sin red.
 */
export interface StoredBook {
  /** Clave interna estable: `<proveedor>:<id>`, o `gr:<goodreadsId>` si aún no hay match. */
  id: string
  /** Puntero a la ficha completa en el catálogo. Es el único dato que hace falta guardar. */
  ref?: BookRef
  goodreadsId?: string
  title: string
  authors: string[]
  series?: string
  seriesPosition?: string
  thumbnail?: string
  isbn?: string
  year?: string
  pageCount?: number
  status: BookStatus
  /** Valoración personal 0-5 (0 = sin valorar). */
  rating: number
  notes?: string
  addedAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  source: 'google' | 'goodreads' | 'manual'
}

/** Resultado normalizado de una búsqueda, venga del catálogo que venga. */
export interface BookResult {
  ref: BookRef
  title: string
  subtitle?: string
  authors: string[]
  series?: string
  seriesPosition?: string
  thumbnail?: string
  isbn?: string
  year?: string
  pageCount?: number
  publisher?: string
  language?: string
  categories?: string[]
  description?: string
  averageRating?: number
  link?: string
}

export interface Settings {
  goodreadsUserId: string
  corsProxy: string
  theme: 'light' | 'dark' | 'auto'
  lastSyncAt?: string
  /** Catálogo del que salen las búsquedas y las fichas. */
  provider: Provider
  /** Clave propia de Google Books, obligatoria desde que cerró el acceso anónimo. */
  googleApiKey: string
}

export type SearchField = 'todo' | 'titulo' | 'autor' | 'serie'
