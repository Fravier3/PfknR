// Genera index.html (la PWA publicada en GitHub Pages) a partir de src/app.html (la fuente, que también
// se publica como Artifact). Cambia las librerías del CDN por las copias de libs/, las fuentes de Google
// por css/fonts.css, añade las metaetiquetas de app nativa y el script de instalación/actualización.
// Uso: node scripts/build-pwa.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/app.html'), 'utf8');
const { version } = JSON.parse(readFileSync(join(root, 'version.json'), 'utf8'));

const replaceOnce = (text, from, to) => {
  if (!text.includes(from)) throw new Error(`No se encontró en src/app.html: ${from.slice(0, 80)}`);
  return text.replace(from, to);
};

let html = src;
html = html.replace(/<link rel="preconnect"[^>]*>\n/g, '');
html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="css/fonts.css">');
html = replaceOnce(html, 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js', 'libs/three.min.js');
html = replaceOnce(html, 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js', 'libs/OrbitControls.js');
html = replaceOnce(html, 'https://cdn.jsdelivr.net/npm/motion@11.18.2/dist/motion.js', 'libs/motion.js');
html = html.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '');

const cut = html.indexOf('</style>') + '</style>'.length;
const head = html.slice(0, cut), body = html.slice(cut);
const meta = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="description" content="Mapa 3D de Puerto Rico con relieve, 78 municipios, barrios, subbarrios, comunidades y sectores.">
<meta name="theme-color" content="#0b3a52">
<meta name="color-scheme" content="light dark">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="PR 3D">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" href="favicon.png" sizes="32x32">
<link rel="icon" href="icons/icon-192.png" sizes="192x192">
<link rel="preload" href="data/municipios.json" as="fetch" crossorigin>
`;
// Ajustes de app nativa (skill apps-fran): sin rebote, sin selección accidental, altura dinámica
const nativeCss = `<style>
html, body { overscroll-behavior: none; -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; }
body { margin: 0; height: 100vh; height: 100dvh; user-select: none; -webkit-user-select: none; }
input, textarea { user-select: text; -webkit-user-select: text; font-size: max(16px, 1em); }
button { touch-action: manipulation; }
:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
</style>
`;
const out = `<!doctype html>
<html lang="es">
<head>
${meta}${head}
${nativeCss}</head>
<body>${body.replace('</script>\n', '</script>\n')}
<script>window.APP_VERSION = '${version}';</script>
<script src="js/pwa.js" defer></script>
</body>
</html>
`;
writeFileSync(join(root, 'index.html'), out);
console.log(`index.html generado (versión ${version}, ${out.length} bytes)`);
