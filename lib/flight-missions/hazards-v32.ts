// REHKITZ_DJI_V3_2 – OSM hazard hints for planning only, NEVER obstacle clearance.
// OSM may be incomplete or out of date; overhead wires are not a height model.
import type {FlightPlan,LonLat} from './planner';

export type HazardV32={key:string;kind:'power'|'wind';label:string;distanceM:number;point:LonLat;osmUrl:string};
export type HazardReportV32={checked:boolean;dataSource:'OpenStreetMap / Overpass';bufferM:300;found:HazardV32[];warnings:string[]};
const rad=Math.PI/180;
function xy(p:LonLat,baseLat:number):[number,number]{return [p[0]*111320*Math.cos(baseLat*rad),p[1]*111132];}
function nearestOnSegment(p:[number,number],a:[number,number],b:[number,number]){
 const dx=b[0]-a[0],dy=b[1]-a[1];const denom=dx*dx+dy*dy;
 const t=denom===0?0:Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/denom));
 return [a[0]+t*dx,a[1]+t*dy] as [number,number];
}
function dist2(a:[number,number],b:[number,number]){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
function orient(a:[number,number],b:[number,number],c:[number,number]){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function intersects(a:[number,number],b:[number,number],c:[number,number],d:[number,number]){
 const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
 return o1*o2<=0&&o3*o4<=0 && Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))+1e-6 && Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]))+1e-6;
}
function segmentDistance(a:[number,number],b:[number,number],c:[number,number],d:[number,number]){
 if(intersects(a,b,c,d))return 0;
 return Math.min(dist2(a,nearestOnSegment(a,c,d)),dist2(b,nearestOnSegment(b,c,d)),dist2(c,nearestOnSegment(c,a,b)),dist2(d,nearestOnSegment(d,a,b)));
}
const good=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);
function coord(raw:{lon?:unknown;lat?:unknown}|null|undefined):LonLat|null{
 return raw&&good(raw.lon)&&good(raw.lat)&&Math.abs(raw.lon as number)<=180&&Math.abs(raw.lat as number)<=85?[raw.lon as number,raw.lat as number]:null;
}
type OSMItem={type?:string;id?:number;lat?:number;lon?:number;center?:{lat:number;lon:number};geometry?:Array<{lon:number;lat:number}>;tags?:Record<string,string>};
export function analyzeOverpass(plan:FlightPlan,start:LonLat,elements:OSMItem[]):HazardV32[]{
 const path=[start,...plan.waypoints,start];
 const baseLat=start[1];const route=path.map(p=>xy(p,baseLat));
 const found:HazardV32[]=[];
 for(const item of elements.slice(0,1200)){
  if(!Number.isInteger(item.id)||!['node','way'].includes(String(item.type)))continue;
  const tags=item.tags||{};
  const kind:HazardV32['kind']=(tags['generator:source']==='wind'||tags['man_made']==='windmill'||tags['power']==='generator')?'wind':'power';
  const coords=(item.geometry||[]).map(coord).filter((p):p is LonLat=>Boolean(p));
  if(!coords.length){const single=coord(item.center||item);if(single)coords.push(single);}
  if(!coords.length)continue;
  const meters=coords.map(p=>xy(p,baseLat));
  let nearest=Infinity,nearestIndex=0;
  for(let i=0;i<route.length-1;i++){
   for(let j=0;j<meters.length;j++){
    const d=dist2(meters[j],nearestOnSegment(meters[j],route[i],route[i+1]));
    if(d<nearest){nearest=d;nearestIndex=j;}
   }
   for(let j=0;j<meters.length-1;j++){
    const d=segmentDistance(route[i],route[i+1],meters[j],meters[j+1]);
    if(d<nearest){nearest=d;nearestIndex=j;}
   }
  }
  if(nearest>300)continue;
  found.push({key:`${item.type}/${item.id}`,kind,label:kind==='wind'?'Windenergieanlage':'Elektrische Leitung / Mast',distanceM:Math.round(nearest),point:coords[nearestIndex],osmUrl:`https://www.openstreetmap.org/${item.type}/${item.id}`});
 }
 return found.sort((a,b)=>a.distanceM-b.distanceM).slice(0,40);
}
export async function inspectHazards(plan:FlightPlan,start:LonLat):Promise<HazardReportV32>{
 const fail=(message:string):HazardReportV32=>({checked:false,dataSource:'OpenStreetMap / Overpass',bufferM:300,found:[],warnings:[message,'Die OSM-Daten sind weder vollstaendig noch ein Nachweis fuer Hindernisfreiheit.']});
 try{
  const path=[start,...plan.waypoints];const lats=path.map(p=>p[1]),lons=path.map(p=>p[0]);
  // 350m bounding-box expansion; 300m is the display buffer.
  const s=Math.max(-85,Math.min(...lats)-0.0033),n=Math.min(85,Math.max(...lats)+0.0033);
  const latAvg=(s+n)/2;const padLon=0.0033/Math.max(.25,Math.cos(latAvg*rad));
  const w=Math.min(...lons)-padLon,e=Math.max(...lons)+padLon;
  if((n-s)*(e-w)>0.14) return fail('Die Suchregion ist fuer die OSM-Gefahrenabfrage zu gross.');
  const bounds=`(${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)})`;
  const query=`[out:json][timeout:12];(way["power"~"^(line|minor_line|cable)$"]${bounds};node["power"="tower"]${bounds};node["generator:source"="wind"]${bounds};way["generator:source"="wind"]${bounds};node["man_made"="windmill"]${bounds};);out geom;`;
  const hosts=['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter'];
  for(const host of hosts){
   try{
    const response=await fetch(host,{method:'POST',body:new URLSearchParams({data:query}),headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(14000),cache:'no-store'});
    if(!response.ok)continue;
    const raw=await response.json() as {elements?:OSMItem[]};
    if(!Array.isArray(raw.elements)||raw.elements.length>5000)continue;
    return {checked:true,dataSource:'OpenStreetMap / Overpass',bufferM:300,found:analyzeOverpass(plan,start,raw.elements),warnings:['Nur OSM-Hinweise; fehlende Markierungen bedeuten keine Hindernisfreiheit. Baeume, Gebaeude und nicht erfasste Leitungen fehlen.']};
   }catch{ /* fallback to second public server */ }
  }
  return fail('Die OSM-Gefahrenabfrage ist derzeit nicht erreichbar. Hindernisse muessen vor Ort separat geprueft werden.');
 }catch{return fail('Die OSM-Gefahrenabfrage ist fehlgeschlagen.');}
}
