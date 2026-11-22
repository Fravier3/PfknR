# Mapa 3D de Puerto Rico

Mapa interactivo (Three.js 0.147) de Puerto Rico con relieve, los 78 municipios, sus 902 barrios, 145 subbarrios, 175 comunidades del Censo y unos 4,000 sectores de OpenStreetMap.

Niveles de zoom: isla → municipio (ficha y barrios pintados) → barrio (subbarrios pintados, si los tiene, y sectores con su nombre) → subbarrio o sector.

## Vistas

- **Plano** (por defecto): vista desde arriba, norte arriba; solo se mueve y se acerca.
- **3D**: permite inclinar y girar; aparecen "Girar" (giro automático) y el control de relieve (×1 a ×8).
- **Sólido**: quita texturas y relieve; la tierra queda verde sólido y el mar azul liso. Se combina con plano o 3D.
- **Nombres**, **Límites** y **Regiones** son capas que se prenden y apagan.

## Navegación

- Teléfono: un dedo mueve el mapa; dos dedos acercan (y en 3D, giran e inclinan).
- Ratón: arrastrar mueve; la rueda acerca; en 3D, botón derecho o Shift + arrastrar gira.
- Al seleccionar un municipio, la cámara lo encuadra en la parte de la pantalla que no tapa la ficha (`camera.setViewOffset`). En el teléfono la ficha abre compacta; "Detalles" la expande.
- El mapa siempre se ve claro, aunque el sistema esté en modo oscuro; solo los paneles siguen el tema.

## App (PWA)

Publicada en GitHub Pages: https://fravier3.github.io/PfknR/ — se instala en iPhone (Safari → Compartir → Añadir a pantalla de inicio) y en Android (Chrome → Instalar app). Funciona sin conexión después de la primera visita y se actualiza sola al publicar cambios.

## Funciones

