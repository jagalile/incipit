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
 * Google (Sheets, Analytics, Books...): la misma búsqueda que falla ahora
 * suele funcionar un instante después. Se reintenta con espera creciente
 * ante fallos de servidor (5xx) o de red, pero nunca ante errores del
 * cliente (429 de cuota, 403 de autenticación...), donde reintentar no
 * cambia nada.
 */
export async function fetchWithRetry(
  url: string,
  opts: { signal?: AbortSignal; headers?: HeadersInit; retries?: number } = {},
): Promise<Response> {
  const { signal, headers, retries = 2 } = opts
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
    await wait(400 * 2 ** attempt + Math.random() * 200, signal)
  }
}
