"""Añade la población y las viviendas del Censo 2020 (P.L. 94-171) a municipios, barrios, subbarrios y comunidades.
Campos nuevos: `pob` (personas) y `viv` (unidades de vivienda).

Uso: python3 poblacion.py <prgeo2020.pl> <carpeta data>
Fuente: https://www2.census.gov/programs-surveys/decennial/2020/data/01-Redistricting_File--PL_94-171/Puerto_Rico/pr2020.pl.zip
"""
import sys, os, json
geo, data = sys.argv[1], sys.argv[2]
pop = {}
with open(geo, encoding='latin-1') as fh:
    for line in fh:
        f = line.rstrip('\n').split('|')
        sumlev, geocomp, code = f[2], f[3], f[9]
        if geocomp != '00' or sumlev not in ('050', '060', '067', '160'): continue
        pop[(sumlev, code)] = (int(f[-7] or 0), int(f[-6] or 0))
L = lambda p: json.load(open(p, encoding='utf-8'))
def save(p, d): json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
miss = []
def put(obj, key):
    v = pop.get(key)
    if v: obj['pob'], obj['viv'] = v
    else: miss.append(key)
mu = L(os.path.join(data, 'municipios.json'))
for m in mu: put(m, ('050', m['id']))
save(os.path.join(data, 'municipios.json'), mu)
for sub, lev in (('barrios', '060'), ('subbarrios', '067'), ('comunidades', '160')):
    for f in os.listdir(os.path.join(data, sub)):
        p = os.path.join(data, sub, f); d = L(p)
        for o in d: put(o, (lev, o['id']))
        save(p, d)
print('total PR (municipios):', sum(m.get('pob', 0) for m in mu), '| sin dato:', len(miss), miss[:5])
print('ejemplos:', [(m['name'], m['pob']) for m in mu if m['name'] in ('San Juan', 'Cayey', 'Culebra')])