- **Buscador** de pueblos, barrios, subbarrios, comunidades y sectores (índice `data/buscar.json`); te lleva directo al lugar.
- **Ubicarme**: usa el GPS para decirte en qué pueblo, barrio y cerca de qué sector estás, con un punto azul en el mapa.
- **Compartir**: el lugar abierto queda en la dirección (`#m=72035&b=…&t=s&n=Mogote`); el botón de compartir manda ese enlace. Al refrescar, la app vuelve al mismo lugar.
- **Favoritos** (estrella en la ficha), guardados en el teléfono y mostrados arriba en el buscador.
- **Actualizar**: busca una versión nueva, la instala y recarga sin perder el lugar abierto.
- **Seguir mi ubicación**: tras "Ubicarme", el punto azul te sigue; la cámara te acompaña (salvo si acabas de mover el mapa), la pantalla no se apaga y la ficha cambia sola de pueblo y barrio. "Detener" lo apaga.
- **Medir**: toca puntos en el mapa; muestra la distancia total y cuánto se sube y se baja por el relieve.
- **Población del Censo 2020** (P.L. 94-171): personas, densidad y viviendas de cada pueblo; personas de cada barrio, subbarrio y comunidad.
- **Barra de pestañas**: Capas, 3D, Ubicarme, Medir, Ruta y Más, siempre dentro de la pantalla (también en iPhone con barra inferior).
- **Ruta en carro o a pie** entre dos puntos (o desde tu ubicación), con distancia, tiempo y perfil de elevación. Usa el servicio público OSRM de FOSSGIS (routing.openstreetmap.de); necesita internet.
- **Perfil de elevación** al medir y al trazar rutas.
- **Capa de densidad de población** (hab/km², Censo 2020) para pueblos y barrios, con leyenda.
- **Clima actual** del pueblo abierto (Open-Meteo, sin clave) y **puesto por población** (#1–78).
- **Guardar todo para usar sin internet** (menú Más): descarga barrios, comunidades, subbarrios y sectores de los 78 pueblos.
- **Ayuda de ubicación**: si el permiso está negado, la app explica cómo activarlo en iPhone o Android.
- **Indicaciones paso a paso** en la ruta (en español, con flechas y distancia; tocar un paso lleva a ese punto).
- **Lugares de interés** (capa en Capas): 3,847 puntos de OpenStreetMap — salud, farmacias, escuelas, universidades, playas, hoteles, historia, miradores, deportes, policía, bomberos, gobierno y correo — con ficha, "Cómo llegar" y búsqueda (`data/lugares.json`, `scripts/lugares.py`). Casi todas las playas no tienen nombre en esos datos y aparecen como "Playa" con su barrio.
- **Comparar pueblos**: en la ficha, "Comparar con otro pueblo" muestra población, puesto, densidad, viviendas, área, altura, barrios y región lado a lado.
- **Islas con relieve**: Vieques, Culebra y Mona en 3D con alturas reales (`data/islas/`, `scripts/islas.py`).
- **Relieve exacto**: alturas en metros del USGS 3DEP (mosaicos Terrarium de AWS); altura máxima real de cada municipio y barrio.

## Archivos

- `src/app.html`: código fuente de la app (también se publica como Artifact de claude.ai; usa librerías por CDN).
- `index.html`: la PWA, **generada** con `node scripts/build-pwa.mjs` a partir de `src/app.html`. No editarla a mano.
- `manifest.webmanifest`, `sw.js`, `version.json`, `js/pwa.js`: instalación y auto-actualización. Para publicar un cambio, subir la versión en `version.json` y en `CACHE` de `sw.js`, y regenerar `index.html`.
- `libs/`: Three.js 0.147, OrbitControls, Motion 11.18.2 y fuentes (Inter, Sora, IBM Plex Mono), copiadas al repo para funcionar sin internet.
- `icons/`: icono de la app (`icon.svg` fuente, PNG 1024/512/192/180 y maskable).
- `data/`: municipios, barrios, subbarrios, comunidades, sectores, relieve y alturas.
- `scripts/`: generación de datos y de la PWA.
- `referencia/`: imágenes de referencia (regiones y barrios de Cayey).



### Corrección v1.5.1 — edificios de Cayey y centros urbanos

- La ficha municipal incluye **Ver ciudad y edificios en 3D**, incluso en modo compacto de iPhone.
- Activar la vista 3D en un municipio activa también la capa urbana; el usuario puede desactivarla desde Capas.
- El enfoque de edificios toma la etiqueta real de **barrio-pueblo** desde los datos locales (Cayey: -66.1713, 18.11196), no el centro geográfico del municipio.
- La consulta de edificios prioriza el FeatureServer OSM de ArcGIS para Caribe y Centroamérica, con reserva de Overpass si falla o viene vacío. Las peticiones se cancelan al cambiar de municipio; las alturas se leen de `height`, `building_levels` o `levels` según la fuente.
- Los edificios requieren internet, conexión al servidor y cobertura OSM. No se generan estructuras ficticias. La representación en navegador todavía requiere prueba visual en un iPhone real.


### Corrección v1.5.2 — terreno visible y edificios comprobados en Cayey y Loíza

- Se corrigió el shader para que los identificadores de selección negativos no coloreen el terreno. En la vista urbana se ocultan temporalmente el resaltado naranja, la capa de barrios y la densidad/región, y se restauran al salir.
- La vista 3D se acerca al barrio-pueblo, sin apuntar por debajo del relieve. Se puede volver a entrar tocando el mismo municipio.
- Los edificios se posicionan sobre la altura máxima del suelo bajo cada huella para evitar que queden ocultos por el terreno inclinado.
- La ficha muestra el mensaje real de carga o error y el proveedor usado, en vez de fallar silenciosamente.
- Validación remota de ArcGIS Caribe (22 nov 2026, GitHub Actions): 750 edificios de muestra para Cayey Pueblo y 750 para Loíza Pueblo; ambas respuestas HTTP 200, CORS '*', polígonos cerrados aptos para extrusión.
- Se agregó el proveedor ArcGIS Norteamérica como reserva y continúa Overpass si la primera fuente no devuelve resultados. **Nota:** disponibilidad de edificios no equivale a validación visual en Safari. Verificar en iPad después de publicar.

## Ciudades 3D y estilos PolyMap (v1.5.0)

- En **Capas → Estilo visual** se encuentran Original, Moderno, Natural, Cyberpunk, Histórico y Escala de grises. Las paletas se adaptaron de [CottageHop/PolyMap](https://github.com/CottageHop/PolyMap) (MIT). Se conserva el relieve, el Censo, los límites y los nombres de PFKNR.
- En **Capas → Edificios 3D · PolyMap**, primero selecciona un municipio. Se activa la vista 3D, se acerca al núcleo poblado y se consultan las huellas de edificios reales de **OpenStreetMap** mediante Overpass. La altura usa las etiquetas height o building:levels cuando están disponibles; si no, utiliza 7 m aproximados.
- **Actualizar edificios de esta zona** carga las construcciones alrededor del punto central de la vista (radio de 650 m). Se aplican límites de 220 edificios en móvil y 450 en escritorio. La capa se limpia al cambiar de municipio o apagarla.
- Los edificios requieren internet, pueden faltar por ausencia de datos OSM o por límites/caídas del servidor Overpass. El mapa principal y sus datos descargados siguen funcionando independientemente de esta capa. No se guardan datos de edificios para uso offline.
- El motor original sigue siendo **Three.js**. No se incorpora el renderer Rust/WASM completo de PolyMap: exigiría migrar la proyección y las capas geográficas existentes. El módulo adaptador es js/polymap-urban.js y usa los principios de extrusión y detalle por zoom de PolyMap.
- Créditos: PolyMap © CottageHop (licencia MIT); geometrías © OpenStreetMap contributors (ODbL). Fuentes de la API: overpass.private.coffee y overpass-api.de.

## Código tomado de otros repositorios

- **Motion** (motiondivision/motion, MIT): cifras que cuentan y entrada escalonada de las listas de la ficha.
- **Landing Pages** (ln-dev7/landing-pages, MIT): patrón de entrada escalonada con retraso limitado y mejora progresiva (sin animación si el sistema pide movimiento reducido).
- **EffectCraft** (storytold/EffectCraft, MIT/Apache-2.0): cielo calculado por el rayo de vista (`sky.wgsl`) y ajuste de saturación y luz del relieve (`fxt_adjust_sat`, `fxt_adjust_light` de `fx_tone.wgsl`), portados a GLSL.
- **Modern Web Guidance** (GoogleChrome): entrada de paneles con `@starting-style` y resorte `linear()`, instalación con `beforeinstallprompt` y aviso en iPhone.

### `municipios.json`

`{ id, name, areaKm2, aguaKm2, region, polys, label, nb }`: FIPS, nombre, área de tierra y agua (Censo), región, polígonos `[lon, lat]`, punto para la etiqueta y FIPS de los colindantes.

### `barrios/<FIPS>.json`

`{ id, name, pueblo, areaKm2, c, polys, label }`. `pueblo: true` marca el barrio-pueblo (casco urbano). `c` es el índice de color en la paleta común (`BAR_PALETTE` en `app.html`); dos barrios vecinos nunca comparten color.

### `subbarrios/<FIPS>.json`

`{ id, barrio, name, areaKm2, polys, label }`. `barrio` es el `id` del barrio al que pertenece.

### `sectores/<FIPS>.json`

`{ name, kind, barrio, lon, lat }`. Son puntos (OpenStreetMap casi nunca tiene el límite de un sector), asignados al barrio que los contiene. `kind`: sector, vecindario, zona, lugar, finca. La cobertura depende de lo que la comunidad de OpenStreetMap ha mapeado: hay barrios con muchos sectores y otros con ninguno.

### `comunidades/<FIPS>.json`

`{ id, name, areaKm2, polys, label }`. Son "comunidades" del Censo (lugares designados), no barrios legales. Ejemplo: **Corazón** es una comunidad de Guayama; los barrios legales de Guayama son 10.

## Cómo encajan las líneas y los colores

Municipios, barrios y comunidades salen de la misma fuente (TIGER 2014). Los barrios se simplifican juntos con `shapely.coverage_simplify` (~8 m), así las fronteras compartidas son idénticas, y cada municipio es la unión exacta de sus barrios. Los polígonos de TIGER incluyen el mar territorial, por eso se recortan con la costa del Censo 1:500k más un margen de 150 m que el relieve recorta exactamente. El color de cada barrio se pinta en una textura de 2048 px sobre el municipio, así llega hasta la línea límite.

## Generar los datos

1. `node scripts/municipios.js <carpeta GeoJSON 500k> data/municipios.json`: lista base (nombres, áreas) desde `hyperknot/country-levels-export`.
2. `node scripts/regiones.js data/municipios.json`: asigna las 6 regiones del mapa de referencia.
3. `python3 scripts/geo.py <TIGER2014> data <carpeta GeoJSON 500k>`: geometría de municipios, barrios y comunidades (requiere shapely ≥ 2.1). Usa `cousub/PR`, `place/PR` de `boundaryissues/TIGER2014`.
4. `python3 scripts/relieve.py <dem.webp> data`: textura de relieve. Luego `python3 scripts/alturas.py data <caché>`: alturas reales y `altMax`.
5. `python3 scripts/subbarrios.py tl_2023_72_subbarrio.shp data <carpeta GeoJSON 500k>`: subbarrios (TIGER 2023, www2.census.gov). Requiere pyshp.
7. `python3 scripts/indice.py data`: índice del buscador.
8. `python3 scripts/islas.py data <caché>`: relieve de Vieques, Culebra y Mona.
9. `python3 scripts/poblacion.py prgeo2020.pl data`: población y viviendas del Censo 2020 (archivo `pr2020.pl.zip` de www2.census.gov).
6. `python3 scripts/sectores.py <PR .pmtiles> data`: sectores de OpenStreetMap desde el PMTiles de `Perk4/puerto-rico-map` (extracto de BBBike). Requiere pmtiles y mapbox-vector-tile.

## Fuentes

- Límites: U.S. Census Bureau, TIGER 2014 y 2023 (dominio público) y límites cartográficos 1:500k.
- Sectores: © colaboradores de OpenStreetMap (licencia ODbL). Si la app se publica, debe mostrar ese crédito.
- Relieve: imagen `dem.webp` del repositorio público `izette1/SWCI`, hecha con un DEM de 30 m del USGS. Ese repositorio no declara licencia; para una app pública conviene regenerarla desde el DEM del USGS (dominio público).
- Alturas: USGS 3DEP vía mosaicos Terrarium de AWS (`scripts/alturas.py`), en metros reales; la textura de relieve sigue siendo la imagen de izette1/SWCI.

## API para la app

```js
PRMap.select('Ponce');          // o por FIPS: PRMap.select('72113')
PRMap.selectBarrio('Toíta');    // dentro del municipio seleccionado
PRMap.barrios;                  // barrios del municipio seleccionado
PRMap.clear();
PRMap.reset();                  // vista inicial
PRMap.showRegions(true);
PRMap.regions;                  // [{ name, color, municipios }]
PRMap.heightAt(-66.59, 18.17);  // altura aproximada en metros
PRMap.data;                     // municipios

window.addEventListener('municipio:select', e => console.log(e.detail)); // { id, name } o null
window.addEventListener('barrio:select', e => console.log(e.detail));    // { municipio, id, name, pueblo }
```
