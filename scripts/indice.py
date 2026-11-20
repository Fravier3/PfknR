"""Genera data/buscar.json: índice para el buscador con barrios, subbarrios, comunidades y sectores.
Cada entrada: [nombre, tipo, FIPS del municipio, id del barrio ('' si no aplica), lon, lat]
tipo: b = barrio, u = subbarrio, c = comunidad, s = sector (u otro lugar de OpenStreetMap)
Uso: python3 indice.py <carpeta data>
"""
import json, os, sys
data = sys.argv[1]
out = []
L = lambda d: json.load(open(d, encoding='utf-8'))
for f in sorted(os.listdir(os.path.join(data, 'barrios'))):
    fips = f[:-5]
    for b in L(os.path.join(data, 'barrios', f)):
        out.append([b['name'] + (' Pueblo' if b['pueblo'] else ''), 'b', fips, b['id'], *b['label']])
    for s in L(os.path.join(data, 'subbarrios', f)):
        out.append([s['name'], 'u', fips, s['barrio'], *s['label']])
    for c in L(os.path.join(data, 'comunidades', f)):
        out.append([c['name'], 'c', fips, '', *c['label']])
    for s in L(os.path.join(data, 'sectores', f)):
        out.append([s['name'], 's', fips, s['barrio'], s['lon'], s['lat']])
json.dump(out, open(os.path.join(data, 'buscar.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('entradas', len(out))
