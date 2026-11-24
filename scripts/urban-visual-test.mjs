import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const out = 'artifacts/urban';
mkdirSync(out, {recursive:true});
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PFKNR_BROWSER_CHANNEL || undefined,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--disable-dev-shm-usage']
});
const context=await browser.newContext({
  viewport:{width:1024,height:1366},
  deviceScaleFactor:1,
  isMobile:true,hasTouch:true,
  colorScheme:'dark'
});
const page=await context.newPage();
const errors=[],badResponses=[];
page.on('pageerror',e=>errors.push(String(e.message||e)));
page.on('console',msg=>{ if(msg.type()==='error')errors.push('console: '+msg.text());});
page.on('response',res=>{
  if(res.status()>=400 && /(arcgis|overpass|municipios|barrios)/i.test(res.url()))
    badResponses.push({url:res.url().slice(0,160),status:res.status()});
});
function assess(buffer){
  const png=PNG.sync.read(buffer),bucket=new Set();const counts=new Map();
  let roofPixels=0;
  for(let y=250;y<png.height-200;y+=8){
    for(let x=150;x<png.width-150;x+=8){
      const k=(png.width*y+x)*4;
      const r=png.data[k],g=png.data[k+1],b=png.data[k+2];
      if(x>png.width*.2 && x<png.width*.8 && y>png.height*.16 && y<png.height*.78 &&
         r>228 && g>140 && g<228 && b>90 && b<205 && r-g>30 && g-b>15) roofPixels++;
      bucket.add([r>>4,g>>4,b>>4].join('-'));
      const label=[r>>5,g>>5,b>>5].join('-');
      counts.set(label,(counts.get(label)||0)+1);
    }
  }
  const top=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5);
  return {colors16:bucket.size,roofPixels,topColors32:top};
}
// Comprueba que el fondo satelital tiene imagen real y que el divisor aísla ambos mapas.
async function checkSatellite() {
  const photoButton = page.locator('#map-photo');
  const layers = page.locator('#t-layers');
  const divider = page.locator('#map-split');
  const shot = () => page.screenshot({ animations: 'disabled' });
  const openCompare = async () => {
    await layers.click();
    await page.locator('[data-basemap="compare"]').click();
  };
  await photoButton.click();
  await page.waitForFunction(() => document.querySelector('#photo-status').textContent === '', null, {timeout:30000});
  const island = await shot();
  if (assess(island).colors16 < 40) throw Error('La vista de la isla no muestra fotografía');
  writeFileSync(out + '/satelite-isla.png', island);
  for (const town of ['Cayey', 'Culebra']) {
    await page.evaluate(name => PRMap.select(name), town);
    const toggle = page.locator('#city-photo');
    await toggle.click();
    if (await toggle.getAttribute('aria-pressed') !== 'false') throw Error('Falta el mapa original');
    await toggle.click();
    if (await toggle.getAttribute('aria-pressed') !== 'true') throw Error('Falta la vista satelital');
    await page.waitForFunction(() => document.querySelector('#photo-status').textContent === '', null, {timeout:35000});
    const photo = await shot();
    if (assess(photo).colors16 < 40) throw Error('Falta el detalle de fotografía en ' + town);
    writeFileSync(out + '/satelite-' + town.toLowerCase() + '.png', photo);
  }
  await openCompare();
  await divider.press('Home');
  if (!/Mapa 0 %, satélite 100 %/.test(await divider.getAttribute('aria-valuetext'))) throw Error('El divisor no muestra todo el satélite');
  const aerial = PNG.sync.read(await shot());
  await divider.press('End');
  const map = PNG.sync.read(await shot());
  let changed = 0, count = 0;
  for (let y = 260; y < aerial.height * .72; y += 11) {
    for (let x = 40; x < aerial.width * .60; x += 11) {
      const p = (y * aerial.width + x) * 4;
      const delta = [0, 1, 2].reduce((d, c) => d + Math.abs(aerial.data[p + c] - map.data[p + c]), 0);
      if (delta > 45) changed++;
      count++;
    }
  }
  if (changed / count < .35) throw Error('Mover el divisor no cambia el mapa base visible');
  await divider.press('Home');
  await divider.press('PageUp');
  await divider.press('PageUp');
  await divider.press('PageUp');
  await divider.press('PageUp');
  await divider.press('PageUp');
  writeFileSync(out + '/satelite-comparacion.png', await shot());
  await photoButton.click();
  if (await divider.isVisible()) throw Error('El divisor sigue visible al volver al mapa');
  console.log('SATELLITE PASS ' + JSON.stringify({ towns: ['Cayey', 'Culebra'], changed: changed / count }));
}
async function checkPhoneOverview() {
  const mobile = await browser.newPage({
    viewport: {width:390, height:844}, deviceScaleFactor:1, isMobile:true, hasTouch:true,
    reducedMotion:'reduce'
  });
  mobile.on('pageerror', error => console.log('PHONE JS ' + error.stack));
  mobile.on('console', message => {
    if (message.type() === 'error') console.log('PHONE CONSOLE ' + message.text());
  });
  try {
    await mobile.goto('http://127.0.0.1:8765/', {waitUntil:'domcontentloaded'});
    await mobile.waitForFunction(() => !!window.PRMap, null, {timeout:45000});
    await mobile.locator('#loading').waitFor({state:'hidden'});
    await mobile.locator('#map-photo').click();
    await mobile.waitForFunction(() => document.querySelector('#photo-status').textContent === '', null, {timeout:30000});
    const overview = mobile.waitForResponse(r => r.ok() && /USGSImageryOnly\/MapServer\/export\?/.test(r.url()), {timeout:30000});
    await mobile.evaluate(() => PRMap.select('Arecibo'));
    await overview;
    await mobile.waitForFunction(() => document.querySelector('#photo-status').textContent === '', null, {timeout:30000});
    const image = await mobile.screenshot({animations:'disabled'});
    const colors = assess(image).colors16;
    if (colors < 28) throw Error('No se dibuja la vista general satelital en teléfono (' + colors + ' colores)');
    writeFileSync(out + '/satelite-iphone.png', image);
    console.log('PHONE SATELLITE PASS ' + colors);
  } catch (error) {
    console.error('PHONE STATE ' + JSON.stringify(await mobile.evaluate(() => ({
      loading: document.querySelector('#loading')?.textContent?.trim(),
      photo: document.querySelector('#photo-status')?.textContent
    }))));
    throw error;
  } finally { await mobile.close(); }
}
const results=[];
try {
  await checkPhoneOverview();
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>!!window.PRMap,{timeout:90000});
  const gl=await page.evaluate(()=>{
    const c=document.querySelector('#scene');
    return {width:c.width,height:c.height,webgl:!!(c.getContext('webgl2')||c.getContext('webgl'))};
  });
  console.log('RENDERER '+JSON.stringify(gl));
  await checkSatellite();
  for (const town of ['Cayey','Loíza','Ponce','Vieques','Culebra']) {
    const selection=await page.evaluate(town=>window.PRMap.select(town),town);
    if(selection<0) throw Error('No se encontró pueblo '+town);
    await page.waitForFunction(name=>document.querySelector('#i-name')?.textContent===name,town,{timeout:15000});
    if (await page.locator('#t-3d').getAttribute('aria-pressed') !== 'true') await page.locator('#t-3d').click();
    await page.waitForTimeout(1400);
    if (await page.locator('#city-3d-status').isVisible()) throw Error('3D activó el casco urbano en ' + town);
    if (await page.locator('#t-exag-wrap').evaluate(el => el.hidden)) throw Error('Falta el control de relieve');
    const shot=await page.locator('#scene').screenshot();
    const frame=await page.screenshot();
    const slug=town.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    writeFileSync(out+'/'+slug+'-canvas.png',shot);
    writeFileSync(out+'/'+slug+'-ipad.png',frame);
    const metric=assess(shot);
    results.push({town,metric});
    console.log('URBAN_RESULT '+JSON.stringify({town,metric}));
  }
  console.log('NETWORK_ERRORS '+JSON.stringify(badResponses));
  console.log('JS_ERRORS '+JSON.stringify(errors.slice(0,20)));
  if(results.some(x=>x.metric.colors16<30)) throw Error('Canvas parece tener superficie de color uniforme');
  if(errors.some(x=>/ReferenceError|TypeError|SyntaxError|INVALID_OPERATION/.test(x)))throw Error('Errores JS durante la prueba');
  console.log('RESULT: PASS. Relieve 3D activado en cinco regiones de Puerto Rico.');
} catch(e){
  console.error('RESULT: FAIL '+e.stack);
  throw e;
} finally { await browser.close(); }
