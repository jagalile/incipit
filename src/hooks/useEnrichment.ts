import { useCallback, useEffect, useRef, useState } from 'react'
import { PROVIDERS, findBookFor } from '../lib/catalog'
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
  providerLabel: string
}

export interface EnrichApi extends EnrichState {
  pendingCount: number
  canStart: boolean
  start: () => void
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
  providerLabel: '',
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

  useEffect(() => () => clearTimeout(dismissTimerRef.current), [])

  const dismiss = useCallback(() => {
    clearTimeout(dismissTimerRef.current)
    setState(IDLE)
  }, [])

  const start = useCallback(() => {
    const { library, settings, pending, providerMeta, needsKey } = latestRef.current
    if (runningRef.current || pending.length === 0 || needsKey) return
    runningRef.current = true
    clearTimeout(dismissTimerRef.current)
    cancelledRef.current = false
    const controller = new AbortController()
    controllerRef.current = controller
    const batch: StoredBook[] = pending
    const total = batch.length
    setState({
      status: 'running',
      progress: 0,
      done: 0,
      total,
      matched: 0,
      cancelled: false,
      providerLabel: providerMeta.label,
    })

    ;(async () => {
      let done = 0
      let matched = 0
      for (const book of batch) {
        if (cancelledRef.current) break
        try {
          const found = await findBookFor(book, {
            provider: settings.provider,
            apiKey: settings.googleApiKey,
            signal: controller.signal,
          })
          if (found) {
            library.update(book.id, {
              ref: found.ref,
              thumbnail: book.thumbnail ?? found.thumbnail,
              pageCount: book.pageCount ?? found.pageCount,
              isbn: book.isbn ?? found.isbn,
              year: book.year ?? found.year,
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
  }, [dismiss])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    controllerRef.current?.abort()
  }, [])

  return { ...state, pendingCount: pending.length, canStart: pending.length > 0 && !needsKey, start, cancel, dismiss }
}
