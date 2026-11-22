/*
 * PFKNR — Capa urbana 3D basada en las ideas de renderizado por nivel de detalle
 * y las paletas originales de CottageHop/PolyMap (MIT).
 * https://github.com/CottageHop/PolyMap
 *
 * Adaptador para Three.js 0.147: conserva el relieve, los límites y la PWA.
 * Geometría y alturas: © OpenStreetMap contributors (ODbL), via Overpass API.
 * No incluye el motor Rust/WASM de PolyMap; éste utiliza otra proyección.
 */
(function (root) {
  'use strict';
  const THEMES = Object.freeze({
    original:   { label: 'Original de PFKNR', water: '#1d6f9c', park: '#6f985f', building: '#d9b08f', road: '#8c7061', land: '#ffffff' },
    modern:     { label: 'Moderno · PolyMap', water: '#42a5f5', park: '#8bc34a', building: '#e0e0e0', road: '#bdbdbd', land: '#f5f5f5' },
    cottagecore:{ label: 'Natural · PolyMap', water: '#99b3a6', park: '#8c9959', building: '#d9b08f', road: '#8c7061', land: '#f2e6d9' },
    cyberpunk:  { label: 'Cyberpunk · PolyMap', water: '#0a1628', park: '#1a0a12', building: '#a82929', road: '#00d4e8', land: '#0c1020' },
    oldworld:   { label: 'Histórico · PolyMap', water: '#5b7e8a', park: '#6b7c47', building: '#c4a265', road: '#8b4513', land: '#e8d5a3' },
    greyscale:  { label: 'Escala de grises · PolyMap', water: '#888888', park: '#aaaaaa', building: '#666666', road: '#777777', land: '#f0f0f0' }
  });

  // Priorizamos ArcGIS FeatureServer (huellas OSM Caribe y América Central).
  // Overpass sirve de alternativa para evitar depender de un único proveedor.
  const BUILDINGS_ARCGIS = 'https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/OSM_CA_Buildings/FeatureServer/0/query';
  const SOURCES = [
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  function meters(tags) {
    const text = String((tags && tags.height) || '').replace(',', '.').trim();
    const parsed = parseFloat(text);
    const ft = /\b(ft|feet)\b|'/i.test(text);
    const explicit = Number.isFinite(parsed) && parsed > 0 ? parsed * (ft ? 0.3048 : 1) : NaN;
    const floors = parseFloat(String((tags && (tags['building:levels'] || tags.building_levels || tags.levels)) || ''));
    return Math.max(2.8, Math.min(180, Number.isFinite(explicit) ? explicit : Number.isFinite(floors) && floors > 0 ? floors * 3.1 : 7));
  }

  async function getJSONWithTimeout(url, signal, timeoutMs) {
    const ctrl = new AbortController();
    const cancel = () => ctrl.abort();
    if (signal && signal.aborted) throw new DOMException('Cancelado', 'AbortError');
    if (signal) signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs);
    try {
      const response = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const json = await response.json();
      if (json.error) throw new Error(json.error.message || 'Servicio de mapas rechazó la consulta');
      return json;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', cancel);
    }
  }

  // Devuelve las superficies reales de cada edificio con la misma estructura
  // que Overpass: no genera edificios ficticios para llenar áreas sin datos.
  function arcgisToWays(payload) {
    if (!payload || !Array.isArray(payload.features)) throw new Error('ArcGIS: datos inválidos');
    const out = [];
    for (const feature of payload.features) {
      if (!feature || !feature.geometry) continue;
      let rings = [];
      const geo = feature.geometry;
      if (geo.type === 'Polygon') rings = geo.coordinates.slice(0, 1);
      else if (geo.type === 'MultiPolygon') rings = geo.coordinates.map(p => p[0]);
      else if (Array.isArray(geo.rings)) rings = geo.rings.slice(0, 1);
      for (const ring of rings) {
        if (!Array.isArray(ring) || ring.length < 4) continue;
        const geometry = ring.map(p => ({ lon: Number(p[0]), lat: Number(p[1]) }));
        if (geometry.some(p => !Number.isFinite(p.lon) || !Number.isFinite(p.lat))) continue;
        const tags = feature.properties || feature.attributes || {};
        out.push({ id: tags.osm_id2 || tags.objectid, type:'way', geometry, tags });
      }
    }
    return out;
  }

  async function queryArcgis(lat, lon, signal) {
    // +/- 700 m; FeatureServer admite hasta 2000 registros y geoJSON.
    const dx = 0.007, dy = 0.0063;
    const bbox = [lon-dx,lat-dy,lon+dx,lat+dy].map(v => v.toFixed(6)).join(',');
    const query = new URLSearchParams({
      where: '1=1', geometry: bbox, geometryType: 'esriGeometryEnvelope',
      inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: 'osm_id2,building,height,building_levels,levels,name',
      returnGeometry: 'true', resultRecordCount: '750', f: 'geojson'
    });
    const payload = await getJSONWithTimeout(BUILDINGS_ARCGIS + '?' + query, signal, 12500);
    return arcgisToWays(payload);
  }

  async function loadBuildings(lat, lon, opts) {
    const signal = opts && opts.signal;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 17 || lat > 19.5 || lon < -68.5 || lon > -64) {
      throw new Error('La consulta está fuera del mapa de Puerto Rico');
    }
    let error;
    try {
      const ways = await queryArcgis(lat,lon,signal);
      if (ways.length) return ways;
    } catch (e) {
      if (signal && signal.aborted) throw e;
      error = e;
    }
    const query = '[out:json][timeout:10];way["building"](around:700,' +
      lat.toFixed(6) + ',' + lon.toFixed(6) + ');out geom;';
    for (const endpoint of SOURCES) {
      if (signal && signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      try {
        const json = await getJSONWithTimeout(endpoint + '?data=' + encodeURIComponent(query), signal, 11000);
        if (!Array.isArray(json.elements)) throw new Error('Respuesta OSM inválida');
        const ways = json.elements.filter(e => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 4);
        if (ways.length) return ways;
      } catch (e) {
        if (signal && signal.aborted) throw e;
        error = e;
      }
    }
    if (error) throw error;
    return [];
  }

  function makeGroup(options) {
    const { ways, THREE, project, groundAt, center, maxBuildings, color } = options;
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: color || THEMES.original.building, roughness: 0.82,
      metalness: 0.06, side: THREE.DoubleSide
    });
    group.userData.polyUrbanMaterial = mat;
    if (!Array.isArray(ways)) return { group, count: 0 };
    const cLat = center.lat, cLon = center.lon;
    const dist2 = way => {
      const g = way.geometry || [];
      const n = g.length || 1;
      let lat = 0, lon = 0;
      for (const p of g) { lat += p.lat; lon += p.lon; }
      return Math.pow(lat / n - cLat, 2) + Math.pow((lon / n - cLon) * 0.95, 2);
    };
    const ordered = ways.slice().sort((a, b) => dist2(a) - dist2(b));
    let count = 0;
    for (const way of ordered) {
      if (count >= maxBuildings) break;
      const geo = way.geometry;
      if (geo.length > 180) continue;
      const first = geo[0], last = geo[geo.length - 1];
      if (Math.abs(first.lat - last.lat) > 1e-6 || Math.abs(first.lon - last.lon) > 1e-6) continue;
      const points = geo.slice(0, -1).map(p => project(p.lon, p.lat));
      if (points.length < 3 || points.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) continue;
      let x = 0, y = 0;
      for (const p of points) { x += p[0]; y += p[1]; }
      x /= points.length; y /= points.length;
      const shape = new THREE.Shape();
      points.forEach((p, i) => i ? shape.lineTo(p[0] - x, p[1] - y) : shape.moveTo(p[0] - x, p[1] - y));
      shape.closePath();
      const heightKm = meters(way.tags) / 1000;
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: heightKm, bevelEnabled: false, steps: 1, curveSegments: 1 });
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(x, Math.max(0, groundAt(x, y)) + 0.003, -y);
      mesh.receiveShadow = true;
      mesh.castShadow = false; // Ahorra memoria y GPU en iPhone.
      mesh.frustumCulled = true;
      group.add(mesh);
      count++;
    }
    return { group, count };
  }

  function disposeGroup(group) {
    if (!group) return;
    group.parent && group.parent.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    if (group.userData.polyUrbanMaterial) group.userData.polyUrbanMaterial.dispose();
  }

  root.PolyUrban = Object.freeze({ THEMES, meters, loadBuildings, makeGroup, disposeGroup });
})(window);
