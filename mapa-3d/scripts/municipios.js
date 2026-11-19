const fs=require('fs');const dir=process.argv[2];
const r5=v=>Math.round(v*1e5)/1e5;
const out=fs.readdirSync(dir).filter(f=>/^72\d{3}\.geojson$/.test(f)).map(f=>{
  const j=JSON.parse(fs.readFileSync(dir+'/'+f,'utf8'));const g=j.geometry;
  const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  return {id:j.properties.fips,name:j.properties.name.replace(/ Municipio$/,''),areaKm2:Math.round(j.properties.census_data.ALAND/1e5)/10,
    aguaKm2:Math.round(j.properties.census_data.AWATER/1e5)/10,
    polys:polys.map(p=>p.map(r=>r.map(([x,y])=>[r5(x),r5(y)])))};
}).sort((a,b)=>a.name.localeCompare(b.name,'es'));
const vm=new Map();
out.forEach((m,i)=>m.polys.forEach(p=>p.forEach(r=>r.forEach(([x,y])=>{const k=Math.round(x*2e4)+','+Math.round(y*2e4);if(!vm.has(k))vm.set(k,new Set());vm.get(k).add(i);}))));
out.forEach(m=>m.nbs=new Map());
vm.forEach(s=>{const a=[...s];a.forEach(i=>a.forEach(j=>{if(i!==j)out[i].nbs.set(out[j].id,(out[i].nbs.get(out[j].id)||0)+1)}))});
const cos=Math.cos(18.2*Math.PI/180);
const ringArea=r=>{let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]*cos)*(r[i][1])-(r[i][0]*cos)*(r[j][1]);return a/2};
function inside(pt,poly){let c=false;for(const r of poly)for(let i=0,j=r.length-1;i<r.length;j=i++){const[xi,yi]=r[i],[xj,yj]=r[j];if((yi>pt[1])!==(yj>pt[1])&&pt[0]<(xj-xi)*(pt[1]-yi)/(yj-yi)+xi)c=!c}return c}
function segd(p,a,b){const ax=a[0]*cos,bx=b[0]*cos,px=p[0]*cos;const dx=bx-ax,dy=b[1]-a[1];let t=((px-ax)*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1);t=Math.max(0,Math.min(1,t));return Math.hypot(px-ax-t*dx,p[1]-a[1]-t*dy)}
out.forEach(m=>{
  const big=m.polys.slice().sort((a,b)=>Math.abs(ringArea(b[0]))-Math.abs(ringArea(a[0])))[0];
  let [x0,y0,x1,y1]=[1e9,1e9,-1e9,-1e9];big[0].forEach(([x,y])=>{x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)});
  let best=null,bd=-1;const N=50;
  for(let i=0;i<=N;i++)for(let j=0;j<=N;j++){const p=[x0+(x1-x0)*i/N,y0+(y1-y0)*j/N];if(!inside(p,big))continue;let d=1e9;for(const r of big)for(let k=0;k<r.length-1;k++)d=Math.min(d,segd(p,r[k],r[k+1]));if(d>bd){bd=d;best=p}}
  m.label=[r5(best[0]),r5(best[1])];
  m.nb=[...m.nbs.entries()].filter(([,c])=>c>=2).map(([id])=>id).sort();delete m.nbs;
});
let pts=0;out.forEach(m=>m.polys.forEach(p=>p.forEach(r=>pts+=r.length)));
const nm=id=>out.find(o=>o.id===id).name;
console.error('features',out.length,'pts',pts,'multi',out.filter(m=>m.polys.length>1).map(m=>m.name+':'+m.polys.length).join(' '));
['San Juan','Ponce','Villalba','Culebra','Vieques'].forEach(n=>{const m=out.find(o=>o.name===n);console.error(n,'->',m.nb.map(nm).join(', '),m.areaKm2)});
fs.writeFileSync(process.argv[3],JSON.stringify(out));
