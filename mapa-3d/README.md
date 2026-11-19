# Mapa 3D de Puerto Rico

Mapa 3D interactivo (Three.js 0.147) de Puerto Rico con relieve y los 78 municipios. Se puede hacer clic en cada pueblo, buscarlo por nombre y ver su ficha: código FIPS, área de tierra y de agua, altura máxima aproximada y colindancias.

## Archivos

- `index.html`: la página completa. Necesita servirse por HTTP (GitHub Pages o `python3 -m http.server`), porque carga los archivos de `data/`.
- `app.html`: la misma página en formato de Artifact de claude.ai (sin `<html>/<head>`).
- `data/municipios.json`: límites detallados de los 78 municipios.
- `data/relieve.webp`: textura de relieve de la isla grande, 4096 px, con transparencia fuera de la costa.
- `data/alturas.png`: mapa de alturas en escala de grises (negro = 0 m, blanco = 1,340 m), 1538 × 592 px, misma extensión que la textura.
- `data/barrios/<FIPS>.json`: los barrios de cada municipio (902 en total). Se cargan solo cuando se selecciona el municipio.
- `scripts/`: scripts que generaron los datos (`municipios.js` con Node, `relieve.py` con Python + Pillow + NumPy).

Extensión de la textura y del mapa de alturas: lat 17.8789 a 18.5174, lon −67.2726 a −65.5265.

## Navegación

- Teléfono: un dedo mueve el mapa; dos dedos acercan, alejan y giran.
- Ratón: arrastrar mueve; la rueda acerca; botón derecho o Shift + arrastrar gira.
- Al seleccionar un municipio, la cámara lo encuadra en la parte de la pantalla que no tapa la ficha (`camera.setViewOffset`). En el teléfono la ficha abre compacta; el botón "Detalles" la expande.
- El mapa siempre se ve claro, aunque el sistema esté en modo oscuro; solo los paneles siguen el tema.

## Datos de `municipios.json`

Un arreglo de 78 objetos, en orden alfabético:

| Campo | Qué es |
|---|---|
| `id` | Código FIPS de 5 dígitos (`72` + código del municipio) |
| `name` | Nombre oficial con acentos |
| `areaKm2`, `aguaKm2` | Área de tierra y de agua en km² (Censo) |
| `polys` | Polígonos en `[lon, lat]`; varios cuando el municipio tiene islas o cayos |
| `label` | Punto interior para la etiqueta, `[lon, lat]` |
| `nb` | Códigos FIPS de los municipios colindantes |
| `region` | Una de 6 regiones: Noroeste, Oeste, Montaña, Norte central, Sur, Este |

## Barrios

Al seleccionar un municipio se cargan sus barrios: cada uno se colorea sobre el relieve, con su límite y su nombre. Se pueden tocar en el mapa o en la lista de la ficha.

Cada archivo `data/barrios/<FIPS>.json` es un arreglo de `{ id, name, pueblo, areaKm2, polys, label, color? }`. `pueblo: true` marca el barrio-pueblo (el casco urbano). Fuente: U.S. Census Bureau, TIGER 2014, subdivisiones de condado de Puerto Rico (dominio público), vía `boundaryissues/TIGER2014`, simplificadas a ~4 m (`scripts/barrios.py`).

Cayey usa los colores de la foto de referencia `referencia/cayey-barrios.jpg` (`scripts/colores/72035.json`). Los límites del Censo coinciden con los de esa foto; dos nombres difieren y se usan los oficiales: la zona verde que la foto llama "Quebrada Abajo" es **Culebras Bajo**, y la rosada que llama "Culebras Abajo" es **Culebras Alto**. Los demás municipios reciben colores automáticos; para fijar colores de otro, crea `scripts/colores/<FIPS>.json` y vuelve a correr `barrios.py`.

## Regiones

Las 6 regiones salen del mapa de referencia `referencia/mapa-regiones.png`. Los nombres de las regiones son descriptivos (el mapa no los trae). La asignación está en `scripts/regiones.js`; para cambiar un municipio de región, edita ese archivo y corre `node scripts/regiones.js`.

## Fuentes

- Límites: U.S. Census Bureau, límites cartográficos de condados (escala 1:500,000), en la versión GeoJSON de `hyperknot/country-levels-export`. Los límites legales incluyen aguas costeras; el mapa solo dibuja las líneas sobre tierra.
- Relieve: la imagen `dem.webp` del repositorio público `izette1/SWCI`, hecha con un modelo de elevación de 30 m de Puerto Rico (USGS). Ese repositorio no declara licencia. Para una app pública conviene regenerar la textura directamente desde el DEM del USGS (dominio público).
- Las alturas se estiman a partir de los colores de esa imagen y se calibran con Cerro de Punta (1,338 m). La forma de las montañas es real; los valores en metros son aproximados.
- Vieques, Culebra, Mona y los cayos no están en la imagen de relieve y se muestran como islas planas.

## Para conectarlo con la app

```js
PRMap.select('Ponce');          // o por FIPS: PRMap.select('72113')
PRMap.clear();
PRMap.reset();                  // vista inicial
PRMap.heightAt(-66.59, 18.17);  // altura aproximada en metros
PRMap.selectBarrio('Toíta');   // dentro del municipio seleccionado
PRMap.barrios;                  // barrios del municipio seleccionado
PRMap.showRegions(true);        // colorea por regiones
PRMap.regions;                  // [{ name, color, municipios: [...] }]
PRMap.data;                     // el arreglo de municipios.json

window.addEventListener('municipio:select', e => {
  console.log(e.detail);        // { id, name } o null al deseleccionar
});
window.addEventListener('barrio:select', e => {
  console.log(e.detail);        // { municipio, id, name, pueblo }
});
```
