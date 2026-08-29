/**
 * Quita el marcado con el que llegan las sinopsis. Google Books manda HTML
 * ligero (`<b>`, `<br>`…); Open Library manda Markdown (`**negrita**`,
 * `*cursiva*`, enlaces `[texto](url)`) — se limpian los dos a la vez porque
 * nunca se sabe cuál trajo el texto sin mirar de dónde vino.
 */
export function stripHtml(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
