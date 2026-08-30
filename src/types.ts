import type { BookRef, Provider } from './lib/catalogCore'

export type BookStatus = 'pendiente' | 'leyendo' | 'leido' | 'cancelado'

export const STATUSES: BookStatus[] = ['leyendo', 'pendiente', 'leido', 'cancelado']

/** El icono de cada estado vive en <StatusIcon> (component/SVG), no aquí:
 *  este archivo no es .tsx y no puede llevar JSX. */
export const STATUS_META: Record<BookStatus, { label: string; short: string; description: string }> = {
  leyendo: {
    label: 'Leyendo',
    short: 'Leyendo',
    description: 'Lecturas en curso ahora mismo.',
  },
  pendiente: {
    label: 'Pendientes',
    short: 'Pendiente',
    description: 'Libros que quieres leer más adelante.',
  },
  leido: {
    label: 'Leídos',
    short: 'Leído',
    description: 'Lecturas terminadas.',
  },
  cancelado: {
    label: 'Abandonados',
    short: 'Abandonado',
    description: 'Los que decidiste no terminar.',
  },
}

/**
 * Lo que se guarda en localStorage. Es deliberadamente ligero: `ref` (el
 * puntero al catálogo -Google Books u Open Library, el que sea-) basta para
 * recuperar la ficha completa bajo demanda; el resto son los mínimos para
 * pintar los estantes sin red.
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
  /** Cómo entró el libro a la biblioteca -no de qué catálogo salen sus datos
   *  ahora mismo, eso ya lo dice `ref.provider` y puede cambiar si se
   *  reenlaza con otro proveedor-. */
  source: 'busqueda' | 'goodreads' | 'manual'
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
