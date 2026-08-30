import { useRef, useState } from 'react'
import {
  KNOWN_PROXIES,
  ImportError,
  SyncError,
  mergeEntries,
  parseGoodreadsCsv,
  syncFromGoodreads,
  type GoodreadsEntry,
  type MergeResult,
} from '../lib/goodreads'
import { PROVIDERS } from '../lib/catalog'
import { DEFAULT_SETTINGS, exportLibrary } from '../lib/storage'
import { plural } from '../lib/plural'
import type { Settings } from '../types'
import type { EnrichApi } from '../hooks/useEnrichment'
import type { LibraryApi } from '../hooks/useLibrary'
import type { InstallApi } from '../hooks/useInstall'

type Strategy = 'merge' | 'replace'

interface Props {
  library: LibraryApi
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
  install: InstallApi
  enrich: EnrichApi
}

export function SettingsView({ library, settings, onSettings, install, enrich }: Props) {
  const [strategy, setStrategy] = useState<Strategy>('merge')
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState<null | 'csv' | 'rss'>(null)
  const [step, setStep] = useState('')
  const [result, setResult] = useState<(MergeResult & { origin: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const provider = PROVIDERS.find((p) => p.id === settings.provider)!
  const needsKey = provider.needsKey && !settings.googleApiKey.trim()

  const apply = (entries: GoodreadsEntry[], origin: string) => {
    const merged = mergeEntries(library.books, entries, strategy)
    library.replaceAll(merged.books)
    setResult({ ...merged, origin })
    onSettings({ lastSyncAt: new Date().toISOString() })
  }

  const handleFile = async (file: File) => {
    setBusy('csv')
    setError(null)
    setResult(null)
    try {
      if (file.size > 20 * 1024 * 1024) throw new ImportError('El archivo supera los 20 MB.')
      const text = await file.text()
      apply(parseGoodreadsCsv(text), file.name)
    } catch (err) {
      setError(
        err instanceof ImportError
          ? err.message
          : 'No se pudo leer el archivo. Asegúrate de que es el CSV que exporta Goodreads.',
      )
    } finally {
      setBusy(null)
    }
  }

  const handleSync = async () => {
    setBusy('rss')
    setError(null)
    setResult(null)
    try {
      const entries = await syncFromGoodreads(settings.goodreadsUserId, settings.corsProxy, (shelf) =>
        setStep(shelf),
      )
      apply(entries, `perfil ${settings.goodreadsUserId}`)
    } catch (err) {
      setError(err instanceof SyncError ? err.message : 'La sincronización ha fallado.')
    } finally {
      setBusy(null)
      setStep('')
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>Ajustes</h1>
        <p>De dónde salen las fichas, cómo traer tu historial de Goodreads y qué hacer con tus datos.</p>
      </div>

      {error && (
        <div className="notice notice--error" role="alert" style={{ marginBottom: 18 }}>
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="notice notice--ok" role="status" style={{ marginBottom: 18 }}>
          <span aria-hidden="true">✓</span>
          <span>
            Importado desde <strong>{result.origin}</strong>:{' '}
            {plural(result.added, 'libro nuevo', 'libros nuevos')}, {result.updated} actualizados
            {result.skipped > 0 && ` · ${result.skipped} conservaron tu estado local`}.
          </span>
        </div>
      )}

      <div className="panels">
        <div className="panel">
          <div className="panel__head">
            <span className="panel__step" aria-hidden="true">
              ▣
            </span>
            <h2>Instalar la app</h2>
          </div>
          {install.installed ? (
            <>
              <p className="panel__desc">
                Ya la estás usando instalada. Abre y cierra sin navegador, y funciona sin conexión.
              </p>
              <div className="notice notice--ok">
                <span aria-hidden="true">✓</span>
                <span>Instalada en este dispositivo.</span>
              </div>
            </>
          ) : (
            <>
              <p className="panel__desc">
                Incipit funciona como aplicación: icono propio, pantalla completa y tus estantes
                disponibles sin conexión.
              </p>
              {install.canPrompt ? (
                <button className="btn btn--primary btn--block" onClick={install.install}>
                  Instalar Incipit
                </button>
              ) : install.isIos ? (
                <ol>
                  <li>
                    Pulsa <strong>Compartir</strong> en la barra de Safari.
                  </li>
                  <li>
                    Elige <strong>Añadir a pantalla de inicio</strong>.
                  </li>
                </ol>
              ) : (
                <p className="hint">
                  Desde el menú del navegador, busca <strong>Instalar aplicación</strong> o{' '}
                  <strong>Añadir a pantalla de inicio</strong>. Si ya la instalaste, el botón no
                  vuelve a aparecer.
                </p>
              )}
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__step" aria-hidden="true">
              ◆
            </span>
            <h2>Catálogo</h2>
          </div>
          <p className="panel__desc">De aquí salen las portadas, las sinopsis y los resultados de búsqueda.</p>

          <div className="chips" style={{ marginBottom: 12 }}>
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                className="chip"
                aria-pressed={settings.provider === p.id}
                onClick={() => onSettings({ provider: p.id })}
              >
                {p.label}
                {p.id === DEFAULT_SETTINGS.provider && <span className="chip__count">Por defecto</span>}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginBottom: 14 }}>
            {provider.note}
          </p>

          {settings.provider === 'google' && (
            <>
              <label className="label" htmlFor="gb-key">
                Clave de API de Google Books
              </label>
              <div className="key-field">
                <input
                  id="gb-key"
                  className="input"
                  type={showKey ? 'text' : 'password'}
                  placeholder="AIza…"
                  autoComplete="off"
                  value={settings.googleApiKey}
                  onChange={(e) => onSettings({ googleApiKey: e.target.value })}
                />
                <button
                  type="button"
                  className="key-field__toggle"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? 'Ocultar la clave' : 'Mostrar la clave'}
                  title={showKey ? 'Ocultar la clave' : 'Mostrar la clave'}
                >
                  {showKey ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M1 8s2.7-5 7-5 7 5 7 5-2.7 5-7 5-7-5-7-5Z"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
                      <line
                        x1="1.5"
                        y1="1.5"
                        x2="14.5"
                        y2="14.5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path
                        d="M1 8s2.7-5 7-5 7 5 7 5-2.7 5-7 5-7-5-7-5Z"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="hint">
                Se crea gratis en{' '}
                <a
                  href="https://console.cloud.google.com/apis/library/books.googleapis.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Cloud
                </a>{' '}
                activando «Books API». Se guarda solo en este navegador; conviene restringirla por
                referente HTTP.
              </p>
              {needsKey && (
                <div className="notice notice--warn" style={{ marginTop: 12 }}>
                  <span>
                    <strong>Sin clave no habrá resultados:</strong> desde 2025 Google Books responde
                    con error de cuota a cualquier petición anónima.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__step">1</span>
            <h2>Importar de Goodreads</h2>
          </div>
          <p className="panel__desc">La vía recomendada: completa, fiable y sin intermediarios.</p>
          <ol>
            <li>
              Entra en{' '}
              <a href="https://www.goodreads.com/review/import" target="_blank" rel="noreferrer">
                goodreads.com/review/import
              </a>
            </li>
            <li>Pulsa «Export Library» y espera a que se genere el archivo.</li>
            <li>Descarga el CSV y suéltalo aquí debajo.</li>
          </ol>

          <button
            className="dropzone"
            data-over={over}
            disabled={busy !== null}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              const file = e.dataTransfer.files[0]
              if (file) handleFile(file)
            }}
          >
            <strong>
              {busy === 'csv' ? 'Leyendo el archivo…' : 'Arrastra tu goodreads_library_export.csv'}
            </strong>
            <span>o haz clic para elegirlo</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__step">2</span>
            <h2>Sincronizar por RSS</h2>
          </div>
          <p className="panel__desc">
            Trae los estantes <em>to-read</em>, <em>currently-reading</em> y <em>read</em> de un perfil
            público, sin descargar nada.
          </p>

          <div className="stack">
            <div>
              <label className="label" htmlFor="gr-user">
                Id de usuario de Goodreads
              </label>
              <input
                id="gr-user"
                className="input"
                inputMode="numeric"
                placeholder="12345678"
                value={settings.goodreadsUserId}
                onChange={(e) => onSettings({ goodreadsUserId: e.target.value })}
              />
              <p className="hint">
                Está en la URL de tu perfil: goodreads.com/user/show/<strong>12345678</strong>-nombre
              </p>
            </div>

            <div>
              <label className="label" htmlFor="gr-proxy">
                Proxy CORS
              </label>
              <input
                id="gr-proxy"
                className="input"
                value={settings.corsProxy}
                onChange={(e) => onSettings({ corsProxy: e.target.value })}
              />
              <p className="hint" style={{ marginBottom: 8 }}>
                Goodreads no permite leer sus feeds desde el navegador. Si uno falla, prueba con otro:
              </p>
              <div className="chips">
                {KNOWN_PROXIES.map((proxy) => (
                  <button
                    key={proxy.url}
                    className="chip"
                    aria-pressed={settings.corsProxy === proxy.url}
                    onClick={() => onSettings({ corsProxy: proxy.url })}
                  >
                    {proxy.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="notice notice--warn" style={{ marginTop: 16 }}>
            <span>
              <strong>Ten en cuenta:</strong> tu perfil y tus estantes deben ser públicos. Si el proxy
              falla, la importación por CSV siempre funciona.
            </span>
          </div>

          <div className="row">
            <button
              className="btn btn--primary"
              onClick={handleSync}
              disabled={busy !== null || !settings.goodreadsUserId.trim()}
            >
              {busy === 'rss' ? `Sincronizando ${step}…` : 'Sincronizar ahora'}
            </button>
            {settings.lastSyncAt && (
              <span className="hint" style={{ alignSelf: 'center' }}>
                Última vez: {new Date(settings.lastSyncAt).toLocaleString('es-ES')}
              </span>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <span className="panel__step">3</span>
            <h2>Tus datos</h2>
          </div>
          <p className="panel__desc">Qué hacer cuando un libro importado ya existe en tus estantes.</p>

          <div className="chips" style={{ marginBottom: 18 }}>
            <button
              className="chip"
              aria-pressed={strategy === 'merge'}
              onClick={() => setStrategy('merge')}
              title="Conserva el estado que tú hayas puesto aquí"
            >
              Respetar mis cambios
            </button>
            <button
              className="chip"
              aria-pressed={strategy === 'replace'}
              onClick={() => setStrategy('replace')}
              title="Goodreads manda: sobrescribe el estado local"
            >
              Que mande Goodreads
            </button>
          </div>

          <div className="stack">
            <div>
              <p className="label">Completar fichas</p>
              <p className="hint" style={{ margin: '0 0 10px' }}>
                {enrich.status === 'done'
                  ? `${enrich.cancelled ? 'Cancelado: ' : ''}${enrich.matched} de ${enrich.done} ${enrich.done === 1 ? 'libro enlazado' : 'libros enlazados'}.`
                  : enrich.pendingCount
                    ? `${plural(enrich.pendingCount, 'libro importado aún no tiene', 'libros importados aún no tienen')} portada ni ficha.`
                    : 'Todos tus libros están enlazados con su ficha del catálogo.'}
              </p>
              {enrich.status === 'running' ? (
                <div className="row" style={{ marginTop: 0 }}>
                  <button className="btn btn--block" disabled>
                    Buscando portadas… {enrich.progress}%
                  </button>
                  <button className="btn btn--ghost" onClick={enrich.cancel}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn--block"
                  onClick={enrich.start}
                  disabled={busy !== null || !enrich.canStart}
                >
                  Buscar portadas y fichas
                </button>
              )}
              {enrich.status === 'running' && (
                <div className="progress">
                  <div className="progress__bar" style={{ width: `${enrich.progress}%` }} />
                </div>
              )}
              {busy === null && step && !error && <p className="hint">{step}</p>}
            </div>

            <div>
              <p className="label">Copia de seguridad</p>
              <div className="row" style={{ marginTop: 0 }}>
                <button
                  className="btn"
                  onClick={() => exportLibrary(library.books)}
                  disabled={!library.books.length}
                >
                  Exportar JSON
                </button>
                <button
                  className="btn btn--danger"
                  disabled={!library.books.length}
                  onClick={() => {
                    if (confirm('Se borrarán los libros guardados en este navegador. ¿Seguro?')) {
                      library.replaceAll([])
                      setResult(null)
                    }
                  }}
                >
                  Vaciar biblioteca
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
