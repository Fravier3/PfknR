"""Genera data/sectores/<FIPS>.json con sectores, vecindarios y urbanizaciones de OpenStreetMap.

Los toma de la capa `place_labels` de un PMTiles de Puerto Rico (repositorio público
Perk4/puerto-rico-map, extracto de BBBike; datos (c) colaboradores de OpenStreetMap, licencia ODbL)
y asigna cada punto al barrio que lo contiene.

Uso: python3 sectores.py <archivo .pmtiles> <carpeta mapa-3d/data>
Requiere: pmtiles, mapbox-vector-tile, shapely
"""
import sys, os, json, gzip, math
from collections import Counter
from pmtiles.reader import Reader, MmapSource
import mapbox_vector_tile as mvt
import shapely
from shapely.geometry import Point, Polygon, MultiPolygon

pm, data = sys.argv[1], sys.argv[2]
KINDS = {'hamlet': 'sector', 'neighbourhood': 'vecindario', 'suburb': 'urbanización/zona', 'quarter': 'zona',
         'locality': 'lugar', 'isolated_dwelling': 'lugar', 'farm': 'finca'}

r = Reader(MmapSource(open(pm, 'rb'))); Z = 14; n = 2 ** Z
tx = lambda lon: int((lon + 180) / 360 * n)
ty = lambda lat: int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
def lonlat(x, y): return x / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
places = {}
for x in range(tx(-68.0), tx(-65.15) + 1):
    for y in range(ty(18.6), ty(17.8) + 1):
        raw = r.get(Z, x, y)
        if not raw: continue
        try: raw = gzip.decompress(raw)
        except OSError: pass
        L = mvt.decode(raw, default_options={'y_coord_down': True}).get('place_labels')
        if not L: continue
        ext = L.get('extent', 4096)
        for ft in L['features']:
            p, g = ft['properties'], ft['geometry']
            if g['type'] != 'Point' or not p.get('name') or p.get('kind') not in KINDS: continue
            lon, lat = lonlat(x + g['coordinates'][0] / ext, y + g['coordinates'][1] / ext)
            places[(p['name'], round(lon, 3), round(lat, 3))] = (p['name'], p['kind'], lon, lat)

# barrios (de data/barrios) -> índice espacial
bars, geoms = [], []
for f in sorted(os.listdir(os.path.join(data, 'barrios'))):
    for b in json.load(open(os.path.join(data, 'barrios', f), encoding='utf-8')):
        g = MultiPolygon([Polygon(p[0], p[1:]) for p in b['polys']]).buffer(0)
        bars.append((f[:-5], b['id'], b['name'])); geoms.append(g)
munis = {m['id']: m['name'] for m in json.load(open(os.path.join(data, 'municipios.json'), encoding='utf-8'))}
norm = lambda t: t.lower().replace('barrio ', '').replace(' pueblo', '').strip()
tree = shapely.STRtree(geoms)
out = {f[:-5]: [] for f in os.listdir(os.path.join(data, 'barrios'))}
miss = 0; kinds = Counter()
for name, kind, lon, lat in places.values():
    pt = Point(lon, lat); hit = [int(j) for j in tree.query(pt, predicate='intersects')]
    if not hit:
        j = int(tree.nearest(pt))
        if geoms[j].distance(pt) > 0.003: miss += 1; continue   # en el mar o fuera de PR
        hit = [j]
    fips, bid, bname = bars[hit[0]]
    if norm(name) in (norm(bname), norm(munis.get(fips, ''))): continue   # el punto es el propio barrio o pueblo
    out[fips].append({'name': name, 'kind': KINDS[kind], 'barrio': bid, 'lon': round(lon, 5), 'lat': round(lat, 5)})
    kinds[KINDS[kind]] += 1
os.makedirs(os.path.join(data, 'sectores'), exist_ok=True)
for fips, lst in out.items():
    lst.sort(key=lambda s: s['name'])
    json.dump(lst, open(os.path.join(data, 'sectores', fips + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('lugares', sum(kinds.values()), dict(kinds), 'descartados', miss)
