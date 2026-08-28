/** «1 libro» / «2 libros»: evita el clásico «1 libros». */
export function plural(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString('es-ES')} ${count === 1 ? singular : plural}`
}
