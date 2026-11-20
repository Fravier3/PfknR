"""Relieve exacto: descarga los mosaicos de elevación "Terrarium" de AWS (Mapzen/Tilezen; en Puerto Rico
provienen del USGS 3DEP) y genera:

  data/alturas.png   alturas de la isla grande en metros: rojo*256 + verde (misma extensión que relieve.webp)
  altMax             altura máxima real (m) de cada municipio en data/municipios.json y de cada barrio en data/barrios/

Uso: python3 alturas.py <carpeta data> <carpeta de caché para los mosaicos>
Fuente: https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png (datos abiertos)
"""
import sys, os, json, math, urllib.request
import numpy as np
from PIL import Image, ImageDraw

data, cache = sys.argv[1], sys.argv[2]
os.makedirs(cache, exist_ok=True)
Z = 12; N = 2 ** Z; T = 256
W_, E_, S_, N_ = -68.0, -65.2, 17.85, 18.56            # todo Puerto Rico, con Mona, Vieques y Culebra
RB = dict(s=17.878902552457824, w=-67.27256312630682, n=18.517352656991857, e=-65.52654467314429)

def tx(lon): return (lon + 180) / 360 * N
def ty(lat): r = np.radians(lat); return (1 - np.log(np.tan(r) + 1 / np.cos(r)) / np.pi) / 2 * N
x0, x1 = int(tx(W_)), int(tx(E_)); y0, y1 = int(ty(N_)), int(ty(S_))
mos = np.zeros(((y1 - y0 + 1) * T, (x1 - x0 + 1) * T), np.float32)
for x in range(x0, x1 + 1):
    for y in range(y0, y1 + 1):
        f = os.path.join(cache, f'{Z}_{x}_{y}.png')
        if not os.path.exists(f):
            urllib.request.urlretrieve(f'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{Z}/{x}/{y}.png', f)
        a = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
        mos[(y - y0) * T:(y - y0 + 1) * T, (x - x0) * T:(x - x0 + 1) * T] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
print('mosaico', mos.shape, 'máx', round(float(mos.max()), 1), 'm')

def px(lon, lat): return (tx(lon) - x0) * T, (ty(lat) - y0) * T
def sample(lon, lat):  # bilineal
    X, Y = px(lon, lat); i, j = np.floor(X).astype(int), np.floor(Y).astype(int); fx, fy = X - i, Y - j
    i = np.clip(i, 0, mos.shape[1] - 2); j = np.clip(j, 0, mos.shape[0] - 2)
    return (mos[j, i] * (1 - fx) + mos[j, i + 1] * fx) * (1 - fy) + (mos[j + 1, i] * (1 - fx) + mos[j + 1, i + 1] * fx) * fy

# ---------- alturas.png (misma rejilla que antes: 1538 x 592) ----------
GW, GH = 1538, 592
lons = RB['w'] + (np.arange(GW) + 0.5) / GW * (RB['e'] - RB['w'])
lats = RB['n'] - (np.arange(GH) + 0.5) / GH * (RB['n'] - RB['s'])
LO, LA = np.meshgrid(lons, lats)
h = sample(LO, LA)
alpha = np.asarray(Image.open(os.path.join(data, 'relieve.webp')).convert('RGBA').resize((GW, GH), Image.BOX))[..., 3] > 127
h = np.where(alpha, np.clip(h, 0, None), 0)
dm = np.clip(np.round(h), 0, 65535).astype(np.uint32)
rgb = np.zeros((GH, GW, 3), np.uint8); rgb[..., 0] = dm >> 8; rgb[..., 1] = dm & 255
Image.fromarray(rgb, 'RGB').save(os.path.join(data, 'alturas.png'), optimize=True)
print('alturas.png máx', round(float(h.max()), 1), 'm')

# ---------- altura máxima por polígono ----------
def alt_max(polys):
    xs = [px(lo, la) for p in polys for lo, la in p[0]]
    if not xs: return None
    a0 = max(int(min(x for x, _ in xs)) - 1, 0); b0 = max(int(min(y for _, y in xs)) - 1, 0)
    a1 = min(int(max(x for x, _ in xs)) + 2, mos.shape[1]); b1 = min(int(max(y for _, y in xs)) + 2, mos.shape[0])
    m = Image.new('L', (a1 - a0, b1 - b0)); d = ImageDraw.Draw(m)
    for p in polys:
        d.polygon([(x - a0, y - b0) for x, y in (px(lo, la) for lo, la in p[0])], fill=1)
        for hole in p[1:]: d.polygon([(x - a0, y - b0) for x, y in (px(lo, la) for lo, la in hole)], fill=0)
    mk = np.asarray(m).astype(bool)
    if not mk.any(): return None
    return int(round(max(0.0, float(mos[b0:b1, a0:a1][mk].max()))))

munis = json.load(open(os.path.join(data, 'municipios.json'), encoding='utf-8'))
for mu in munis: mu['altMax'] = alt_max(mu['polys'])
json.dump(munis, open(os.path.join(data, 'municipios.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
for f in os.listdir(os.path.join(data, 'barrios')):
    p = os.path.join(data, 'barrios', f); bs = json.load(open(p, encoding='utf-8'))
    for b in bs: b['altMax'] = alt_max(b['polys'])
    json.dump(bs, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
top = sorted(munis, key=lambda m: -(m['altMax'] or 0))[:5]
print('más altos:', [(m['name'], m['altMax']) for m in top])
print('islas:', [(m['name'], m['altMax']) for m in munis if m['name'] in ('Vieques', 'Culebra', 'San Juan')])
