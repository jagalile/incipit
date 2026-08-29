/**
 * Google Books y Open Library no exponen el nombre de la serie como campo, pero
 * el título lo suele incluir entre paréntesis, con el número separado de tres
 * formas distintas según la fuente:
 *   "El nombre del viento (Crónica del asesino de reyes, 1)"  — coma
 *   "Dune (Dune #1)"                                          — almohadilla
 *   "Camino de los reyes (El Archivo de las Tormentas 1)"     — solo espacio
 * El separador exige coma/almohadilla O al menos un espacio (nunca cero
 * caracteres) para no partir por la mitad una palabra que termine en dígito.
 */
const SERIES_RE =
  /[([]\s*([^()[\]]+?)(?:(?:[,#]\s*|\s+)(?:n[.º°]?\s*)?(\d+(?:[.,]\d+)?))?\s*[)\]]\s*$/i

const NOISE = /^(edici[oó]n|vol\.?|volumen|tapa|ilustrad|bolsillo|traducci|spanish|english|libro electr)/i

export function parseSeries(title: string, subtitle?: string): {
  cleanTitle: string
  series?: string
  seriesPosition?: string
} {
  const source = title.trim()
  const match = source.match(SERIES_RE)
  if (match) {
    const name = match[1].trim()
    if (name.length > 1 && !NOISE.test(name) && !/^\d+$/.test(name)) {
      return {
        cleanTitle: source.slice(0, match.index).trim().replace(/[,:;-]\s*$/, ''),
        series: name,
        seriesPosition: match[2]?.replace(',', '.'),
      }
    }
  }
  // A veces la serie viaja en el subtítulo: "Saga de los Confines, 2"
  if (subtitle) {
    const sub = subtitle.match(/^(.+?)[,#]\s*(?:n[.º°]?\s*)?(\d+(?:[.,]\d+)?)$/)
    if (sub && !NOISE.test(sub[1])) {
      return { cleanTitle: source, series: sub[1].trim(), seriesPosition: sub[2].replace(',', '.') }
    }
  }
  return { cleanTitle: source }
}

/** Clave de agrupación por serie, insensible a mayúsculas y acentos. */
export function seriesKey(series?: string): string {
  if (!series) return ''
  return series
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
