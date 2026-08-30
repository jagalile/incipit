import type { Settings, StoredBook } from '../types'
import { DEFAULT_PROXY } from './goodreads'

const LIBRARY_KEY = 'incipit.library.v1'
const SETTINGS_KEY = 'incipit.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  goodreadsUserId: '',
  corsProxy: DEFAULT_PROXY,
  theme: 'auto',
  provider: 'openlibrary',
  googleApiKey: '',
}

/** El acceso a localStorage falla en modo privado o con cookies bloqueadas. */
function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWrite(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function loadLibrary(): StoredBook[] {
  const raw = safeRead(LIBRARY_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((b): b is StoredBook => Boolean(b && b.id && b.title && b.status))
      .map(migrate)
  } catch {
    return []
  }
}

/** Las primeras versiones guardaban `volumeId` porque Google Books era la única fuente. */
function migrate(book: StoredBook & { volumeId?: string }): StoredBook {
  let next = book
  if (!next.ref && next.volumeId) {
    const { volumeId, ...rest } = next
    next = { ...rest, ref: { provider: 'google', id: volumeId } }
  }
  // `source` marcaba "de búsqueda" con el valor 'google' porque antes ese
  // era el único catálogo -desde que Open Library es el proveedor por
  // defecto, ese valor mentía sobre el origen real más a menudo que decía
  // la verdad-. El cast es porque JSON.parse no sabe que ese valor legado ya
  // no existe en el tipo actual.
  if ((next.source as string) === 'google') {
    next = { ...next, source: 'busqueda' }
  }
  return next
}

export function saveLibrary(books: StoredBook[]): boolean {
  return safeWrite(LIBRARY_KEY, JSON.stringify(books))
}

export function loadSettings(): Settings {
  const raw = safeRead(SETTINGS_KEY)
  if (!raw) return DEFAULT_SETTINGS
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings): boolean {
  return safeWrite(SETTINGS_KEY, JSON.stringify(settings))
}

export function exportLibrary(books: StoredBook[]): void {
  const blob = new Blob([JSON.stringify(books, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `incipit-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
