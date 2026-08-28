# Incipit

Diario de lecturas: un sitio estático para seguir qué estás leyendo, qué tienes pendiente,
qué has terminado y qué has abandonado. Sin cuentas, sin servidor y sin base de datos.

**En producción:** https://jagalile.github.io/incipit/

## Qué hace

- **Cuatro estantes** — leyendo, pendientes, leídos y abandonados, con contadores y filtro por
  título, autor o serie, y orden por actividad, título, autor o saga.
- **Búsqueda en Google Books** — por título (`intitle:`), autor (`inauthor:`) o serie, restringida
  a ediciones en español por defecto. Sin clave de API.
- **Importación desde Goodreads** — del CSV oficial de exportación, o sincronizando los feeds RSS
  de un perfil público.
- **Ficha detallada** — sinopsis, editorial, categorías, valoración personal y notas.
- **Tema claro y oscuro**, responsive desde 320 px.

## Cómo guarda los datos

Todo vive en el `localStorage` del navegador, en dos claves:

| Clave | Contenido |
| --- | --- |
| `incipit.library.v1` | Los libros: estado, valoración, fechas, notas y el mínimo para redibujar los estantes sin red |
| `incipit.settings.v1` | Id de Goodreads, proxy, tema y fecha de la última sincronización |

De cada libro se guarda su `volumeId` de Google Books: es la única pieza necesaria para
recuperar la ficha completa bajo demanda, así que la sinopsis, las categorías y la editorial
no ocupan espacio en el navegador. Los libros importados de Goodreads llegan sin ese id;
«Buscar portadas y fichas» los enlaza uno a uno.

Hay exportación a JSON en la pestaña Goodreads para llevarte una copia.

## Sobre Goodreads

Goodreads cerró su API pública en diciembre de 2020: dejó de emitir claves y desactivó las
existentes. Quedan dos vías, y la app implementa las dos:

1. **CSV de exportación** (recomendada). En [goodreads.com/review/import](https://www.goodreads.com/review/import),
   «Export Library» genera un CSV con toda la biblioteca. Se arrastra a la app y listo.
2. **Feeds RSS por estante** (`/review/list_rss/<id>?shelf=read`). Siguen activos, pero no envían
   cabeceras CORS, así que el navegador necesita un proxy público para leerlos. La app trae tres
   proxies conocidos entre los que cambiar con un clic, porque ninguno garantiza servicio.
   El perfil debe ser público.

Al reimportar, se elige si mandan los cambios locales o los de Goodreads. En ambos casos la
fusión es idempotente: reimportar el mismo CSV no duplica libros.

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo
npm run build      # comprueba tipos y compila a dist/
npm run preview    # sirve dist/ en local
```

## Despliegue

`.github/workflows/deploy.yml` compila y publica en GitHub Pages con cada `push` a `main`.
Requiere que en **Settings → Pages** la fuente sea **GitHub Actions**.

La ruta base es `/incipit/` (`vite.config.ts`). Para un dominio propio o un repositorio con
otro nombre, se pasa por entorno:

```bash
BASE_PATH=/ npm run build
```

## Estructura

```
src/
  lib/
    googleBooks.ts   cliente de la API, normalización y búsqueda por ISBN o título+autor
    goodreads.ts     parser de CSV, lectura de RSS y fusión con la biblioteca
    series.ts        extracción de la serie a partir del título
    storage.ts       localStorage tolerante a fallos (modo privado, cuota llena)
  hooks/
    useLibrary.ts    estado de la biblioteca, estantes y fechas automáticas
  components/        vistas de estantes, búsqueda, Goodreads y ficha
```
