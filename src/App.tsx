import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLibrary } from './hooks/useLibrary'
import { loadSettings, saveSettings } from './lib/storage'
import type { Settings } from './types'
import { BookDetail, type DetailSeed } from './components/BookDetail'
import { GoodreadsView } from './components/GoodreadsView'
import { SearchView } from './components/SearchView'
import { ShelvesView } from './components/ShelvesView'

type Tab = 'estantes' | 'buscar' | 'goodreads'

const TABS: { id: Tab; label: string }[] = [
  { id: 'estantes', label: 'Mis estantes' },
  { id: 'buscar', label: 'Buscar' },
  { id: 'goodreads', label: 'Goodreads' },
]

const THEME_CYCLE = { auto: 'light', light: 'dark', dark: 'auto' } as const
const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' } as const
const THEME_LABEL = { auto: 'automático', light: 'claro', dark: 'oscuro' } as const

export default function App() {
  const library = useLibrary()
  const [tab, setTab] = useState<Tab>('estantes')
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [detail, setDetail] = useState<(DetailSeed & { id?: string }) | null>(null)

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  // El tema "auto" sigue al sistema; los otros dos fijan el atributo en la raíz.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const resolved = settings.theme === 'auto' ? (media.matches ? 'dark' : 'light') : settings.theme
      document.documentElement.dataset.theme = resolved
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [settings.theme])

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [],
  )

  const stored = useMemo(() => {
    if (!detail) return undefined
    return (
      library.books.find((b) => b.id === detail.id) ??
      (detail.volumeId ? library.books.find((b) => b.volumeId === detail.volumeId) : undefined)
    )
  }, [detail, library.books])

  return (
    <div className="app">
      <header className="header">
        <div className="wrap header__inner">
          <div className="brand">
            <span className="brand__dot" aria-hidden="true" />
            Incipit
            <small>diario de lecturas</small>
          </div>
          <nav className="nav" aria-label="Secciones">
            {TABS.map((t) => (
              <button key={t.id} aria-current={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <button
            className="icon-btn"
            onClick={() => updateSettings({ theme: THEME_CYCLE[settings.theme] })}
            aria-label={`Tema ${THEME_LABEL[settings.theme]}. Cambiar.`}
            title={`Tema ${THEME_LABEL[settings.theme]}`}
          >
            {THEME_ICON[settings.theme]}
          </button>
        </div>
      </header>

      <main>
        <div className="wrap">
          {library.persistenceError && (
            <div className="notice notice--error" style={{ marginBottom: 20 }} role="alert">
              <span aria-hidden="true">⚠</span>
              <span>
                Este navegador no permite guardar datos (modo privado o almacenamiento lleno). Puedes
                seguir usando la app, pero los cambios se perderán al cerrar la pestaña.
              </span>
            </div>
          )}

          {tab === 'estantes' && (
            <ShelvesView
              library={library}
              onOpen={setDetail}
              onGoToSearch={() => setTab('buscar')}
              onGoToGoodreads={() => setTab('goodreads')}
            />
          )}
          {tab === 'buscar' && <SearchView library={library} onOpen={setDetail} />}
          {tab === 'goodreads' && (
            <GoodreadsView library={library} settings={settings} onSettings={updateSettings} />
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="wrap footer__inner">
          <span>
            Incipit · tus datos se guardan solo en este navegador · fichas de{' '}
            <a href="https://books.google.com" target="_blank" rel="noreferrer">
              Google Books
            </a>
          </span>
          <span>{library.books.length} libros en la estantería</span>
        </div>
      </footer>

      {detail && (
        <BookDetail
          key={detail.id ?? detail.volumeId ?? detail.title}
          seed={detail}
          stored={stored}
          library={library}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
