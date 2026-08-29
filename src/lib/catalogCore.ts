/**
 * Tipos y errores compartidos por los proveedores de fichas. Viven aparte de
 * `catalog.ts` para que los proveedores no dependan del módulo que los importa.
 */

export type Provider = 'openlibrary' | 'google'

export interface BookRef {
  provider: Provider
  id: string
}

export type ErrorKind = 'offline' | 'network' | 'quota' | 'auth' | 'server'

export class CatalogError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    readonly provider: Provider,
  ) {
    super(message)
  }
}

export function refKey(ref?: BookRef): string {
  return ref ? `${ref.provider}:${ref.id}` : ''
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

/**
 * Un 503 "backendError" es un fallo transitorio documentado en las APIs de
 * Google (Sheets, Analytics, Books...); Google Books en concreto tiene
 * además un 503 propio de "no se pudo determinar la ubicación" ligado a la
 * geolocalización por IP, más frecuente en redes móviles/de operador. Ambos
 * se resuelven solos, pero no siempre en el primer segundo: 2 reintentos
 * cortos no bastaban -de ahí que a mano, esperando y pulsando "Reintentar",
 * sí funcionara-. Con 4 reintentos y hasta ~2.5s de espera entre cada uno,
 * la ventana total (~7s en el peor caso) se acerca a lo que ya se veía que
 * hacía falta esperar a mano.
 */
export async function fetchWithRetry(
  url: string,
  opts: { signal?: AbortSignal; headers?: HeadersInit; retries?: number } = {},
): Promise<Response> {
  const { signal, headers, retries = 4 } = opts
  for (let attempt = 0; ; attempt++) {
    let res: Response | undefined
    let networkError: unknown
    try {
      res = await fetch(url, { signal, headers })
    } catch (err) {
      networkError = err
    }
    const transient = networkError !== undefined || (res !== undefined && res.status >= 500)
    if (!transient || attempt >= retries) {
      if (res) return res
      throw networkError
    }
    await wait(Math.min(500 * 2 ** attempt, 2500) + Math.random() * 300, signal)
  }
}
