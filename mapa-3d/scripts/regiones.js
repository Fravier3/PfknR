// Agrega el campo `region` a data/municipios.json según el mapa de referencia (6 regiones).
const fs = require('fs');
const file = process.argv[2] || __dirname + '/../data/municipios.json';
const REG = {
  'Noroeste': ['Aguadilla','Aguada','Rincón','Moca','Isabela','Quebradillas','Camuy','Hatillo','Arecibo','Barceloneta','San Sebastián'],
  'Oeste': ['Añasco','Mayagüez','Las Marías','Maricao','Hormigueros','San Germán','Cabo Rojo','Lajas','Sabana Grande','Yauco','Guánica','Guayanilla'],
  'Montaña': ['Lares','Utuado','Adjuntas','Jayuya','Florida'],
  'Norte central': ['Manatí','Vega Baja','Vega Alta','Dorado','Toa Baja','Toa Alta','Ciales','Morovis','Corozal','Naranjito','Orocovis'],
  'Sur': ['Peñuelas','Ponce','Villalba','Juana Díaz','Coamo','Aibonito','Santa Isabel','Salinas','Guayama','Arroyo','Patillas','Maunabo'],
  'Este': ['Cataño','Bayamón','Guaynabo','San Juan','Carolina','Trujillo Alto','Loíza','Río Grande','Luquillo','Fajardo','Ceiba','Canóvanas','Gurabo','Juncos','Naguabo','Las Piedras','Humacao','Yabucoa','San Lorenzo','Caguas','Aguas Buenas','Comerío','Cidra','Cayey','Barranquitas','Culebra','Vieques'],
};
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const seen = new Set();
for (const [r, names] of Object.entries(REG)) for (const n of names) {
  const m = data.find(d => d.name === n); if (!m) throw new Error('No existe: ' + n);
  if (seen.has(n)) throw new Error('Repetido: ' + n); seen.add(n); m.region = r;
}
const miss = data.filter(d => !d.region).map(d => d.name);
if (miss.length) throw new Error('Sin región: ' + miss.join(', '));
fs.writeFileSync(file, JSON.stringify(data));
console.log('OK', Object.entries(REG).map(([r, n]) => `${r}:${n.length}`).join(' '), 'total', seen.size);
