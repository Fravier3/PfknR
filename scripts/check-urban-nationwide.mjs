// Comprobación por zonas de Puerto Rico (no descarga todas las vías de la isla).
// Usa los barrios-pueblo del propio PFKNR, con las mismas fuentes de la PWA.
import {readFileSync,readdirSync} from 'node:fs';
const allMunicipios=readdirSync('data/barrios').filter(name=>/^72\d{3}\.json$/.test(name));
if(allMunicipios.length!==78)throw Error('Se esperaban los 78 municipios, hay '+allMunicipios.length);
for(const name of allMunicipios){
 const barrios=JSON.parse(readFileSync('data/barrios/'+name,'utf8'));
 const center=barrios.find(b=>b.pueblo)?.label||barrios[0]?.label;
 if(!center||!Number.isFinite(center[0])||!Number.isFinite(center[1]))
   throw Error('Centro geográfico no disponible para '+name);
}
console.log('MUNICIPALITY_DATASET '+JSON.stringify({municipios:allMunicipios.length,centersValid:true}));
const samples=[
 ['Aguadilla','72005'],['Arecibo','72013'],['Cayey','72035'],['Culebra','72049'],
 ['Humacao','72069'],['Loíza','72087'],['Mayagüez','72097'],['Ponce','72113'],
 ['Vieques','72147']
];
const services=[
 ['roads','https://services.arcgis.com/F7DSX1DSNSiWmOqh/ArcGIS/rest/services/pr_inf_roadsall/FeatureServer/0/query'],
 ['buildings','https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/OSM_CA_Buildings/FeatureServer/0/query'],
 ['landuse','https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/OSM_CA_Landuse/FeatureServer/0/query']
];
let errors=0;
for(const [town,fips] of samples){
 let barrios=JSON.parse(readFileSync('data/barrios/'+fips+'.json','utf8'));
 const pueblo=barrios.find(x=>x.pueblo && Array.isArray(x.label));
 const numbered=barrios.filter(b=>/^(primero|segundo|tercero|cuarto|quinto|sexto|séptimo|septimo|octavo|noveno|décimo|decimo)$/i.test(b.name||'')&&Array.isArray(b.label));
 const urban=barrios.filter(b=>/urbano|pueblo|casco|centro/i.test(b.name||'')&&Array.isArray(b.label))
   .sort((a,b)=>(b.pob||0)/Math.max(.1,b.areaKm2||1)-(a.pob||0)/Math.max(.1,a.areaKm2||1));
 const center=numbered.length>=3
   ? [numbered.reduce((s,b)=>s+b.label[0],0)/numbered.length,numbered.reduce((s,b)=>s+b.label[1],0)/numbered.length]
   : null;
 const [lon,lat]=(pueblo?.label||center||urban[0]?.label||barrios[0]?.label||[]);
 if(!Number.isFinite(lon)||!Number.isFinite(lat))throw Error('No center for '+town);
 const span=.0043, lonSpan=span/Math.max(.65,Math.cos(lat*Math.PI/180));
 const bbox=[lon-lonSpan,lat-span,lon+lonSpan,lat+span].map(v=>v.toFixed(6)).join(',');
 const row={town,lat,lon};
 for(const [name,url]of services){
  const query=new URLSearchParams({
   f:'geojson',where:'1=1',geometry:bbox,geometryType:'esriGeometryEnvelope',
   inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',
   outFields:name==='roads'?'OBJECTID,CLASS':name==='buildings'?'osm_id2,building,height':'osm_id2,landuse',
   returnGeometry:'true',resultRecordCount:'70'
  });
  try{
   const response=await fetch(url+'?'+query,{signal:AbortSignal.timeout(15000)});
   const json=await response.json();
   const features=json.features||[];
   row[name]={http:response.status,count:features.length,type:features[0]?.geometry?.type||null,cors:response.headers.get('access-control-allow-origin')};
   if(!response.ok||json.error||!Array.isArray(json.features))errors++;
   if(name==='roads' && features.length===0)errors++;
  }catch(e){row[name]={error:String(e.message||e)};errors++;}
 }
 if(!row.roads?.count){
  const fallback='https://services8.arcgis.com/RdbQZfEkeO8qG89L/ArcGIS/rest/services/PR_Roads/FeatureServer/0/query';
  const radius=.008, extent=[lon-radius,lat-radius,lon+radius,lat+radius].map(x=>x.toFixed(6)).join(',');
  const params=new URLSearchParams({
   f:'geojson',where:'1=1',geometry:extent,geometryType:'esriGeometryEnvelope',
   inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',
   outFields:'OBJECTID,FULLNAME,MTFCC',returnGeometry:'true',resultRecordCount:'70'
  });
  try{
   const res=await fetch(fallback+'?'+params,{signal:AbortSignal.timeout(15000)});
   const json=await res.json();
   row.roadsFallback={http:res.status,count:json.features?.length||0,cors:res.headers.get('access-control-allow-origin')};
  }catch(e){row.roadsFallback={error:String(e.message||e)};}
 }
 console.log('ISLAND_WIDE '+JSON.stringify(row));
}
if(errors>0)throw Error('Fallaron '+errors+' consultas de datos');
console.log('NATIONWIDE_PASS: fuentes comprobadas de norte/sur/este/oeste y municipios insulares');
