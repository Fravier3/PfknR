import sys, json, numpy as np
from PIL import Image
src, outdir = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
W, H = im.size
# Rellenar huecos finos (filas/columnas transparentes de <=8 px) dentro de la tierra
A = np.asarray(im).astype(np.float32)
land = A[..., 3] > 127
holes = np.zeros_like(land)
for k in range(1, 5):
    holes |= (~land) & ((np.roll(land, k, 0) & np.roll(land, -k, 0)) | (np.roll(land, k, 1) & np.roll(land, -k, 1)))
rgb = A[..., :3] * land[..., None]; wsum = land.astype(np.float32)
acc = np.zeros_like(rgb); wacc = np.zeros_like(wsum)
for dy in range(-4, 5):
    for dx in range(-4, 5):
        acc += np.roll(rgb, (dy, dx), (0, 1)); wacc += np.roll(wsum, (dy, dx), (0, 1))
fill = acc / np.maximum(wacc, 1)[..., None]
A[holes, :3] = fill[holes]; A[holes, 3] = 255
im = Image.fromarray(A.clip(0, 255).astype(np.uint8), 'RGBA')
print('filled', int(holes.sum()))
# Textura: 4096 px de ancho, con transparencia fuera de la costa
tex = im.resize((4096, round(4096 * H / W)), Image.LANCZOS)
tex.save(f'{outdir}/relieve.webp', 'WEBP', quality=86, method=6)
# Mapa de alturas a 1/4 de resolución (promedia el sombreado)
sw, sh = W // 4, H // 4
a = np.asarray(im.resize((sw, sh), Image.BOX)).astype(np.float32) / 255
r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
mx, mn = a[..., :3].max(-1), a[..., :3].min(-1)
v = mx; s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
d = np.maximum(mx - mn, 1e-6)
hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
hk = [26, 30, 40, 55, 70, 90, 100, 112]
hm = [700, 600, 420, 240, 160, 80, 30, 0]
base = np.interp(hue, hk, hm)
extra = np.where(hue < 36, np.clip((0.62 - v) / 0.30, 0, 1) * 640, 0)
h = base + extra
h = np.where((s < 0.18) & (v > 0.55), 1300, h)
h = np.where(al > 0.5, h, 0)
def blur(x, k):
    for _ in range(3):
        c = np.cumsum(np.pad(x, ((0, 0), (k + 1, k)), mode='edge'), 1); x = (c[:, 2 * k + 1:] - c[:, :-2 * k - 1]) / (2 * k + 1)
        c = np.cumsum(np.pad(x, ((k + 1, k), (0, 0)), mode='edge'), 0); x = (c[2 * k + 1:] - c[:-2 * k - 1]) / (2 * k + 1)
    return x
land = (al > 0.5).astype(np.float32)
hb = blur(h * land, 2) / np.maximum(blur(land, 2), 1e-3) * land
print('size', sw, sh, 'max', hb.max(), 'p99', np.percentile(hb[land > 0], 99))
hb = hb * (1338 / max(hb.max(), 1))
Image.fromarray(np.clip(hb / 1340 * 255, 0, 255).astype(np.uint8), 'L').save(f'{outdir}/alturas.png', optimize=True)
