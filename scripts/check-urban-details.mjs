const cities=[['Cayey',18.11196,-66.1713],['Loíza',18.42936,-65.88081]];
const endpoints=['https://overpass.private.coffee/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter'];
let successes=0;
for(const [name,lat,lon] of cities){
 const query='[out:json][timeout:16];(way["highway"](around:600,'+lat+','+lon+');node["natural"="tree"](around:600,'+lat+','+lon+');way["leisure"="park"](around:600,'+lat+','+lon+');way["landuse"~"forest|grass|meadow|recreation_ground"](around:600,'+lat+','+lon+'););out geom;';
 for(const url of endpoints){
  try{
   const response=await fetch(url+'?data='+encodeURIComponent(query),{signal:AbortSignal.timeout(22000)});
   const json=await response.json();
   const features=json.elements||[];
   const count=(tag)=>features.filter(e=>e.tags&&tag(e.tags)).length;
   console.log('OSM_CONTEXT '+JSON.stringify({name,endpoint:url,http:response.status,roadCount:count(t=>!!t.highway),treeCount:count(t=>t.natural==='tree'),parkCount:count(t=>t.leisure==='park'||['forest','grass','meadow','recreation_ground'].includes(t.landuse)),firstRoad:features.find(e=>e.tags?.highway)?.geometry?.slice(0,2),error:json.remark||null}));
   if(response.ok && count(t=>!!t.highway)>0)successes++;
   if(response.ok && features.length)break;
  } catch(e){console.log('OSM_CONTEXT '+JSON.stringify({name,endpoint:url,error:String(e.message||e)}));}
 }
}
if(successes===0){console.error('No se pudo recuperar ninguna vía real');process.exitCode=1;}

const roadServices=[
 ['Puerto Rico Roads','https://services.arcgis.com/F7DSX1DSNSiWmOqh/ArcGIS/rest/services/pr_inf_roadsall/FeatureServer/0/query'],
 ['PR_Roads','https://services8.arcgis.com/RdbQZfEkeO8qG89L/ArcGIS/rest/services/PR_Roads/FeatureServer/0/query'],
 ['Primary Roads','https://services2.arcgis.com/IsDCghZ73NgoYoz5/ArcGIS/rest/services/Puerto_Rico_Primary_Roads/FeatureServer/0/query'],
 ['HOT OSM roads','https://services6.arcgis.com/C0HVLQJI37vYnazu/ArcGIS/rest/services/Roads/FeatureServer/0/query']
];
for(const [town,lat,lon] of cities){
 const bbox=[lon-.006,lat-.0055,lon+.006,lat+.0055].map(x=>x.toFixed(6)).join(',');
 for(const [name,endpoint] of roadServices){
  const query=new URLSearchParams({
   where:'1=1',geometry:bbox,geometryType:'esriGeometryEnvelope',
   inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',
   outFields:'*',returnGeometry:'true',resultRecordCount:'350',f:'geojson'
  });
  try{
   const response=await fetch(endpoint+'?'+query,{signal:AbortSignal.timeout(12000)});
   const data=await response.json();
   const feats=data.features||[];
   console.log('ROAD_SERVICE '+JSON.stringify({town,source:name,http:response.status,n:feats.length,geo:feats[0]?.geometry?.type,properties:feats[0]?.properties||null,error:data.error?.message||null}));
  }catch(e){console.log('ROAD_SERVICE '+JSON.stringify({town,source:name,error:String(e.message||e)}))}
 }
}
