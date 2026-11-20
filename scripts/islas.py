"""Relieve 3D de las islas: Vieques y Culebra (región "este") y Mona y Monito (región "mona").

Para cada región genera, con alturas reales del USGS 3DEP (mosaicos Terrarium de AWS, zoom 13, ~19 m):
  data/islas/<región>.webp           textura: tinte por altura + sombreado, transparente fuera de la tierra
  data/islas/<región>-alturas.png    alturas en metros: rojo*256 + verde (0 fuera de la tierra)
  data/islas/islas.json              extensión y tamaño de cada región

La tierra es: altura > 0.3 m dentro de los polígonos de esos municipios o barrios (sin la isla grande).
Uso: python3 islas.py <carpeta data> <carpeta caché de mosaicos>
"""
import sys, os, json, math, urllib.request
import numpy as np
from PIL import Image, ImageDraw

data, cache = sys.argv[1], sys.argv[2]
os.makedirs(cache, exist_ok=True); os.makedirs(os.path.join(data, 'islas'), exist_ok=True)
Z = 13; N = 2 ** Z; T = 256
REGIONS = {
    'este': dict(w=-65.60, e=-65.18, s=18.06, n=18.38, munis=['72147', '72049'], barrios=[]),       # Vieques, Culebra
    'mona': dict(w=-67.97, e=-67.84, s=18.05, n=18.13, munis=[], barrios=['Isla de Mona e Islote Monito']),
}
RAMP = [(0, (88, 132, 82)), (40, (112, 148, 88)), (120, (150, 158, 96)), (220, (176, 158, 104)), (320, (170, 138, 92)), (600, (140, 104, 68))]

def tx(lon): return (lon + 180) / 360 * N
def ty(lat): r = np.radians(lat); return (1 - np.log(np.tan(r) + 1 / np.cos(r)) / np.pi) / 2 * N
def tile(x, y):
    f = os.path.join(cache, f'{Z}_{x}_{y}.png')
    if not os.path.exists(f):
        urllib.request.urlretrieve(f'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{Z}/{x}/{y}.png', f)
    a = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768

L = lambda p: json.load(open(p, encoding='utf-8'))
munis = {m['id']: m for m in L(os.path.join(data, 'municipios.json'))}
mayaguez = L(os.path.join(data, 'barrios', '72097.json'))
meta = {}
for name, R in REGIONS.items():
    x0, x1 = int(tx(R['w'])), int(tx(R['e'])); y0, y1 = int(ty(R['n'])), int(ty(R['s']))
    mos = np.zeros(((y1 - y0 + 1) * T, (x1 - x0 + 1) * T), np.float32)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            mos[(y - y0) * T:(y - y0 + 1) * T, (x - x0) * T:(x - x0 + 1) * T] = tile(x, y)
    cosl = math.cos(math.radians((R['s'] + R['n']) / 2))
    TW = 2048 if name == 'este' else 1024
    TH = round(TW * (R['n'] - R['s']) / ((R['e'] - R['w']) * cosl))
    lons = R['w'] + (np.arange(TW) + 0.5) / TW * (R['e'] - R['w'])
    lats = R['n'] - (np.arange(TH) + 0.5) / TH * (R['n'] - R['s'])
    LO, LA = np.meshgrid(lons, lats)
    X = (tx(LO) - x0) * T; Y = (ty(LA) - y0) * T
    i = np.clip(np.floor(X).astype(int), 0, mos.shape[1] - 2); j = np.clip(np.floor(Y).astype(int), 0, mos.shape[0] - 2)
    fx, fy = X - i, Y - j
    h = (mos[j, i] * (1 - fx) + mos[j, i + 1] * fx) * (1 - fy) + (mos[j + 1, i] * (1 - fx) + mos[j + 1, i + 1] * fx) * fy
    # máscara: polígonos de las islas (lon/lat -> píxel) y tierra según el modelo de elevación
    mk = Image.new('L', (TW, TH)); d = ImageDraw.Draw(mk)
    polys = [p for mid in R['munis'] for p in munis[mid]['polys']] + [p for b in mayaguez if b['name'] in R['barrios'] for p in b['polys']]
    to = lambda lo, la: ((lo - R['w']) / (R['e'] - R['w']) * TW, (R['n'] - la) / (R['n'] - R['s']) * TH)
    for p in polys:
        d.polygon([to(*pt) for pt in p[0]], fill=255)
    land = (np.asarray(mk) > 0) & (h > 0.3)
    h = np.where(land, np.clip(h, 0, None), 0)
    # sombreado (luz del noroeste, 45°), exagerado para que se lea en islas bajas
    px_m = (R['e'] - R['w']) * 111320 * cosl / TW
    gy, gx = np.gradient(h * 2.5, px_m)
    slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(315), math.radians(45)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    shade = np.clip(0.55 + 0.6 * (shade - math.sin(alt)) + 0.45, 0.55, 1.25)
    ks = np.array([k for k, _ in RAMP], np.float32)
    col = np.stack([np.interp(h, ks, [c[ch] for _, c in RAMP]) for ch in range(3)], -1) * shade[..., None]
    rgba = np.dstack([np.clip(col, 0, 255), np.where(land, 255, 0)]).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(os.path.join(data, 'islas', f'{name}.webp'), 'WEBP', quality=88, method=6)
    HW, HH = TW // 4, TH // 4
    hs = Image.fromarray(h.astype(np.float32), 'F').resize((HW, HH), Image.BOX)
    hm = np.round(np.asarray(hs)).clip(0, 65535).astype(np.uint32)
    rgb = np.zeros((HH, HW, 3), np.uint8); rgb[..., 0] = hm >> 8; rgb[..., 1] = hm & 255
    Image.fromarray(rgb, 'RGB').save(os.path.join(data, 'islas', f'{name}-alturas.png'), optimize=True)
    meta[name] = dict(w=R['w'], e=R['e'], s=R['s'], n=R['n'])
    print(name, 'textura', TW, 'x', TH, '| alturas', HW, 'x', HH, '| máx', round(float(h.max()), 1), 'm')
json.dump(meta, open(os.path.join(data, 'islas', 'islas.json'), 'w'), indent=1)
