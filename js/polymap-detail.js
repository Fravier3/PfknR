/*
 * PFKNR / PolyMap — contexto urbano de Puerto Rico para Three.js.
 * Geometrías reales de vías: datos geográficos de Puerto Rico publicados en ArcGIS.
 * Áreas verdes: OSM_CA_Landuse © OpenStreetMap contributors (ODbL).
 * Árboles: distribución procedimental ilustrativa (NO ubicaciones OSM verificadas).
 * Conceptos de capas y LOD basados en PolyMap © CottageHop (MIT).
 * Carga local por zona; no recopila ni guarda geolocalización del usuario.
 */
(function(root){
'use strict';
const ROAD_URL='https://services.arcgis.com/F7DSX1DSNSiWmOqh/ArcGIS/rest/services/pr_inf_roadsall/FeatureServer/0/query';
// Servicio complementario: carreteras con nombre y clasificación, cuando la
// primera fuente no tiene vías cercanas (ej.: núcleo consultado de Ponce).
const ROAD_FALLBACK='https://services8.arcgis.com/RdbQZfEkeO8qG89L/ArcGIS/rest/services/PR_Roads/FeatureServer/0/query';
const LAND_URL='https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/OSM_CA_Landuse/FeatureServer/0/query';
const GREEN=new Set(['grass','meadow','forest','orchard','recreation_ground','cemetery','farmland','farmyard','clearing']);
const CITY_RADIUS=0.0043; // cerca de 450m por consulta, solo zona urbana actual
const cache=new Map();

async function query(url,lat,lon,signal,fields,count,radius=CITY_RADIUS) {
  const latSpan=radius, lonSpan=radius/Math.max(0.65,Math.cos(lat*Math.PI/180));
  const extent=[lon-lonSpan,lat-latSpan,lon+lonSpan,lat+latSpan].map(v=>v.toFixed(6)).join(',');
  const params=new URLSearchParams({
    f:'geojson',where:'1=1',geometry:extent,geometryType:'esriGeometryEnvelope',
    inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',
    outFields:fields,returnGeometry:'true',resultRecordCount:String(count)
  });
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),14000);
  const onAbort=()=>ctrl.abort();
  if(signal && signal.aborted)throw new DOMException('Cancelado','AbortError');
  if(signal)signal.addEventListener('abort',onAbort,{once:true});
  try {
    const res=await fetch(url+'?'+params.toString(),{signal:ctrl.signal});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const json=await res.json();
    if(json.error)throw new Error(json.error.message||'Error ArcGIS');
    if(!Array.isArray(json.features))throw new Error('GeoJSON inválido');
    return json.features;
  }finally{
    clearTimeout(timer);
    if(signal)signal.removeEventListener('abort',onAbort);
  }
}
async function load(lat,lon,signal){
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<17||lat>19.5||lon< -68.5||lon> -64)throw new Error('Fuera de Puerto Rico');
  const key=lat.toFixed(3)+'/'+lon.toFixed(3);
  if(cache.has(key))return cache.get(key);
  const [roads,land]=await Promise.allSettled([
    query(ROAD_URL,lat,lon,signal,'OBJECTID,CLASS',1000),
    query(LAND_URL,lat,lon,signal,'osm_id2,landuse,name',160)
  ]);
  if(signal && signal.aborted)throw new DOMException('Cancelado','AbortError');
  // Extender la cobertura sin fabricar geometrías si la fuente principal está
  // vacía. Se prioriza la consulta pequeña para no ralentizar cada municipio.
  let roadList=roads.status==='fulfilled'?roads.value:[];
  let roadSource='PR Roads principal';
  if(roadList.length<10) {
    try{
      const alternative=await query(ROAD_FALLBACK,lat,lon,signal,'OBJECTID,FULLNAME,MTFCC',400,.008);
      if(alternative.length>roadList.length){
        roadList=alternative;
        roadSource='PR Roads alternativo';
      }
    }catch(e){ /* las otras capas siguen disponibles */ }
  }
  if(signal && signal.aborted)throw new DOMException('Cancelado','AbortError');
  if(roads.status==='rejected'&&land.status==='rejected'&&!roadList.length)
    throw new Error('Sin conexión a carreteras ni áreas verdes');
  const result={
    roads:roadList,
    roadSource,
    green:land.status==='fulfilled'?land.value.filter(f=>GREEN.has(f.properties?.landuse)):[],
    roadsError:roads.status==='rejected'?String(roads.reason?.message||roads.reason):null,
    greenError:land.status==='rejected'?String(land.reason?.message||land.reason):null
  };
  // Caché LRU limitada: solo geometrías actuales y revisitas; ahorro en iPad.
  cache.set(key,result);
  if(cache.size>8)cache.delete(cache.keys().next().value);
  return result;
}
function lines(feature){
 const g=feature?.geometry; if(!g)return [];
 if(g.type==='LineString')return [g.coordinates];
 if(g.type==='MultiLineString')return g.coordinates;
 return [];
}
function rings(feature){
 const g=feature?.geometry;if(!g)return [];
 if(g.type==='Polygon')return [g.coordinates];
 if(g.type==='MultiPolygon')return g.coordinates;
 return [];
}
function inside(p,ring){
 let hit=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))hit=!hit;
 }
 return hit;
}
function dispose(group){
 if(!group)return;
 if(group.parent)group.parent.remove(group);
 const geo=new Set(),mat=new Set();
 group.traverse(o=>{
   if(o.geometry)geo.add(o.geometry);
   if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>mat.add(m));
 });
 geo.forEach(g=>g.dispose());mat.forEach(m=>m.dispose());
}
function seeded(seed){
 let x=(seed|0)>>>0;
 return ()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296;};
}
function make(options){
 const {THREE,features,groundAt,project,center,buildings,small,style}=options;
 const group = new THREE.Group();
 const roadLayer = new THREE.Group(), vegetation = new THREE.Group();
 roadLayer.name = 'roads';
 vegetation.name = 'vegetation';
 group.add(roadLayer, vegetation);
 const roads=features?.roads||[],green=features?.green||[];
 const projectedRoads=[], verts=[],edgeVerts=[],coloredVerts=[];
 const asPt=p=>Array.isArray(p)&&p.length>=2&&p.every(Number.isFinite)?project(p[0],p[1]):null;
 function addQuad(arr,a,b,c,d){
  for(const p of [a,b,c,b,d,c])arr.push(p[0],p[1],p[2]);
 }
 // Pavimento + acera; líneas donde haya vías cartografiadas. No se inventan calles.
 for(const feature of roads.slice(0,650)){
  for(const line of lines(feature)){
   if(!Array.isArray(line)||line.length<2)continue;
   const points=line.slice(0,200).map(asPt).filter(Boolean);
   if(points.length<2)continue;
   projectedRoads.push(points);
   for(let i=1;i<points.length;i++){
    const [ax,ay]=points[i-1],[bx,by]=points[i];
    const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);
    if(len<.00005||len>.24)continue;
    const nx=-dy/len,ny=dx/len,half=.0030,walk=.00435;
    const ha=Math.max(0,groundAt(ax,ay)||0)+.0017;
    const hb=Math.max(0,groundAt(bx,by)||0)+.0017;
    const mk=(x,y,h,o)=>[x+nx*o,h,-y-ny*o];
    addQuad(edgeVerts,mk(ax,ay,ha,walk),mk(ax,ay,ha,-walk),mk(bx,by,hb,walk),mk(bx,by,hb,-walk));
    addQuad(verts,mk(ax,ay,ha+.0006,half),mk(ax,ay,ha+.0006,-half),mk(bx,by,hb+.0006,half),mk(bx,by,hb+.0006,-half));
   }
  }
 }
 function meshFrom(values,color,roughness){
  if(values.length<9)return;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(values,3));
  geo.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({color,roughness,side:THREE.DoubleSide,depthWrite:true});
  const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;roadLayer.add(mesh);
 }
 meshFrom(edgeVerts, style==='modern'?'#c4c2b8':'#ad9f87',.96);
 meshFrom(verts, style==='cyberpunk'?'#303644':'#5a6062',.91);

 // Parques/vegetación solo donde existe polígono de uso de suelo OSM.
 const greenRings=[];
 let parkCount=0;
 for(const feature of green.slice(0,90)){
  const typ=feature.properties?.landuse;
  for(const polygon of rings(feature)){
   if(!polygon?.[0]||polygon[0].length<3||polygon[0].length>300)continue;
   const outer=polygon[0].map(asPt).filter(Boolean);
   if(outer.length<3)continue;
   const shape=new THREE.Shape();
   outer.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));
   shape.closePath();
   for(const hole of polygon.slice(1)){
    const pts=hole.map(asPt).filter(Boolean);
    if(pts.length<3)continue;
    const path=new THREE.Path();pts.forEach(([x,y],i)=>i?path.lineTo(x,y):path.moveTo(x,y));path.closePath();
    shape.holes.push(path);
   }
   const geo=new THREE.ShapeGeometry(shape,3);
   geo.rotateX(-Math.PI/2);
   const att=geo.attributes.position;
   for(let i=0;i<att.count;i++){
    const x=att.getX(i),z=att.getZ(i);
    att.setY(i,(groundAt(x,-z)||0)+.0036);
   }
   geo.computeVertexNormals();
   const mat=new THREE.MeshStandardMaterial({color:typ==='forest'?'#4f8b53':typ==='orchard'?'#7b9e48':'#87a66b',side:THREE.DoubleSide,roughness:1});
   vegetation.add(new THREE.Mesh(geo,mat));parkCount++;
   greenRings.push({outer:outer,typ});
  }
 }
 // Vegetación estilizada: distribución reproducible sobre polígonos verdes
 // y zonas no edificadas. Las posiciones individuales NO son datos OSM.
 const seed=((center.lat*1e5)|0)^((center.lon*1e5)|0)^0x45ac901;
 const rand=seeded(seed),spots=[], maxTrees=small?145:270;
 const projectedBuildings=(buildings||[]).slice(0,500).map(w=>{
  const geo=w.geometry||[];
  const pts=geo.map(p=>project(p.lon,p.lat));
  if(pts.length<3)return null;
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
  return [Math.min(...xs)-.005,Math.min(...ys)-.005,Math.max(...xs)+.005,Math.max(...ys)+.005];
 }).filter(Boolean);
 const [cx,cy]=project(center.lon,center.lat);
 function blocked(x,y){
  for(const b of projectedBuildings)if(x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3])return true;
  for(const line of projectedRoads){
   for(let i=1;i<line.length;i++){
    const [x1,y1]=line[i-1],[x2,y2]=line[i],dx=x2-x1,dy=y2-y1;
    const len2=dx*dx+dy*dy;if(len2<1e-8)continue;
    const t=Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/len2));
    if(Math.hypot(x-x1-t*dx,y-y1-t*dy)<.007)return true;
   }
  }
  return false;
 }
 for(let tries=0;tries<maxTrees*16&&spots.length<maxTrees;tries++){
  let x,y;
  if(greenRings.length&&rand()<.74){
   const rr=greenRings[Math.floor(rand()*greenRings.length)].outer;
   const xs=rr.map(p=>p[0]),ys=rr.map(p=>p[1]);
   x=Math.min(...xs)+rand()*(Math.max(...xs)-Math.min(...xs));
   y=Math.min(...ys)+rand()*(Math.max(...ys)-Math.min(...ys));
   if(!inside([x,y],rr))continue;
  }else{
   const angle=rand()*Math.PI*2,radius=Math.sqrt(rand())*.36;
   x=cx+Math.cos(angle)*radius;y=cy+Math.sin(angle)*radius;
  }
  if(Math.hypot(x-cx,y-cy)>.45 || blocked(x,y))continue;
  const g=groundAt(x,y);
  if(!Number.isFinite(g)||g<0)continue;
  spots.push([x,y,g,rand()]);
 }
 if(spots.length){
  const trunkGeo=new THREE.CylinderGeometry(1,1,1,5), crownGeo=new THREE.DodecahedronGeometry(1,0);
  const trunk=new THREE.InstancedMesh(trunkGeo,new THREE.MeshStandardMaterial({color:'#6f543d',roughness:1}),spots.length);
  const foliage=new THREE.InstancedMesh(crownGeo,new THREE.MeshStandardMaterial({color:style==='cyberpunk'?'#307964':'#3e8050',roughness:1}),spots.length);
  const dummy=new THREE.Object3D();
  spots.forEach(([x,y,h,v],i)=>{
   const th=.0045+.003*v,cr=.0027+.0023*v;
   dummy.position.set(x,h+th*.5,-y);dummy.scale.set(.00065,th,.00065);dummy.rotation.set(0,v*6,0);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);
   dummy.position.set(x,h+th+.0018,-y);dummy.scale.set(cr,cr*1.22,cr);dummy.updateMatrix();foliage.setMatrixAt(i,dummy.matrix);
  });
  trunk.instanceMatrix.needsUpdate=true;foliage.instanceMatrix.needsUpdate=true;
  vegetation.add(trunk,foliage);
 }
 return {group,roads:projectedRoads.length,parks:parkCount,trees:spots.length,approximateTrees:true};
}
root.PolyDetail=Object.freeze({load,make,dispose,ROAD_URL,ROAD_FALLBACK,LAND_URL});
})(window);
