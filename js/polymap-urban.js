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
  // Dos capas OSM públicas mantenidas en ArcGIS, con Overpass como respaldo.
  const ARCGIS_SOURCES = [
    { name: 'ArcGIS Caribe', url: 'https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/OSM_CA_Buildings/FeatureServer/0/query' },
    { name: 'ArcGIS Norteamérica', url: 'https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/OSM_NA_Buildings/FeatureServer/0/query' }
  ];
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

  async function queryArcgis(source, lat, lon, signal) {
    // +/- 700 m; FeatureServer admite hasta 2000 registros y geoJSON.
    const dx = 0.007, dy = 0.0063;
    const bbox = [lon-dx,lat-dy,lon+dx,lat+dy].map(v => v.toFixed(6)).join(',');
    const query = new URLSearchParams({
      where: '1=1', geometry: bbox, geometryType: 'esriGeometryEnvelope',
      inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: 'osm_id2,building,height,building_levels,levels,name',
      returnGeometry: 'true', resultRecordCount: '750', f: 'geojson'
    });
    const payload = await getJSONWithTimeout(source.url + '?' + query, signal, 10000);
    const features = arcgisToWays(payload);
    features.source = source.name;
    return features;
  }

  async function loadBuildings(lat, lon, opts) {
    const signal = opts && opts.signal;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 17 || lat > 19.5 || lon < -68.5 || lon > -64) {
      throw new Error('La consulta está fuera del mapa de Puerto Rico');
    }
    let error;
    for (const source of ARCGIS_SOURCES) {
      if (signal && signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      try {
        const ways = await queryArcgis(source,lat,lon,signal);
        if (ways.length) return ways;
      } catch(e) {
        if (signal && signal.aborted) throw e;
        error = new Error(source.name + ': ' + (e.message || e));
      }
    }
    const query = '[out:json][timeout:10];way["building"](around:700,' +
      lat.toFixed(6) + ',' + lon.toFixed(6) + ');out geom;';
    for (const endpoint of SOURCES) {
      if (signal && signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      try {
        const json = await getJSONWithTimeout(endpoint + '?data=' + encodeURIComponent(query), signal, 11000);
        if (!Array.isArray(json.elements)) throw new Error('Respuesta OSM inválida');
        const ways = json.elements.filter(e => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 4);
        if (ways.length) { ways.source = 'Overpass'; return ways; }
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
    // Fachadas separadas de techos: las huellas y alturas son las del servicio,
    // pero los materiales son visualización ilustrativa, no fotografía real.
    // Una paleta compartida entre construcciones: el material es ILUSTRATIVO.
    // Cada construcción conserva su polígono y altura; no inventa edificios.
    const roofMats = [], wallMats = [];
    for (let i=0;i<6;i++) {
      roofMats.push(new THREE.MeshStandardMaterial({roughness:.86,metalness:0,side:THREE.DoubleSide}));
      wallMats.push(new THREE.MeshStandardMaterial({roughness:.93,metalness:0,side:THREE.DoubleSide}));
    }
    group.userData.polyUrbanMaterials = {roofMats,wallMats};
    // Se mantiene compatibilidad con la lógica existente de estilos de PFKNR.
    group.userData.polyUrbanMaterial=roofMats[0];
    group.userData.polyUrbanWallMaterial=wallMats[0];
    recolorGroup(group,color || THEMES.original.building);
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
    const centers = [];
    for (const way of ordered) {
      if (count >= maxBuildings) break;
      const geo = way.geometry;
      if (geo.length > 180) continue;
      const first = geo[0], last = geo[geo.length - 1];
      if (Math.abs(first.lat - last.lat) > 1e-6 || Math.abs(first.lon - last.lon) > 1e-6) continue;
      const points = geo.slice(0, -1).map(p => project(p.lon, p.lat));
      if (points.length < 3 || points.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) continue;
      let x = 0, y = 0, ground = 0;
      for (const p of points) {
        x += p[0]; y += p[1];
        ground = Math.max(ground, groundAt(p[0],p[1]) || 0);
      }
      x /= points.length; y /= points.length;
      ground = Math.max(ground,groundAt(x,y) || 0);
      const shape = new THREE.Shape();
      points.forEach((p, i) => i ? shape.lineTo(p[0] - x, p[1] - y) : shape.moveTo(p[0] - x, p[1] - y));
      shape.closePath();
      const heightKm = meters(way.tags) / 1000;
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: heightKm, bevelEnabled: false, steps: 1, curveSegments: 1 });
      geometry.rotateX(-Math.PI / 2);
      const id=String(way.id||way.tags?.osm_id2||way.tags?.objectid||count);
      let hash=0;
      for(let i=0;i<id.length;i++)hash=(Math.imul(hash,31)+id.charCodeAt(i))|0;
      const kind=String(way.tags?.building||'');
      const variation=kind==='industrial'?2:kind==='commercial'?4:Math.abs(hash)%6;
      const mesh = new THREE.Mesh(geometry, [roofMats[variation],wallMats[variation]]);
      mesh.position.set(x, ground + 0.002, -y);
      mesh.receiveShadow = true;
      mesh.castShadow = false; // Ahorra memoria y GPU en iPhone.
      mesh.frustumCulled = true;
      group.add(mesh);
      centers.push({x,y,ground});
      count++;
    }
    // Elegir la concentración REAL de edificios, no el punto arbitrario
    // del barrio-pueblo. De lo contrario, en Cayey la cámara mostraba
    // terreno vacío y dejaba los edificios fuera de pantalla.
    let focus = null;
    if (centers.length) {
      const radius2 = .22 * .22;
      let best = [], bestDist = Infinity;
      for (let i=0;i<centers.length;i+=Math.max(1,Math.floor(centers.length/125))) {
        const c = centers[i];
        const near = centers.filter(p => (p.x-c.x)**2 + (p.y-c.y)**2 <= radius2);
        const dist = (c.x-project(cLon,cLat)[0])**2 + (c.y-project(cLon,cLat)[1])**2;
        if (near.length>best.length || (near.length===best.length && dist<bestDist)) {
          best = near; bestDist=dist;
        }
      }
      if (best.length<4) best=centers;
      const fx = best.reduce((t,p)=>t+p.x,0)/best.length;
      const fy = best.reduce((t,p)=>t+p.y,0)/best.length;
      const ground = Math.max(...best.map(p=>p.ground));
      focus={x:fx,y:fy,ground,clusterCount:best.length};
    }
    return { group, count, focus };
  }

  function recolorGroup(group, color) {
    const data=group?.userData?.polyUrbanMaterials;
    if(!data)return;
    const base = new THREE.Color(color);
    // Blancos de cemento, tejas terracota, metal gris y otros tonos genéricos.
    // No representan acabados observados de cada edificio.
    const roofColors=['#e4dfd2','#ae755d','#c9c8c0','#c7a780','#8c9598','#d7be99'];
    const wallColors=['#f4e9d5','#eee0d4','#f6e7d6','#ead9c0','#e6e2d9','#e5d8c6'];
    data.roofMats.forEach((m,i)=>m.color.copy(base).lerp(new THREE.Color(roofColors[i]),.85));
    data.wallMats.forEach((m,i)=>m.color.copy(base).lerp(new THREE.Color(wallColors[i]),.86));
  }

  function disposeGroup(group) {
    if (!group) return;
    group.parent && group.parent.remove(group);
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    const data=group.userData.polyUrbanMaterials;
    if(data) [...data.roofMats,...data.wallMats].forEach(m=>m.dispose());
    else {
      group.userData.polyUrbanMaterial?.dispose();
      group.userData.polyUrbanWallMaterial?.dispose();
    }
  }

  root.PolyUrban = Object.freeze({ THEMES, meters, loadBuildings, makeGroup, disposeGroup, recolorGroup });
})(window);
