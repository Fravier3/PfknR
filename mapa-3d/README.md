# Mapa 3D de Puerto Rico

Mapa 3D interactivo (Three.js 0.147) con los 78 municipios. Cada municipio es un bloque extruido; se puede hacer clic, buscar por nombre y ver su ficha (código FIPS, área terrestre, colindancias).

## Archivos

- `index.html`: página completa, se abre directo en el navegador o en GitHub Pages.
- `app.html`: la misma página en formato de Artifact de claude.ai (sin `<html>/<head>`).
- `data/municipios.json`: los datos, listos para reutilizar en la app.

## Datos (`data/municipios.json`)

Un arreglo de 78 objetos, en orden alfabético:

| Campo | Qué es |
|---|---|
| `id` | Código FIPS de 5 dígitos (`72` + código del municipio) |
| `name` | Nombre oficial con acentos |
| `areaKm2` | Área terrestre en km² (Censo 2010) |
| `polys` | Polígonos en `[lon, lat]` (varios cuando el municipio incluye islas o cayos) |
| `label` | Punto interior para poner la etiqueta, `[lon, lat]` |
| `nb` | Códigos FIPS de los municipios colindantes |

Fuente: límites cartográficos de condados del U.S. Census Bureau (versión GeoJSON de `plotly/datasets`). Es una geometría simplificada: buena para ver el mapa completo, menos detallada al acercarse mucho. Las colindancias se calculan por vértices compartidos en esa geometría.

## Para conectarlo con la app

La página expone:

```js
PRMap.select('Ponce');   // o por FIPS: PRMap.select('72113')
PRMap.clear();
PRMap.reset();           // vista inicial
PRMap.data;              // el mismo arreglo de municipios.json

window.addEventListener('municipio:select', e => {
  console.log(e.detail); // { id, name } o null al deseleccionar
});
```
