"""Genera data/barrios/<FIPS>.json a partir de TIGER 2014 (COUSUB de Puerto Rico, dominio público).
Uso: python3 barrios.py <carpeta con tl_2014_72_cousub-20.geojson y -41.geojson> <carpeta de salida>"""
import json, math, sys, os
src, out = sys.argv[1], sys.argv[2]
feats = []
for k in ('20', '41'):
    feats += json.load(open(os.path.join(src, f'tl_2014_72_cousub-{k}.geojson')))['features']
COS = math.cos(math.radians(18.2))
TOL = 0.00004  # grados (~4 m)

def dp(pts):
    if len(pts) < 5: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); ax, ay = pts[a][0] * COS, pts[a][1]; bx, by = pts[b][0] * COS, pts[b][1]
        dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-12; best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i][0] * COS, pts[i][1]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / L
            if d > best: best, bi = d, i
        if best > TOL: keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

def dp_ring(r):
    # anillo cerrado: se parte en dos mitades para que los extremos no coincidan
    if len(r) < 8: return r
    m = len(r) // 2
    return dp(r[:m + 1]) + dp(r[m:])[1:]

def inside(pt, poly):
    c = False
    for r in poly:
        j = len(r) - 1
        for i in range(len(r)):
            xi, yi = r[i]; xj, yj = r[j]
            if (yi > pt[1]) != (yj > pt[1]) and pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi: c = not c
            j = i
    return c

def segd(p, a, b):
    ax, bx, px = a[0] * COS, b[0] * COS, p[0] * COS; dx, dy = bx - ax, b[1] - a[1]
    t = ((px - ax) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy or 1); t = max(0, min(1, t))
    return math.hypot(px - ax - t * dx, p[1] - a[1] - t * dy)

def area(r): return abs(sum(r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1] for i in range(len(r)))) / 2

def label(polys):
    big = max(polys, key=lambda p: area(p[0]))
    xs = [p[0] for p in big[0]]; ys = [p[1] for p in big[0]]
    best, bd, N = None, -1, 30
    for i in range(N + 1):
        for j in range(N + 1):
            p = (min(xs) + (max(xs) - min(xs)) * i / N, min(ys) + (max(ys) - min(ys)) * j / N)
            if not inside(p, big): continue
            d = min(segd(p, r[k], r[k + 1]) for r in big for k in range(len(r) - 1))
            if d > bd: bd, best = d, p
    return [round(best[0], 5), round(best[1], 5)] if best else [round(sum(xs) / len(xs), 5), round(sum(ys) / len(ys), 5)]

by = {}
for f in feats:
    pr = f['properties']; g = f['geometry']
    polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
    polys = [[[[round(x, 5), round(y, 5)] for x, y in dp_ring(r)] for r in p if len(dp_ring(r)) >= 4] for p in polys]
    polys = [p for p in polys if p]
    simp = [p for p in polys if len(p[0]) >= 4]
    if not simp: continue  # cayo diminuto que desaparece al simplificar
    polys = simp
    by.setdefault('72' + pr['COUNTYFP'], []).append({
        'id': pr['GEOID'], 'name': pr['NAME'], 'pueblo': pr['LSAD'] == '41',
        'areaKm2': round(pr['ALAND'] / 1e6, 2), 'polys': polys, 'label': label(polys)})
tot = 0
COLDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'colores')
for fips, bs in by.items():
    bs.sort(key=lambda b: (not b['pueblo'], b['name']))
    cf = os.path.join(COLDIR, fips + '.json')   # colores fijos (p. ej. Cayey, tomados de la foto de referencia)
    if os.path.exists(cf):
        cols = json.load(open(cf, encoding='utf-8'))
        for b in bs:
            if b['name'] in cols: b['color'] = cols[b['name']]
    s = json.dumps(bs, ensure_ascii=False, separators=(',', ':')); tot += len(s.encode())
    open(os.path.join(out, fips + '.json'), 'w', encoding='utf-8').write(s)
print('municipios', len(by), 'barrios', sum(map(len, by.values())), 'MB', round(tot / 1e6, 2))
