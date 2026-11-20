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
