import { useCallback, useEffect, useRef, useState } from 'react'
import { PROVIDERS, findBookFor, type Provider } from '../lib/catalog'
import type { Settings, StoredBook } from '../types'
import type { LibraryApi } from './useLibrary'

export type EnrichPhase = 'idle' | 'running' | 'done'

export interface EnrichState {
  status: EnrichPhase
  progress: number
  done: number
  total: number
  matched: number
  cancelled: boolean
  /** Qué se está haciendo, para la franja flotante y el texto del botón:
   *  "Buscando portadas y fichas" no vale para una migración entre
   *  catálogos, son acciones distintas aunque compartan todo lo demás. */
  label: string
}

export interface StartOptions {
  /** Qué libros procesar. Por defecto, los que aún no tienen `ref`. */
  books?: StoredBook[]
  /** A qué proveedor buscar. Por defecto, el configurado en Ajustes. */
  provider?: Provider
  /** 'fill' (por defecto) solo rellena lo que faltaba -para no pisar una
   *  portada que ya trajo el RSS de Goodreads, por ejemplo-. 'replace'
   *  sustituye siempre por lo que traiga el proveedor nuevo: es el modo
   *  correcto para migrar un libro ya enlazado de un catálogo a otro, donde
   *  el punto es justo dejar de usar los datos del proveedor anterior. */
  mode?: 'fill' | 'replace'
  /** Qué mostrar mientras corre. Por defecto, "Buscando portadas y fichas". */
  label?: string
}

export interface EnrichApi extends EnrichState {
  pendingCount: number
  canStart: boolean
  needsKey: boolean
  start: (opts?: StartOptions) => void
  cancel: () => void
  dismiss: () => void
}

const IDLE: EnrichState = {
  status: 'idle',
  progress: 0,
  done: 0,
  total: 0,
  matched: 0,
  cancelled: false,
  label: 'Buscando portadas y fichas',
}

/**
 * Vive en App, no en la pantalla de Ajustes: si dependiera de un componente
 * que se desmonta al cambiar de pestaña, la barra volvería a 0% al salir y
 * entrar -el trabajo en sí seguiría, JavaScript no lo corta, pero se perdería
 * de vista-. Aquí sobrevive al cambio de pestaña sin más.
 */
export function useEnrichment(library: LibraryApi, settings: Settings): EnrichApi {
  const [state, setState] = useState<EnrichState>(IDLE)
  const cancelledRef = useRef(false)
  const runningRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const pending = library.books.filter((b) => !b.ref)
  const providerMeta = PROVIDERS.find((p) => p.id === settings.provider)!
  const needsKey = providerMeta.needsKey && !settings.googleApiKey.trim()

  // `start` se memoiza una sola vez (deps vacías) y puede pulsarse mucho
  // después de que se creara: lee siempre la versión más reciente de aquí,
  // no la que hubiera en el render en que se creó el callback.
  const latestRef = useRef({ library, settings, pending, providerMeta, needsKey })
  latestRef.current = { library, settings, pending, providerMeta, needsKey }

  // El aviso nativo del navegador al recargar o cerrar la pestaña: solo
  // mientras hay trabajo en marcha, para no molestar el resto del tiempo.
  useEffect(() => {
    if (state.status !== 'running') return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [state.status])

  // Evita que el bloqueo automático por inactividad corte el proceso a
  // media búsqueda: mientras corre, se pide que la pantalla no se apague.
  // No cubre que el usuario cambie de app a mano ni un bloqueo manual con
  // el botón físico -eso lo decide el sistema, no esta API-, pero sí el
  // caso más habitual: el móvil se bloquea solo mientras esperas.
  useEffect(() => {
    if (state.status !== 'running') return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      if (!('wakeLock' in navigator)) return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          // El proceso ya terminó (o se canceló) mientras se pedía el permiso.
          lock.release().catch(() => {})
          return
        }
        sentinel = lock
        // El propio navegador libera el bloqueo al ocultar la pestaña -no hay
        // forma de evitarlo-; se vuelve a pedir en cuanto se recupera el foco.
        sentinel.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null
        })
      } catch {
        // Puede rechazarlo por ahorro de batería o por no tener foco: sin
        // bloqueo de pantalla, pero el proceso sigue igual.
      }
    }

    acquire()
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) acquire()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [state.status])

  useEffect(() => () => clearTimeout(dismissTimerRef.current), [])

  const dismiss = useCallback(() => {
    clearTimeout(dismissTimerRef.current)
    setState(IDLE)
  }, [])

  const start = useCallback(
    (opts?: StartOptions) => {
      const { library, settings, pending } = latestRef.current
      const targetProvider = opts?.provider ?? settings.provider
      const batch = opts?.books ?? pending
      const mode = opts?.mode ?? 'fill'
      const label = opts?.label ?? 'Buscando portadas y fichas'
      // El proveedor OBJETIVO puede no ser el configurado en Ajustes -una
      // migración apunta a uno concreto, no siempre al seleccionado-, así
      // que la clave hace falta o no según a quién se busque, no según
      // `settings.provider`.
      const targetNeedsKey =
        PROVIDERS.find((p) => p.id === targetProvider)!.needsKey && !settings.googleApiKey.trim()
      if (runningRef.current || batch.length === 0 || targetNeedsKey) return
      runningRef.current = true
      clearTimeout(dismissTimerRef.current)
      cancelledRef.current = false
      const controller = new AbortController()
      controllerRef.current = controller
      const total = batch.length
      setState({ status: 'running', progress: 0, done: 0, total, matched: 0, cancelled: false, label })

      ;(async () => {
        let done = 0
        let matched = 0
        for (const book of batch) {
          if (cancelledRef.current) break
          try {
            const found = await findBookFor(book, {
              provider: targetProvider,
              apiKey: settings.googleApiKey,
              signal: controller.signal,
            })
            if (found) {
              library.update(book.id, {
                ref: found.ref,
                thumbnail: mode === 'replace' ? found.thumbnail : (book.thumbnail ?? found.thumbnail),
                pageCount: mode === 'replace' ? found.pageCount : (book.pageCount ?? found.pageCount),
                isbn: mode === 'replace' ? found.isbn : (book.isbn ?? found.isbn),
                year: mode === 'replace' ? found.year : (book.year ?? found.year),
              })
              matched++
            }
          } catch (err) {
            if ((err as Error)?.name === 'AbortError') break
            // Un fallo puntual no debe interrumpir el lote completo.
          }
          done++
          setState((s) => ({ ...s, done, matched, progress: Math.round((done / total) * 100) }))
          if (cancelledRef.current) break
          await new Promise((r) => setTimeout(r, 220))
        }
        runningRef.current = false
        setState((s) => ({ ...s, status: 'done', cancelled: cancelledRef.current, matched, done }))
        // Toast no intrusivo: se retira solo pasado un rato si nadie lo cierra antes.
        dismissTimerRef.current = setTimeout(dismiss, 8000)
      })()
    },
    [dismiss],
  )

  const cancel = useCallback(() => {
    cancelledRef.current = true
    controllerRef.current?.abort()
  }, [])

  return {
    ...state,
    pendingCount: pending.length,
    canStart: pending.length > 0 && !needsKey,
    needsKey,
    start,
    cancel,
    dismiss,
  }
}
