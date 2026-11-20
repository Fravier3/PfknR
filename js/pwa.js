// Puerto Rico 3D — instalación y auto-actualización de la PWA.
// Se incluye solo en la versión publicada (index.html); el artifact no lo usa.
(() => {
  'use strict';
  const APP_VERSION = window.APP_VERSION || '0';
  const UPDATE_EVERY_MS = 45 * 60 * 1000;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  // ---------- Aviso breve (toast) ----------
  function toast(text, { action, onAction, ms = 4500 } = {}) {
    const t = document.createElement('div');
    t.className = 'pwa-toast panel'; t.setAttribute('role', 'status');
    const span = document.createElement('span'); span.textContent = text; t.append(span);
    if (action) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = action;
      b.addEventListener('click', () => { onAction?.(); t.remove(); }); t.append(b);
    }
    const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.setAttribute('aria-label', 'Cerrar'); x.textContent = '✕';
    x.addEventListener('click', () => t.remove()); t.append(x);
    document.getElementById('app').append(t);
    if (ms) setTimeout(() => t.remove(), ms);
    return t;
  }
  const css = document.createElement('style');
  css.textContent = `
    .pwa-toast { position: absolute; left: 50%; bottom: calc(150px + env(safe-area-inset-bottom, 0px)); translate: -50% 0; z-index: 6;
      display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 14px; max-width: min(92vw, 440px); font: 500 13.5px var(--f-body); color: var(--ink); }
    .pwa-toast button { font: 600 13px var(--f-body); min-height: 36px; padding: 0 12px; border-radius: 8px; border: 0; background: var(--ink); color: var(--bg); cursor: pointer; }
    .pwa-toast .x { background: transparent; color: var(--muted); min-width: 36px; padding: 0; }
    .pwa-install { font: 600 12px var(--f-body); min-height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; }
    @media (prefers-reduced-motion: no-preference) { .pwa-toast { transition: opacity .25s, translate .5s var(--spring); } @starting-style { .pwa-toast { opacity: 0; translate: -50% 12px; } } }
  `;
  document.head.append(css);

  // ---------- Instalar: Android/Chrome con beforeinstallprompt; iPhone con instrucciones ----------
  let deferred = null;
  const brand = document.querySelector('#finder .brand');
  const installBtn = document.createElement('button');
  installBtn.type = 'button'; installBtn.className = 'pwa-install'; installBtn.textContent = 'Instalar'; installBtn.hidden = true;
  brand?.append(installBtn);
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; installBtn.hidden = false; });
  installBtn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (err) { /* el usuario cerró el diálogo */ }
    deferred = null; installBtn.hidden = true;
  });
  addEventListener('appinstalled', () => { installBtn.hidden = true; });

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS && !standalone) {
    let seen = false;
    try { seen = localStorage.getItem('pr3d-ios-hint') === '1'; } catch (err) { /* almacenamiento bloqueado */ }
    if (!seen) setTimeout(() => {
      toast('Para instalarla: toca Compartir y luego “Añadir a pantalla de inicio”.', { ms: 9000 });
      try { localStorage.setItem('pr3d-ios-hint', '1'); } catch (err) { /* sin almacenamiento */ }
    }, 4000);
  }

  // ---------- Auto-actualización ----------
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return; reloading = true;
    toast('Actualizando…', { ms: 0 });
    setTimeout(() => location.reload(), 350);
  });

  async function checkVersion(reg) {
    try {
      const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const { version } = await r.json();
      if (version && version !== APP_VERSION) {
        await reg.update();
        reg.waiting?.postMessage('SKIP_WAITING');
      }
    } catch (err) { /* sin conexión: se intentará más tarde */ }
  }

  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      const tick = () => { reg.update().catch(() => {}); checkVersion(reg); };
      tick();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
      setInterval(tick, UPDATE_EVERY_MS);
    } catch (err) { /* sin service worker la app sigue funcionando en línea */ }
  });
})();
