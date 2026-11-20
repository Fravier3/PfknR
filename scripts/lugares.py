"""Lugares de interés (OpenStreetMap, © colaboradores de OSM, licencia ODbL) desde el PMTiles de Puerto Rico
(Perk4/puerto-rico-map). Genera data/lugares.json: [nombre, categoría, FIPS, id del barrio, lon, lat].

Categorías: salud, farmacia, escuela, universidad, policia, bomberos, gobierno, correo, playa, hotel, historia, deporte, mirador.
Las playas son áreas sin nombre en ese archivo: se nombran con el sector/lugar "Playa …" o "Balneario …" más cercano
(≤ 800 m); si no hay, quedan como "Playa" y la app muestra su barrio.

Uso: python3 lugares.py <archivo .pmtiles> <carpeta data>
"""
import sys, os, json, gzip, math
from collections import Counter
from pmtiles.reader import Reader, MmapSource
import mapbox_vector_tile as mvt
import shapely
from shapely.geometry import Point, Polygon, MultiPolygon, shape

pm, data = sys.argv[1], sys.argv[2]
CAT = {('amenity', 'hospital'): 'salud', ('amenity', 'clinic'): 'salud', ('amenity', 'doctors'): 'salud',
       ('amenity', 'pharmacy'): 'farmacia', ('shop', 'chemist'): 'farmacia',
       ('amenity', 'school'): 'escuela', ('amenity', 'university'): 'universidad', ('amenity', 'college'): 'universidad',
       ('amenity', 'police'): 'policia', ('amenity', 'fire_station'): 'bomberos',
       ('amenity', 'townhall'): 'gobierno', ('amenity', 'courthouse'): 'gobierno', ('amenity', 'post_office'): 'correo',
       ('tourism', 'hotel'): 'hotel', ('tourism', 'guest_house'): 'hotel', ('tourism', 'museum'): 'historia',
       ('historic', 'ruins'): 'historia', ('historic', 'monument'): 'historia', ('historic', 'memorial'): 'historia', ('historic', 'fort'): 'historia', ('historic', 'castle'): 'historia',
       ('leisure', 'stadium'): 'deporte', ('leisure', 'sports_centre'): 'deporte', ('tourism', 'viewpoint'): 'mirador'}
r = Reader(MmapSource(open(pm, 'rb'))); Z = 14; n = 2 ** Z
tx = lambda lon: int((lon + 180) / 360 * n)
ty = lambda lat: int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
def lonlat(x, y): return x / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
pois, beaches, playnames = {}, [], []
for x in range(tx(-68.0), tx(-65.15) + 1):
    for y in range(ty(18.6), ty(17.8) + 1):
        raw = r.get(Z, x, y)
        if not raw: continue
        try: raw = gzip.decompress(raw)
        except OSError: pass
        t = mvt.decode(raw, default_options={'y_coord_down': True})
        for L in ('pois', 'land', 'place_labels'):
            lay = t.get(L)
            if not lay: continue
            ext = lay.get('extent', 4096)
            to = lambda c: lonlat(x + c[0] / ext, y + c[1] / ext)
            for f in lay['features']:
                p, g = f['properties'], f['geometry']
                if L == 'pois':
                    cat = next((CAT[(k, p.get(k))] for k in ('amenity', 'tourism', 'historic', 'leisure', 'shop') if (k, p.get(k)) in CAT), None)
                    if not cat or not p.get('name') or g['type'] != 'Point': continue
                    lon, lat = to(g['coordinates'])
                    pois[(p['name'], cat, round(lon, 3), round(lat, 3))] = (p['name'], cat, lon, lat)
                elif L == 'land' and p.get('kind') == 'beach':
                    rings = g['coordinates'] if g['type'] == 'Polygon' else [pp[0] for pp in g['coordinates']]
                    for ring in (rings if g['type'] == 'MultiPolygon' else [rings[0]]):
                        pts = [to(c) for c in ring]
                        if len(pts) >= 4: beaches.append(Polygon(pts).buffer(0))
                elif L == 'place_labels' and g['type'] == 'Point':
                    nm = p.get('name') or ''
                    if nm.lower().startswith(('playa', 'balneario')) and len(nm) > 6: playnames.append((nm, Point(*to(g['coordinates']))))
# playas: une los trozos de cada playa (cortados por los mosaicos) y toma un punto interior
beach_u = shapely.union_all([b for b in beaches if not b.is_empty]).buffer(0.0003).buffer(-0.0003)
bgeoms = [g for g in getattr(beach_u, 'geoms', [beach_u]) if g.area > 2e-8]
for nm in json.load(open(os.path.join(data, 'buscar.json'), encoding='utf-8')):
    if nm[0].lower().startswith(('playa', 'balneario')) and len(nm[0]) > 6: playnames.append((nm[0], Point(nm[4], nm[5])))
for g in bgeoms:
    pt = g.representative_point()
    best = min(playnames, key=lambda q: q[1].distance(pt), default=None)
    name = best[0] if best and best[1].distance(pt) < 0.0075 else 'Playa'
    pois[(name, 'playa', round(pt.x, 3), round(pt.y, 3))] = (name, 'playa', pt.x, pt.y)
# asigna municipio y barrio
bars, geoms = [], []
for f in sorted(os.listdir(os.path.join(data, 'barrios'))):
    for b in json.load(open(os.path.join(data, 'barrios', f), encoding='utf-8')):
        bars.append((f[:-5], b['id'])); geoms.append(MultiPolygon([Polygon(p[0], p[1:]) for p in b['polys']]).buffer(0))
tree = shapely.STRtree(geoms)
out, cnt = [], Counter()
for name, cat, lon, lat in pois.values():
    pt = Point(lon, lat); hit = [int(j) for j in tree.query(pt, predicate='intersects')]
    if not hit:
        j = int(tree.nearest(pt))
        if geoms[j].distance(pt) > 0.004: continue
        hit = [j]
    fips, bid = bars[hit[0]]
    out.append([name, cat, fips, bid, round(lon, 5), round(lat, 5)]); cnt[cat] += 1
out.sort(key=lambda e: (e[1], e[0]))
json.dump(out, open(os.path.join(data, 'lugares.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('lugares', len(out), dict(cnt), '| playas con nombre', sum(1 for e in out if e[1] == 'playa' and e[0] != 'Playa'))
