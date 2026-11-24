/* USGS imagery in the map's existing local projection and camera. */
(function (root) {
  'use strict';

  const BASE = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile';
  const DETAIL = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage';
  const R = 6378137;
  const HALF_WORLD = Math.PI * R;
  const LAYER = 1;
  const keyOf = ({ z, x, y }) => z + '/' + x + '/' + y;
  const lonAt = x => x * 360 - 180;
  const latAt = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;
  const tileX = lon => (lon + 180) / 360;
  const tileY = lat => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2;
  const parentOf = ({ z, x, y }) => ({ z: z - 1, x: x >> 1, y: y >> 1 });

  function imageUrl({ z, x, y }) {
    if (z <= 16) return BASE + '/' + z + '/' + y + '/' + x;
    const size = 2 ** z;
    const east = col => Math.round((2 * col / size - 1) * HALF_WORLD * 100) / 100;
    const north = row => Math.round((1 - 2 * row / size) * HALF_WORLD * 100) / 100;
    const params = new URLSearchParams({
      bbox: [east(x), north(y + 1), east(x + 1), north(y)].join(','),
      bboxSR: '3857', imageSR: '3857', size: '256,256', format: 'png32', f: 'image'
    });
    return DETAIL + '?' + params;
  }

  function create({ THREE, scene, project, unproject, municipalities, onStatus }) {
    const tiles = new Map();
    const photo = new THREE.Group();
    const tileGroup = new THREE.Group();
    const ray = new THREE.Ray();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    const tilePlane = new THREE.Vector3();
    const bounds = new THREE.Box2();
    const place = new THREE.Vector2();
    const navy = new THREE.Color('#102c3c');
    const municipalLines = new THREE.LineBasicMaterial({
      color: '#e4f5fc', opacity: .72, transparent: true, depthTest: false, depthWrite: false
    });
    const focusLine = new THREE.LineBasicMaterial({
      color: '#ffcf67', transparent: true, depthTest: false, depthWrite: false
    });
    const outlines = makeOutline(municipalities.flatMap(m => m.polys), municipalLines, 3);
    let selectedOutline = null;
    let requestedSelection = -1;
    let visibleTiles = new Set();
    let loading = 0;
    let active = false;
    let lastView = '';
    let nextUpdate = 0;
    let retryAt = Infinity;
    let status = '';
    photo.add(tileGroup, outlines);
    scene.add(photo);
    photo.visible = false;

    function makeOutline(polygons, material, order) {
      const vertices = [];
      for (const polygon of polygons) for (const ring of polygon) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [x1, y1] = project(...ring[j]);
          const [x2, y2] = project(...ring[i]);
          if (x1 !== x2 || y1 !== y2) vertices.push(x1, 0, -y1, x2, 0, -y2);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      const line = new THREE.LineSegments(geometry, material);
      line.layers.set(LAYER);
      line.renderOrder = order;
      return line;
    }

    function setOutlines(visible, selected) {
      outlines.visible = visible;
      if (requestedSelection !== selected) {
        requestedSelection = selected;
        if (selectedOutline) {
          selectedOutline.geometry.dispose();
          photo.remove(selectedOutline);
        }
        selectedOutline = selected < 0 ? null : makeOutline(municipalities[selected].polys, focusLine, 4);
        if (selectedOutline) photo.add(selectedOutline);
      }
      if (selectedOutline) selectedOutline.visible = visible;
    }

    function makeTile(tile, image) {
      const scale = 2 ** tile.z;
      const west = lonAt(tile.x / scale);
      const east = lonAt((tile.x + 1) / scale);
      const geometry = new THREE.PlaneGeometry(1, 1, 1, 8);
      const pos = geometry.attributes.position;
      const rows = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const latitude = latAt((tile.y + (i >> 1) / 8) / scale);
        const [x, y] = project(i % 2 ? east : west, latitude);
        rows.set([x, 0, -y], i * 3);
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(rows, 3));
      const texture = new THREE.Texture(image);
      texture.encoding = THREE.sRGBEncoding;
      texture.needsUpdate = true;
      const material = new THREE.MeshBasicMaterial({
        map: texture, alphaTest: .5, depthTest: false, depthWrite: false, fog: false, toneMapped: false
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.layers.set(LAYER);
      mesh.renderOrder = tile.z - 32;
      mesh.visible = false;
      tileGroup.add(mesh);
      return mesh;
    }

    function dispose(entry) {
      if (!entry.mesh) return;
      tileGroup.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh.material.map.dispose();
      entry.mesh.material.dispose();
    }

    function report(value) {
      if (value === status) return;
      status = value;
      onStatus(value);
    }

    function load(tile) {
      const key = keyOf(tile);
      const entry = { mesh: null, failedUntil: Infinity, touched: performance.now() };
      tiles.set(key, entry);
      loading++;
      const image = new Image();
      image.crossOrigin = 'anonymous';
      const timer = setTimeout(() => {
        image.removeAttribute('src');
        finish(false);
      }, 10000);
      function finish(ok) {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        entry.cancel = null;
        loading--;
        if (ok) entry.mesh = makeTile(tile, image);
        else entry.failedUntil = performance.now() + 20000;
        lastView = '';
      }
      entry.cancel = () => {
        image.onload = image.onerror = null;
        image.removeAttribute('src');
        finish(false);
        tiles.delete(key);
      };
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = imageUrl(tile);
    }

    function setActive(value) {
      active = photo.visible = value;
      lastView = '';
      nextUpdate = 0;
      if (value) {
        report('loading');
      } else {
        for (const entry of tiles.values()) entry.cancel?.();
      }
    }

    function retry() {
      for (const [key, entry] of tiles) if (!entry.mesh && !entry.cancel) tiles.delete(key);
      lastView = '';
      nextUpdate = 0;
    }

    function intersect(camera, x, y) {
      point.set(x, y, .5).unproject(camera);
      ray.origin.copy(camera.position);
      ray.direction.copy(point).sub(ray.origin).normalize();
      return ray.intersectPlane(ground, tilePlane);
    }

    function viewport(camera, size, from) {
      bounds.makeEmpty();
      for (const x of [from, 1]) for (const y of [-1, 1]) {
        const p = intersect(camera, x, y);
        if (!p) return null;
        const [lon, lat] = unproject(p.x, -p.z);
        place.set(tileX(lon), tileY(lat));
        bounds.expandByPoint(place);
      }
      const resolution = (bounds.max.x - bounds.min.x) / (size.w * (1 - from) / 2);
      const zoom = Math.round(Math.log2(1 / (resolution * 256)));
      const z = THREE.MathUtils.clamp(zoom, 7, 18);
      const count = 2 ** z;
      return {
        z, x0: Math.floor(bounds.min.x * count), x1: Math.floor(bounds.max.x * count),
        y0: Math.floor(bounds.min.y * count), y1: Math.floor(bounds.max.y * count)
      };
    }

    function update(camera, size, from = -1) {
      const now = performance.now();
      if (!active || now < nextUpdate) return;
      nextUpdate = now + 100;
      const view = viewport(camera, size, from);
      if (!view) return;
      const { z, x0, x1, y0, y1 } = view;
      const viewKey = [z, x0, x1, y0, y1].join('/');
      if (viewKey === lastView && now < retryAt) return;
      retryAt = Infinity;
      lastView = viewKey;
      const needed = new Map();
      const wanted = new Set();
      const pending = [];
      const request = (tile, priority) => {
        const key = keyOf(tile);
        if (needed.has(key)) return;
        needed.set(key, tile);
        const entry = tiles.get(key);
        if (entry?.mesh) wanted.add(entry.mesh);
        else if (!entry || entry.failedUntil <= now) pending.push({ tile, priority });
        else if (!entry.cancel) retryAt = Math.min(retryAt, entry.failedUntil);
        if (entry) entry.touched = now;
      };
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const tile = { z, x, y };
        const distance = Math.hypot(x - (x0 + x1) / 2, y - (y0 + y1) / 2);
        let cover = parentOf(tile);
        while (cover.z > (z > 16 ? 16 : z - 2)) cover = parentOf(cover);
        request(cover, distance);
        request(tile, 20 + distance);
        // Keep any closer ancestor already loaded during a zoom gesture.
        for (let a = tile; a.z >= 5; a = parentOf(a)) {
          const parent = tiles.get(keyOf(a));
          if (parent?.mesh) {
            wanted.add(parent.mesh);
            parent.touched = now;
            if (a.z < cover.z) break;
          }
        }
      }
      visibleTiles.forEach(mesh => { if (!wanted.has(mesh)) mesh.visible = false; });
      wanted.forEach(mesh => { mesh.visible = true; });
      visibleTiles = wanted;
      pending.sort((a, b) => a.priority - b.priority);
      while (loading < 6 && pending.length) load(pending.shift().tile);
      if (pending.length || loading) report(wanted.size ? 'detail' : 'loading');
      else report(wanted.size ? 'ready' : 'error');
      if (tiles.size > 96) {
        const offscreen = [...tiles].filter(([, tile]) => !tile.cancel && tile.touched !== now)
          .sort((a, b) => a[1].touched - b[1].touched);
        while (tiles.size > 96 && offscreen.length) {
          const [key, entry] = offscreen.shift();
          dispose(entry);
          tiles.delete(key);
        }
      }
    }

    return { setActive, setOutlines, update, retry, navy };
  }

  root.PRSatellite = Object.freeze({ create, layer: LAYER });
})(window);
