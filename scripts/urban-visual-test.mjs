import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const out = 'artifacts/urban';
mkdirSync(out, {recursive:true});
const browser = await chromium.launch({
  headless: true,
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
const results=[];
try {
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>!!window.PRMap,{timeout:90000});
  const gl=await page.evaluate(()=>{
    const c=document.querySelector('#scene');
    return {width:c.width,height:c.height,webgl:!!(c.getContext('webgl2')||c.getContext('webgl'))};
  });
  console.log('RENDERER '+JSON.stringify(gl));
  for (const town of ['Cayey','Loíza','Ponce']) {
    const selection=await page.evaluate(town=>window.PRMap.select(town),town);
    if(selection<0) throw Error('No se encontró pueblo '+town);
    await page.waitForFunction(name=>document.querySelector('#i-name')?.textContent===name,town,{timeout:15000});
    await page.locator('#city-3d').click();
    await page.waitForFunction(()=>{
      const s=document.querySelector('#city-3d-status')?.textContent||'';
      return /vías reales|Calles\/vegetación no disponibles|Edificios sin cargar|No hay huellas/.test(s);
    },null,{timeout:50000}).catch(e=>console.log('STATUS_TIMEOUT '+town+': '+e.message));
    await page.waitForTimeout(1400);
    const status=await page.locator('#city-3d-status').textContent();
    const shot=await page.locator('#scene').screenshot();
    const frame=await page.screenshot();
    const slug=town.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    writeFileSync(out+'/'+slug+'-canvas.png',shot);
    writeFileSync(out+'/'+slug+'-ipad.png',frame);
    const metric=assess(shot);
    results.push({town,status,metric});
    console.log('URBAN_RESULT '+JSON.stringify({town,status,metric}));
  }
  console.log('NETWORK_ERRORS '+JSON.stringify(badResponses));
  console.log('JS_ERRORS '+JSON.stringify(errors.slice(0,20)));
  if(results.some(x=>!/vías reales/.test(x.status))) throw Error('No se cargaron las nuevas vías / vegetación en alguna ciudad');
  if(results.some(x=> !/\d+ edificios 3D/.test(x.status) || Number(x.status.match(/(\d+) edificios 3D/)?.[1]||0)<30)) throw Error('No se cargaron suficientes edificios');
  if(results.some(x=> Number(x.status.match(/(\d+) vías reales/)?.[1]||0)<10)) throw Error('Vías reales insuficientes');
  if(results.some(x=>x.metric.colors16<30)) throw Error('Canvas parece tener superficie de color uniforme');
  if(results.some(x=>x.metric.roofPixels<30)) throw Error('Edificios no aparecen en el área principal del mapa (cámara mal encuadrada)');
  if(errors.some(x=>/ReferenceError|TypeError|SyntaxError|INVALID_OPERATION/.test(x)))throw Error('Errores JS durante la prueba');
  console.log('RESULT: PASS. Edificios, vías y árboles cargados en Cayey, Loíza y Ponce.');
} catch(e){
  console.error('RESULT: FAIL '+e.stack);
  throw e;
} finally { await browser.close(); }
