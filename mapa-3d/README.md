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

## Archivos

- `index.html`: la página completa. Se sirve por HTTP (GitHub Pages o `python3 -m http.server`), porque carga `data/`.
- `app.html`: la misma página en formato de Artifact de claude.ai (sin `<html>/<head>`).
- `data/municipios.json`: los 78 municipios.
- `data/barrios/<FIPS>.json`: barrios de cada municipio. Se cargan al seleccionar el municipio.
- `data/comunidades/<FIPS>.json`: comunidades del Censo de cada municipio.
- `data/subbarrios/<FIPS>.json`: subbarrios oficiales del Censo (solo 23 municipios; San Juan tiene 72).
- `data/sectores/<FIPS>.json`: sectores, vecindarios y lugares con nombre de OpenStreetMap.
- `data/relieve.webp`, `data/alturas.png`: textura y mapa de alturas de la isla grande (lat 17.8789–18.5174, lon −67.2726 a −65.5265; negro = 0 m, blanco = 1,340 m).
- `referencia/`: imágenes de referencia (regiones y barrios de Cayey).
- `scripts/`: cómo se generaron los datos (ver abajo).

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
4. `python3 scripts/relieve.py <dem.webp> data`: textura y alturas.
5. `python3 scripts/subbarrios.py tl_2023_72_subbarrio.shp data <carpeta GeoJSON 500k>`: subbarrios (TIGER 2023, www2.census.gov). Requiere pyshp.
6. `python3 scripts/sectores.py <PR .pmtiles> data`: sectores de OpenStreetMap desde el PMTiles de `Perk4/puerto-rico-map` (extracto de BBBike). Requiere pmtiles y mapbox-vector-tile.

## Fuentes

- Límites: U.S. Census Bureau, TIGER 2014 y 2023 (dominio público) y límites cartográficos 1:500k.
- Sectores: © colaboradores de OpenStreetMap (licencia ODbL). Si la app se publica, debe mostrar ese crédito.
- Relieve: imagen `dem.webp` del repositorio público `izette1/SWCI`, hecha con un DEM de 30 m del USGS. Ese repositorio no declara licencia; para una app pública conviene regenerarla desde el DEM del USGS (dominio público).
- Las alturas se estiman por el color de esa imagen, calibradas con Cerro de Punta (1,338 m): la forma es real, los metros son aproximados.

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
