"""Genera data/subbarrios/<FIPS>.json con los subbarrios oficiales del Censo (TIGER 2023, dominio público).

Solo existen en algunos barrios (sobre todo los barrios-pueblo; San Juan tiene 72). Cada subbarrio
lleva el `id` del barrio al que pertenece. Se recortan con la costa igual que los barrios.

Uso: python3 subbarrios.py <tl_2023_72_subbarrio.shp> <carpeta mapa-3d/data> <carpeta costa 500k>
Requiere: pyshp, shapely >= 2.1
Fuente: https://www2.census.gov/geo/tiger/TIGER2023/SUBBARRIO/tl_2023_72_subbarrio.zip
"""
import json, os, sys
import shapefile, shapely
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import unary_union, polylabel

shp, data, coast = sys.argv[1], sys.argv[2], sys.argv[3]
TOL = 0.00008

def polys_of(g):
    if isinstance(g, Polygon): return [g]
    return [p for p in getattr(g, 'geoms', []) if isinstance(p, Polygon)]

def coords(g):
    out = []
    for p in polys_of(g):
        rr = [[[round(x, 5), round(y, 5)] for x, y in r.coords] for r in [p.exterior] + list(p.interiors)]
        rr = [r for r in rr if len(r) >= 4]
        if rr: out.append(rr)
    return out

def label(g):
    big = max(polys_of(g), key=lambda p: p.area)
    try: pt = polylabel(big, tolerance=0.0001)
    except Exception: pt = big.representative_point()
    return [round(pt.x, 5), round(pt.y, 5)]

land = unary_union([shape(json.load(open(os.path.join(coast, f), encoding='utf-8'))['geometry']).buffer(0)
                    for f in os.listdir(coast) if f.endswith('.geojson')]).buffer(0.0015)
r = shapefile.Reader(shp, encoding='utf-8')
recs = r.records(); geoms = [shape(s.__geo_interface__).buffer(0) for s in r.shapes()]
simp = [g.intersection(land) for g in shapely.coverage_simplify(geoms, TOL, simplify_boundary=True)]

ids = sorted(f[:-5] for f in os.listdir(os.path.join(data, 'barrios')) if f.endswith('.json'))
out = {i: [] for i in ids}
for rec, g in zip(recs, simp):
    if g.is_empty: continue
    fips = '72' + rec['COUNTYFP']
    out[fips].append({'id': rec['GEOID'], 'barrio': rec['GEOID'][:10], 'name': rec['NAME'],
                      'areaKm2': round(rec['ALAND'] / 1e6, 3), 'polys': coords(g), 'label': label(g)})
os.makedirs(os.path.join(data, 'subbarrios'), exist_ok=True)
for fips, lst in out.items():
    lst.sort(key=lambda s: s['name'])
    json.dump(lst, open(os.path.join(data, 'subbarrios', fips + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('subbarrios', sum(map(len, out.values())), 'en', sum(1 for v in out.values() if v), 'municipios')
