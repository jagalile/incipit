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
