// Service worker de Puerto Rico 3D: precache del núcleo, red primero para index y version.json,
// y "stale-while-revalidate" para los datos de barrios, comunidades, subbarrios y sectores.
const CACHE = 'pfknr-v1.7.5';
const DATA_CACHE = 'pfknr-datos';   // lo que se guarda con "Guardar todo para usar sin internet"
const CORE = [
  './', './index.html', './manifest.webmanifest', './version.json', './favicon.png',
  './css/fonts.css', './js/pwa.js', './js/polymap-urban.js', './js/polymap-detail.js?v=1.7.0', './js/satellite.js?v=1.7.4',
  './libs/three.min.js', './libs/OrbitControls.js', './libs/motion.js',
  './libs/fonts/inter-400.woff2', './libs/fonts/inter-500.woff2', './libs/fonts/inter-600.woff2', './libs/fonts/inter-700.woff2',
  './libs/fonts/sora-500.woff2', './libs/fonts/sora-700.woff2', './libs/fonts/ibm-plex-mono-400.woff2', './libs/fonts/ibm-plex-mono-500.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
  './data/municipios.json', './data/relieve.webp', './data/alturas.png', './data/buscar.json', './data/lugares.json',
  './data/islas/islas.json', './data/islas/este.webp', './data/islas/este-alturas.png', './data/islas/mona.webp', './data/islas/mona-alturas.png',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pfknr-v') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    return (await c.match(req, { ignoreSearch: true })) || (await c.match('./index.html')) || Response.error();
  }
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(CACHE);
  const hit = (await c.match(req)) || (await caches.match(req));
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/version.json') || url.pathname.endsWith('/')) {
    e.respondWith(networkFirst(req));
  } else {
    e.respondWith(staleWhileRevalidate(req));
  }
});
