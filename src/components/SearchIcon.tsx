/** Lupa dibujada a mano: los glifos unicode de lupa se renderizan de forma muy
 *  desigual entre sistemas y rompían la alineación del campo de búsqueda. */
export function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.6 10.6 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
