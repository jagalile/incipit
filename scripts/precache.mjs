/**
 * Inyecta en el service worker la lista de archivos que produce el build.
 *
 * Sin esto, la primera visita descarga el armazón antes de que el worker esté
 * activo: nada llega a la caché y la app no abre sin conexión hasta la segunda
 * visita. Los nombres llevan hash, así que la lista solo se puede conocer aquí.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = 'dist'
const MARKER = '/* __PRECACHE__ */ []'
const VERSION_MARKER = "/* __VERSION__ */ 'dev'"

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const files = walk(DIST)
  .map((f) => relative(DIST, f).split(/[\\/]/).join('/'))
  .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
  .map((f) => `./${f}`)
  .sort()

// La navegación pide el directorio ("/incipit/"), no "index.html": hacen falta ambos.
files.unshift('./')

const swPath = join(DIST, 'sw.js')
const sw = readFileSync(swPath, 'utf8')
for (const marker of [MARKER, VERSION_MARKER]) {
  if (!sw.includes(marker)) throw new Error(`No se encontró el marcador ${marker} en ${swPath}`)
}
// El sello cambia en cuanto cambie cualquier nombre de archivo con hash.
const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 8)

const injected = sw
  .replace(MARKER, JSON.stringify(files))
  .replace(VERSION_MARKER, JSON.stringify(version))
// Un service worker con un error de sintaxis no se instala y falla en silencio:
// mejor romper el build aquí que descubrirlo en producción.
new Function(injected.replaceAll('self.', 'globalThis.'))
writeFileSync(swPath, injected)
console.log(`precache: ${files.length} archivos, versión ${version} → ${swPath}`)
