"""Genera la geometría del mapa a partir de TIGER 2014 del Censo (dominio público):

  data/municipios.json            78 municipios (unión de sus barrios)
  data/barrios/<FIPS>.json        902 barrios, con índice de color `c` (vecinos nunca comparten color)
  data/comunidades/<FIPS>.json    comunidades del Censo (p. ej. Corazón, en Guayama)

Los barrios se simplifican juntos (coverage_simplify) para que las fronteras compartidas
sigan siendo idénticas; así municipio, barrios y colores encajan exactamente.

Los polígonos de TIGER incluyen el mar territorial, así que se recortan con la costa
(municipios del Censo 1:500k, carpeta de GeoJSON de hyperknot/country-levels-export, con
un margen de ~150 m que luego el relieve recorta exactamente).

Uso: python3 geo.py <carpeta TIGER2014> <carpeta data> <carpeta costa 500k>
Requiere: shapely >= 2.1
"""
import json, os, sys
import shapely
from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from shapely.ops import unary_union, polylabel

tiger, data, coast = sys.argv[1], sys.argv[2], sys.argv[3]
TOL = 0.00008  # ~8 m
NCOL = 10      # colores de la paleta de barrios (BAR_PALETTE en app.html)

def load(path):
    return json.load(open(path, encoding='utf-8'))['features']

def polys_of(g):
    if g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if isinstance(g, MultiPolygon): return list(g.geoms)
    return [p for p in getattr(g, 'geoms', []) if isinstance(p, Polygon)]

def coords(g):
    out = []
    for p in polys_of(g):
        rings = [p.exterior] + list(p.interiors)
        rr = [[[round(x, 5), round(y, 5)] for x, y in r.coords] for r in rings]
        rr = [r for r in rr if len(r) >= 4]
        if rr: out.append(rr)
    return out

def label(g):
    big = max(polys_of(g), key=lambda p: p.area)
    try: pt = polylabel(big, tolerance=0.0002)
    except Exception: pt = big.representative_point()
    return [round(pt.x, 5), round(pt.y, 5)]

def greedy_colors(geoms):
    n = len(geoms); nb = [set() for _ in range(n)]
    tree = shapely.STRtree(geoms)
    for i, g in enumerate(geoms):
        for j in tree.query(g):
            j = int(j)
            if j != i and g.intersection(geoms[j]).length > 0: nb[i].add(j)
    # reparte los 10 colores de la paleta: entre los que no usan sus vecinos, el menos usado
    col = [-1] * n; count = [0] * NCOL
    for i in sorted(range(n), key=lambda k: -len(nb[k])):
        used = {col[j] for j in nb[i]}
        free = [c for c in range(NCOL) if c not in used] or list(range(NCOL))
        c = min(free, key=lambda c: (count[c], (c * 7 + i) % NCOL)); col[i] = c; count[c] += 1
    return col, nb

# ---------- barrios ----------
feats = load(os.path.join(tiger, 'cousub/PR/tl_2014_72_cousub-20.geojson')) + load(os.path.join(tiger, 'cousub/PR/tl_2014_72_cousub-41.geojson'))
geoms = [shape(f['geometry']).buffer(0) for f in feats]
simp = list(shapely.coverage_simplify(geoms, TOL, simplify_boundary=True))
land = unary_union([shape(json.load(open(os.path.join(coast, f), encoding='utf-8'))['geometry']).buffer(0)
                    for f in os.listdir(coast) if f.endswith('.geojson')]).buffer(0.0015)
simp = [g.intersection(land) for g in simp]
by = {}
for f, g in zip(feats, simp):
    pr = f['properties']
    by.setdefault('72' + pr['COUNTYFP'], []).append((pr, g))

munis = json.load(open(os.path.join(data, 'municipios.json'), encoding='utf-8'))
mgeo = {}
os.makedirs(os.path.join(data, 'barrios'), exist_ok=True)
for fips, items in by.items():
    items.sort(key=lambda t: (t[0]['LSAD'] != '41', t[0]['NAME']))
    gs = [g for _, g in items]
    col, _ = greedy_colors(gs)
    out = []
    for (pr, g), c in zip(items, col):
        if g.is_empty: continue
        out.append({'id': pr['GEOID'], 'name': pr['NAME'], 'pueblo': pr['LSAD'] == '41',
                    'areaKm2': round(pr['ALAND'] / 1e6, 2), 'c': c, 'polys': coords(g), 'label': label(g)})
    json.dump(out, open(os.path.join(data, 'barrios', fips + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    mgeo[fips] = unary_union(gs)

# ---------- municipios: unión exacta de sus barrios ----------
ids = [m['id'] for m in munis]
mg = [mgeo[i] for i in ids]
_, nb = greedy_colors(mg)
for m, g, n in zip(munis, mg, nb):
    m['polys'] = coords(g); m['label'] = label(g); m['nb'] = sorted(ids[j] for j in n)
json.dump(munis, open(os.path.join(data, 'municipios.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# ---------- comunidades (place LSAD 55) ----------
os.makedirs(os.path.join(data, 'comunidades'), exist_ok=True)
com = {i: [] for i in ids}
tree = shapely.STRtree(mg)
for f in load(os.path.join(tiger, 'place/PR/tl_2014_72_place-55.geojson')):
    g = shape(f['geometry']).buffer(0).simplify(TOL).intersection(land)
    if g.is_empty: continue
    cand = [int(j) for j in tree.query(g)]
    if not cand: continue
    j = max(cand, key=lambda k: g.intersection(mg[k]).area)
    pr = f['properties']
    com[ids[j]].append({'id': pr['GEOID'], 'name': pr['NAME'], 'areaKm2': round(pr['ALAND'] / 1e6, 2), 'polys': coords(g), 'label': label(g)})
for i, lst in com.items():
    lst.sort(key=lambda c: c['name'])
    json.dump(lst, open(os.path.join(data, 'comunidades', i + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

nbar = sum(len(v) for v in by.values()); ncom = sum(len(v) for v in com.values())
print('municipios', len(munis), 'barrios', nbar, 'comunidades', ncom)
print('Guayama comunidades:', [c['name'] for c in com['72057']])
print('San Juan vecinos:', [next(m['name'] for m in munis if m['id'] == x) for x in next(m for m in munis if m['name'] == 'San Juan')['nb']])
