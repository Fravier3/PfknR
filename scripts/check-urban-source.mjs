// Smoke test externo (GitHub Actions): verifica edificios reales para Cayey y Loíza.
// No se ejecuta en el navegador ni requiere credenciales.
const providers = [
  ['ArcGIS Caribe', 'https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/OSM_CA_Buildings/FeatureServer/0/query'],
  ['ArcGIS Norteamérica', 'https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/OSM_NA_Buildings/FeatureServer/0/query'],
];
const cities = [['Cayey Pueblo', 18.11196, -66.1713], ['Loíza Pueblo',18.42936,-65.88081]];
let successes=0;
for (const [city,lat,lon] of cities) {
  for (const [name,endpoint] of providers) {
    const bbox = [lon-.007,lat-.0063,lon+.007,lat+.0063].map(x=>x.toFixed(6)).join(',');
    const params = new URLSearchParams({
      where:'1=1', geometry:bbox, geometryType:'esriGeometryEnvelope', inSR:'4326',outSR:'4326',
      spatialRel:'esriSpatialRelIntersects',outFields:'osm_id2,building,height,building_levels,levels,name',
      returnGeometry:'true',resultRecordCount:'20', f:'geojson'
    });
    const url=endpoint+'?'+params.toString();
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(18000)});
      const raw=await response.text();
      const data=JSON.parse(raw);
      const count=data.features?.length||0;
      const point=data.features?.find(f=>f?.geometry?.coordinates)?.geometry?.coordinates?.[0]?.[0];
      console.log(JSON.stringify({city,source:name,status:response.status,count,firstCoordinate:point||null,error:data.error?.message||null}));
      if(response.ok&&count>0)successes++;
    }catch(e){
      console.log(JSON.stringify({city,source:name,error:String(e.message||e)}));
    }
  }
}
if(!successes){console.error('ERROR: Ningún proveedor devolvió huellas de edificios; comprobar cobertura/permisos.');process.exitCode=1;}
