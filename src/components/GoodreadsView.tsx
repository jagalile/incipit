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
import { findVolumeFor } from '../lib/googleBooks'
import { exportLibrary } from '../lib/storage'
import type { Settings } from '../types'
import type { LibraryApi } from '../hooks/useLibrary'

type Strategy = 'merge' | 'replace'

interface Props {
  library: LibraryApi
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
}

export function GoodreadsView({ library, settings, onSettings }: Props) {
  const [strategy, setStrategy] = useState<Strategy>('merge')
  const [busy, setBusy] = useState<null | 'csv' | 'rss' | 'enrich'>(null)
  const [step, setStep] = useState('')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<(MergeResult & { origin: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const pendingEnrich = library.books.filter((b) => !b.volumeId)

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

  /** Resuelve portada y volumeId de los libros importados, uno a uno para no saturar la API. */
  const handleEnrich = async () => {
    setBusy('enrich')
    setError(null)
    setProgress(0)
    let done = 0
    let matched = 0
    for (const book of pendingEnrich) {
      try {
        const found = await findVolumeFor(book)
        if (found) {
          library.update(book.id, {
            volumeId: found.volumeId,
            thumbnail: book.thumbnail ?? found.thumbnail,
            pageCount: book.pageCount ?? found.pageCount,
            isbn: book.isbn ?? found.isbn,
            year: book.year ?? found.year,
          })
          matched++
        }
      } catch {
        // Un fallo puntual no debe interrumpir el lote completo.
      }
      done++
      setProgress(Math.round((done / pendingEnrich.length) * 100))
      await new Promise((r) => setTimeout(r, 220))
    }
    setBusy(null)
    setStep(`${matched} de ${pendingEnrich.length} libros enlazados con Google Books.`)
  }

  return (
    <section>
      <div className="page-head">
        <h1>Conectar con Goodreads</h1>
        <p>
          Goodreads cerró su API pública en diciembre de 2020, así que Incipit usa las dos vías que
          siguen funcionando: la exportación oficial en CSV y los feeds RSS de tus estantes.
        </p>
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
            Importado desde <strong>{result.origin}</strong>: {result.added} libros nuevos,{' '}
            {result.updated} actualizados
            {result.skipped > 0 && ` · ${result.skipped} conservaron tu estado local`}.
          </span>
        </div>
      )}

      <div className="panels">
        <div className="panel">
          <div className="panel__head">
            <span className="panel__step">1</span>
            <h2>Importar el CSV</h2>
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
            <strong>{busy === 'csv' ? 'Leyendo el archivo…' : 'Arrastra tu goodreads_library_export.csv'}</strong>
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
            <h2>Ajustes y datos</h2>
          </div>
          <p className="panel__desc">
            Qué hacer cuando un libro importado ya existe en tus estantes.
          </p>

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
                {pendingEnrich.length
                  ? `${pendingEnrich.length} libros importados aún no tienen portada ni ficha de Google Books.`
                  : 'Todos tus libros están enlazados con Google Books.'}
              </p>
              <button
                className="btn btn--block"
                onClick={handleEnrich}
                disabled={busy !== null || pendingEnrich.length === 0}
              >
                {busy === 'enrich' ? `Buscando portadas… ${progress}%` : 'Buscar portadas y fichas'}
              </button>
              {busy === 'enrich' && (
                <div className="progress">
                  <div className="progress__bar" style={{ width: `${progress}%` }} />
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
