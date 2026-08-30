import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PROVIDERS, refKey } from './lib/catalog'
import type { SearchField } from './types'
import { plural } from './lib/plural'
import { useEnrichment } from './hooks/useEnrichment'
import { useInstall } from './hooks/useInstall'
import { useLibrary } from './hooks/useLibrary'
import { loadSettings, saveSettings } from './lib/storage'
import type { Settings } from './types'
import { BookDetail, type DetailSeed } from './components/BookDetail'
import { EnrichStatus } from './components/EnrichStatus'
import { SettingsView } from './components/SettingsView'
import { SearchView } from './components/SearchView'
import { ShelfIcon } from './components/ShelfIcon'
import { ShelvesView } from './components/ShelvesView'
import { SearchIcon } from './components/SearchIcon'

type Tab = 'estantes' | 'buscar' | 'ajustes'

// Ajustes no es una sección de contenido como las otras dos: vive aparte, en
// el botón de engranaje junto al selector de tema.
const NAV_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'estantes', label: 'Mis estantes', icon: <ShelfIcon /> },
  { id: 'buscar', label: 'Buscar', icon: <SearchIcon /> },
]
const ALL_TABS: Tab[] = ['estantes', 'buscar', 'ajustes']

const THEME_CYCLE = { auto: 'light', light: 'dark', dark: 'auto' } as const
const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' } as const
const THEME_LABEL = { auto: 'automático', light: 'claro', dark: 'oscuro' } as const

/** Los accesos directos del manifiesto abren la app en una vista concreta. */
function initialTab(): Tab {
  const vista = new URLSearchParams(window.location.search).get('vista')
  return ALL_TABS.includes(vista as Tab) ? (vista as Tab) : 'estantes'
}

export default function App() {
  const library = useLibrary()
  const install = useInstall()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const enrich = useEnrichment(library, settings)
  const [detail, setDetail] = useState<(DetailSeed & { id?: string }) | null>(null)
  const [pendingSearch, setPendingSearch] = useState<{ term: string; field: SearchField } | null>(null)

  // Adónde vuelve el botón de ajustes al cerrarse: la última pestaña de
  // contenido visitada, sea cual sea el camino por el que se entró a
  // ajustes (el propio botón, o "importar de Goodreads" desde otra vista).
  const previousTabRef = useRef<Exclude<Tab, 'ajustes'>>('estantes')
  useEffect(() => {
    if (tab !== 'ajustes') previousTabRef.current = tab
  }, [tab])

  /** Pulsar el autor o la serie en una ficha lleva a la pestaña Buscar con esa consulta lista. */
  const goSearch = useCallback((term: string, field: SearchField) => {
    setPendingSearch({ term, field })
    setTab('buscar')
    setDetail(null)
  }, [])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  // El tema "auto" sigue al sistema; los otros dos fijan el atributo en la raíz.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const resolved = settings.theme === 'auto' ? (media.matches ? 'dark' : 'light') : settings.theme
      document.documentElement.dataset.theme = resolved
      // Tiñe también la barra del sistema cuando la app corre instalada.
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', resolved === 'dark' ? '#16130f' : '#faf7f2')
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
    const key = refKey(detail.ref)
    return (
      library.books.find((b) => b.id === detail.id) ??
      (key ? library.books.find((b) => refKey(b.ref) === key) : undefined)
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
          <button
            className="icon-btn"
            onClick={() => updateSettings({ theme: THEME_CYCLE[settings.theme] })}
            aria-label={`Tema ${THEME_LABEL[settings.theme]}. Cambiar.`}
            title={`Tema ${THEME_LABEL[settings.theme]}`}
          >
            {THEME_ICON[settings.theme]}
          </button>
          <button
            className="icon-btn"
            aria-pressed={tab === 'ajustes'}
            onClick={() => setTab(tab === 'ajustes' ? previousTabRef.current : 'ajustes')}
            aria-label={tab === 'ajustes' ? 'Cerrar ajustes' : 'Ajustes'}
            title={tab === 'ajustes' ? 'Cerrar ajustes' : 'Ajustes'}
          >
            {tab === 'ajustes' ? '×' : '⚙'}
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
              onGoToGoodreads={() => setTab('ajustes')}
            />
          )}
          {tab === 'buscar' && (
            <SearchView
              library={library}
              provider={settings.provider}
              apiKey={settings.googleApiKey}
              onOpen={setDetail}
              onGoToSettings={() => setTab('ajustes')}
              pendingQuery={pendingSearch}
              onConsumePending={() => setPendingSearch(null)}
            />
          )}
          {tab === 'ajustes' && (
            <SettingsView
              library={library}
              settings={settings}
              onSettings={updateSettings}
              install={install}
              enrich={enrich}
            />
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="wrap footer__inner">
          <span>
            Incipit · tus datos se guardan solo en este navegador · fichas de{' '}
            <a
              href={
                settings.provider === 'google'
                  ? 'https://books.google.com'
                  : 'https://openlibrary.org'
              }
              target="_blank"
              rel="noreferrer"
            >
              {PROVIDERS.find((p) => p.id === settings.provider)?.label}
            </a>
          </span>
          <span>{plural(library.books.length, 'libro', 'libros')} en la estantería</span>
        </div>
      </footer>

      <div className="app-bottom-stack">
        <EnrichStatus enrich={enrich} />
        <nav className="bottom-nav" aria-label="Secciones">
          <div className="bottom-nav__inner">
            {NAV_TABS.map((t) => (
              <button key={t.id} aria-current={tab === t.id} onClick={() => setTab(t.id)}>
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {detail && (
        <BookDetail
          key={detail.id ?? refKey(detail.ref) ?? detail.title}
          seed={detail}
          stored={stored}
          library={library}
          provider={settings.provider}
          apiKey={settings.googleApiKey}
          onSearch={goSearch}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
