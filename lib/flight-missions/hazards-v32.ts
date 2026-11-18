// REHKITZ_DJI_V3_2 – OSM hazard hints for planning only, NEVER obstacle clearance.
// OSM may be incomplete or out of date; overhead wires are not a height model.
import type {FlightPlan,LonLat} from './planner';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

export type HazardV32={key:string;kind:'power'|'wind';label:string;distanceM:number;point:LonLat;osmUrl:string};
export type HazardReportV32={checked:boolean;dataSource:'OpenStreetMap / Overpass'|'OpenStreetMap / lokaler Index';bufferM:300;found:HazardV32[];warnings:string[]};
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
// Overpass requires an identifiable User-Agent. The project URL also serves as a contact reference.
// Keep the same identity for all requests; do not rotate it to circumvent HTTP 406/429.
const OVERPASS_UA='Rehkitzrettung-DJI/3.2.1 (+https://github.com/thw1905/rehkitzrettung)';
const OVERPASS_ENDPOINTS=[
 'https://overpass-api.de/api/interpreter',
 'https://overpass.private.coffee/api/interpreter',
] as const;
const OSM_WARNING='© OpenStreetMap-Mitwirkende (ODbL), Geofabrik-Auszug. Nur OSM-Hinweise: nicht erfasste Leitungen, Baeume und andere Hindernisse koennen fehlen.';
type StoredElements={expiresAt:number;elements:OSMItem[]};
const successCache=new Map<string,StoredElements>();
let providerCooldownUntil=0;
const inFlight=new Map<string,Promise<{elements:OSMItem[]|null;error:string|null}>>();
function cachePrune(){
 const now=Date.now();
 for(const [key,value] of successCache){if(value.expiresAt<=now)successCache.delete(key);}
 while(successCache.size>30){const key=successCache.keys().next().value;if(key===undefined)break;successCache.delete(key);}
}
async function retrieveOSM(query:string,key:string):Promise<{elements:OSMItem[]|null;error:string|null}>{
 cachePrune();
 const stored=successCache.get(key);
 if(stored)return {elements:stored.elements,error:null};
 if(providerCooldownUntil>Date.now())return {elements:null,error:"OSM-Anbieter hat vor kurzem HTTP 406/429 gemeldet. Weitere Anfragen werden voruebergehend pausiert."};
 const pending=inFlight.get(key);
 if(pending)return pending;
 const task=(async()=>{
  const errors:string[]=[];
  for(const endpoint of OVERPASS_ENDPOINTS){
   try{
    const response=await fetch(endpoint,{
     method:'POST',
     headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','Accept':'application/json','User-Agent':OVERPASS_UA},
     body:new URLSearchParams({data:query}),
     signal:AbortSignal.timeout(16000),
     cache:'no-store',
    });
    if(response.status===406||response.status===429){
     providerCooldownUntil=Date.now()+60000;
     // Do not work around an operator's 406/429 decision by immediately trying another server.
     return {elements:null,error:`${new URL(endpoint).host}: HTTP ${response.status} – Anfrage vom Anbieter abgelehnt. Weitere automatische Versuche pausiert.`};
    }
    if(response.status===400){
     return {elements:null,error:`${new URL(endpoint).host}: HTTP 400 – OSM-Abfrage vom Server als ungueltig abgelehnt.`};
    }
    if(!response.ok){errors.push(`${new URL(endpoint).host}: HTTP ${response.status}`);continue;}
    const raw=await response.json() as {elements?:OSMItem[]};
    if(!Array.isArray(raw.elements)||raw.elements.length>5000){
     return {elements:null,error:'OSM-Antwort ungueltig oder zu gross; Gefahrenpruefung nicht abgeschlossen.'};
    }
    successCache.set(key,{elements:raw.elements,expiresAt:Date.now()+30*60*1000});
    cachePrune();
    return {elements:raw.elements,error:null};
   }catch(err){
    const message=err instanceof Error&&err.name==='TimeoutError'?'Zeitueberschreitung':'Netzwerkfehler';
    errors.push(`${new URL(endpoint).host}: ${message}`);
   }
  }
  return {elements:null,error:errors.join('; ')||'Kein Overpass-Dienst erreichbar.'};
 })();
 inFlight.set(key,task);
 try{return await task;}finally{inFlight.delete(key);}
}
// V3.3: Off-line SQLite index is preferred whenever it exists. Overpass is a fallback
// before the first local import, not an indication of obstacle clearance.
const execFilePromise=promisify(execFile);
type LocalHazards={elements:OSMItem[];builtAt?:string;source?:string;count?:string};
type LocalRegion={name:string;db:string;script:string};
const REGIONS:LocalRegion[]=[
 {name:'Niedersachsen',db:'osm-hazards-ni.sqlite3',script:'dji-osm-ni.py'},
 {name:'Hamburg',db:'osm-hazards-hh.sqlite3',script:'dji-osm-hh.py'},
];
const HAMBURG_BOUNDS=[
 // Konservativer Rahmen der Hamburger Festlandsflächen inkl. 300-m-Grenzbereich.
 {s:53.34,w:9.65,n:53.99,e:10.40},
 // Hamburgische Nordseeinseln Neuwerk, Scharhörn und Nigehörn.
 {s:53.85,w:8.20,n:54.05,e:8.85},
];
type Bounds={s:number;w:number;n:number;e:number};
function intersectsBounds(a:Bounds,b:Bounds):boolean{
 return a.s<=b.n&&a.n>=b.s&&a.w<=b.e&&a.e>=b.w;
}
async function offlineLookup(bounds:Bounds):Promise<{data:LocalHazards|null;missing:string[]}>{
 const base=process.env.DJI_GEO_DATA_DIR?.trim()||
   (process.platform==='win32'?join(process.cwd(),'.local-dji-geodata'):'/var/lib/rehkitzrettung/dji-geodata');
 const required=HAMBURG_BOUNDS.some(box=>intersectsBounds(bounds,box))
  ? REGIONS
  : REGIONS.slice(0,1);
 const missing=required.filter(region=>!existsSync(join(base,region.db))).map(region=>region.name);
 // Ein Niedersachsen-Index allein darf im Hamburger Grenzbereich nicht
 // fälschlich "keine Gefahren" melden. Dann lieber Overpass versuchen.
 if(missing.length)return {data:null,missing};
 const bbox=[bounds.s,bounds.w,bounds.n,bounds.e].map(n=>n.toFixed(7)).join(',');
 const sources:LocalHazards[]=[];
 for(const region of REGIONS){
  if(!existsSync(join(base,region.db)))continue;
  const script=join(process.cwd(),'scripts',region.script);
  if(!existsSync(script))throw new Error('Lokaler OSM-Indexer fehlt: '+script);
  const {stdout}=await execFilePromise('python3',[script,'query','--bbox',bbox],{
   env:{...process.env,DJI_GEO_DATA_DIR:base},timeout:6500,maxBuffer:7*1024*1024,
  });
  const parsed=JSON.parse(stdout) as LocalHazards;
  if(!parsed||!Array.isArray(parsed.elements)||parsed.elements.length>1200)
   throw new Error('Lokale OSM-Antwort für '+region.name+' unvollständig oder zu groß.');
  sources.push({...parsed,source:region.name});
 }
 if(!sources.length)return {data:null,missing};
 const seen=new Set<string>();
 const elements:OSMItem[]=[];
 for(const source of sources)for(const element of source.elements){
  const key=[element.type,element.id,JSON.stringify(element.geometry||element.center||[])].join(':');
  if(seen.has(key))continue;
  seen.add(key);elements.push(element);
 }
 if(elements.length>1200)throw new Error('Mehr als 1200 Gefahrenobjekte über beide Bundesländer; Prüfung unvollständig.');
 const oldestDate=sources.map(x=>x.builtAt||'').sort()[0];
 return {data:{elements,builtAt:oldestDate,source:sources.map(x=>x.source).join(' + ')},missing:[]};
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
  // A broken local dataset is an error; never silently switch to remote data.
  const local=await offlineLookup({s,w,n,e});
  if(local.data){
   const warnings=[OSM_WARNING,'Lokaler OSM-Stand (ältester Index): '+(local.data.builtAt||'unbekannt')+'. Regionen: '+(local.data.source||'unbekannt')];
   if(!local.data.builtAt||!Number.isFinite(Date.parse(local.data.builtAt))||Date.now()-Date.parse(local.data.builtAt)>30*24*3600*1000)
    warnings.unshift('OSM-Gefahrendaten älter als 30 Tage oder Datum unbekannt. Index aktualisieren.');
   return {checked:true,dataSource:'OpenStreetMap / lokaler Index',bufferM:300,found:analyzeOverpass(plan,start,local.data.elements),warnings};
  }
  const result=await retrieveOSM(query,bounds);
  if(!result.elements)return fail('Lokaler OSM-Index fehlt für: '+local.missing.join(', ')+'. '+(result.error||'Overpass ist nicht erreichbar.'));
  return {checked:true,dataSource:'OpenStreetMap / Overpass',bufferM:300,found:analyzeOverpass(plan,start,result.elements),warnings:[OSM_WARNING,'Lokale OSM-Daten noch nicht importiert.']};
 }catch(err){return fail('Die OSM-Gefahrenpruefung ist fehlgeschlagen: '+(err instanceof Error?err.message:String(err)));}
}
