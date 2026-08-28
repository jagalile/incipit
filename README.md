# Incipit

Diario de lecturas: un sitio estático para seguir qué estás leyendo, qué tienes pendiente,
qué has terminado y qué has abandonado. Sin cuentas, sin servidor y sin base de datos.

**En producción:** https://jagalile.github.io/incipit/

## Qué hace

- **Cuatro estantes** — leyendo, pendientes, leídos y abandonados, con contadores y filtro por
  título, autor o serie, y orden por actividad, título, autor o saga.
- **Búsqueda de libros** — por título, autor o serie, con preferencia por las ediciones en
  español. Dos catálogos intercambiables: Open Library (por defecto, sin clave) y Google Books.
- **Importación desde Goodreads** — del CSV oficial de exportación, o sincronizando los feeds RSS
  de un perfil público.
- **Ficha detallada** — sinopsis, editorial, categorías, valoración personal y notas.
- **Tema claro y oscuro**, responsive desde 320 px.
- **Instalable como PWA** — icono propio, pantalla completa y funcionamiento sin conexión.

## Cómo guarda los datos

Todo vive en el `localStorage` del navegador, en dos claves:

| Clave | Contenido |
| --- | --- |
| `incipit.library.v1` | Los libros: estado, valoración, fechas, notas y el mínimo para redibujar los estantes sin red |
| `incipit.settings.v1` | Id de Goodreads, proxy, tema y fecha de la última sincronización |

De cada libro se guarda una referencia al catálogo (`{ provider, id }`): es la única pieza
necesaria para recuperar la ficha completa bajo demanda, así que la sinopsis, las categorías y
la editorial no ocupan espacio en el navegador. Los libros importados de Goodreads llegan sin
esa referencia; «Buscar portadas y fichas» los enlaza uno a uno.

Hay exportación a JSON en la pestaña Goodreads para llevarte una copia.

## Sobre los catálogos

**Google Books cerró en 2025 el acceso sin clave**: su proyecto anónimo responde `429` con la
cuota diaria a cero a cualquier petición, venga de donde venga. Por eso la fuente por defecto es
**Open Library**, que sigue siendo abierta de verdad y además tiene CORS.

Open Library cataloga *obras*, con el título canónico casi siempre en inglés. Incipit pide las
ediciones que coinciden con el idioma (`language:spa`) y muestra el título de la edición
española: se busca «el nombre del viento» y se ve «El nombre del viento», no «The Name of the
Wind». Las sinopsis, en cambio, son las de la obra y suelen estar en inglés.

Quien prefiera el catálogo de Google puede cambiar de fuente en Ajustes y pegar su propia clave
(gratuita, desde Google Cloud activando «Books API»). Se guarda solo en el navegador.

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

## PWA

`public/manifest.webmanifest` y `public/sw.js` la hacen instalable y utilizable sin conexión:

- El armazón (HTML, JS, CSS, iconos) se **precarga en la instalación** del worker. La lista de
  archivos la inyecta `scripts/precache.mjs` al terminar el build, porque los nombres llevan
  hash y no se pueden conocer antes. Ese script sella también una versión: al cambiar cualquier
  archivo, `activate` borra las cachés anteriores.
- Portadas y tipografías se guardan al vuelo; las llamadas al catálogo van primero a la red y
  caen a la caché si no hay conexión.
- Como la biblioteca vive en `localStorage`, sin conexión los estantes funcionan enteros. Solo la
  búsqueda avisa de que necesita red.

Dos detalles que costaron encontrarse y conviene no deshacer: todos los `cache.match` usan
`ignoreVary` (los servidores mandan `Vary: Accept-Encoding` y sin eso nunca hay acierto de
caché), y las respuestas redirigidas se reescriben antes de guardarlas (`Cache.put` las rechaza,
y las portadas de Open Library siempre redirigen a archive.org).

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
scripts/
  precache.mjs       inyecta la lista de archivos y la versión en el service worker
public/
  sw.js              service worker: precarga, portadas, tipografías y datos
  manifest.webmanifest
src/
  lib/
    catalog.ts       fachada sobre los proveedores (buscar, ficha, emparejar)
    catalogCore.ts   tipos y errores compartidos
    openLibrary.ts   proveedor por defecto, con títulos de la edición española
    googleBooks.ts   proveedor alternativo, con clave propia
    goodreads.ts     parser de CSV, lectura de RSS y fusión con la biblioteca
    series.ts        extracción de la serie a partir del título
    storage.ts       localStorage tolerante a fallos (modo privado, cuota llena)
  hooks/
    useLibrary.ts    estado de la biblioteca, estantes y fechas automáticas
    useInstall.ts    prompt de instalación de la PWA
  components/        vistas de estantes, búsqueda, ajustes y ficha
```
