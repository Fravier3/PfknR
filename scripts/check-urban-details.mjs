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
