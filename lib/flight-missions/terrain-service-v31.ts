// REHKITZ_DJI_V3_2 – source-aware DEM access: EU-DEM default, optional DGM1 provider.
// LGLN provides DGM1 as WCS GeoTIFF (not a ready-made JSON elevation API).
// DJI_DGM1_HEIGHT_URL may point to a trusted self-hosted converter that is
// explicitly configured by the server administrator; no transparent fallback.
import type {FlightPlan,LonLat} from './planner';
import {routeSamples,terrainReport,type TerrainReportV31} from './terrain-v31';

let requestQueue:Promise<void>=Promise.resolve();let nextAvailable=0;
async function oneRequest(locations:LonLat[]):Promise<{source:TerrainReportV31['dataset'];heights:number[]}>{
 const configured=process.env.DJI_DGM1_HEIGHT_URL?.trim();
 if(configured){
  const url=new URL(configured);
  if(!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost','::1'].includes(url.hostname))))
   throw new Error('DJI_DGM1_HEIGHT_URL darf nur HTTPS oder lokale HTTP-Adressen verwenden.');
  const response=await fetch(url.toString(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({locations}),cache:'no-store',signal:AbortSignal.timeout(60000)});
  if(!response.ok){
   let detail='';try{const failure=await response.json() as {error?:string};detail=String(failure.error||'').slice(0,280);}catch{}
   throw new Error(`DGM1-Höhendienst HTTP ${response.status}${detail?': '+detail:''}; keine automatische EU-DEM-Ausweichberechnung.`);
  }
  const data=await response.json() as {dataset?:string;elevations?:unknown[]};
  if(data.dataset!=='dgm1'||!Array.isArray(data.elevations)||data.elevations.length!==locations.length||data.elevations.some(v=>typeof v!=='number'||!Number.isFinite(v)||v< -500||v>9000))
   throw new Error('DGM1-Höhendienst liefert unvollständige oder nicht bestätigte DGM1-Höhenwerte.');
  return {source:'dgm1',heights:data.elevations as number[]};
 }
 // Public OpenTopoData: max 100 locations per call, 1 call/sec and daily quota.
 const previous=requestQueue;let release:()=>void=()=>{};
 requestQueue=new Promise<void>(resolve=>{release=resolve;});await previous;
 try{
  const delay=Math.max(0,nextAvailable-Date.now());if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  nextAvailable=Date.now()+1150;
  const qs=locations.map(([lon,lat])=>`${lat.toFixed(7)},${lon.toFixed(7)}`).join('|');
  const response=await fetch('https://api.opentopodata.org/v1/eudem25m?'+new URLSearchParams({locations:qs,interpolation:'bilinear'}),
   {method:'GET',headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`EU-DEM-Höhendienst HTTP ${response.status}.`);
  const data=await response.json() as {status?:string;results?:Array<{elevation:number|null;dataset:string}>};
  if(data.status!=='OK'||!Array.isArray(data.results)||data.results.length!==locations.length)throw new Error('EU-DEM liefert unvollständige Höhendaten.');
  const heights=data.results.map((e,i)=>{
   if(e.dataset!=='eudem25m'||typeof e.elevation!=='number'||!Number.isFinite(e.elevation))throw new Error(`Fehlender Gelände-Messpunkt ${i+1}.`);
   return e.elevation;
  });
  return {source:'eudem25m',heights};
 }finally{release();}
}
export async function analyzeTerrainForPlan(plan:FlightPlan,start:LonLat,altitude:number):Promise<TerrainReportV31>{
 const samples=routeSamples(plan,start);const heights:number[]=[];let source:TerrainReportV31['dataset']|null=null;
 for(let i=0;i<samples.length;i+=100){
  const batch=await oneRequest(samples.slice(i,i+100).map(s=>s.coord));
  if(source&&source!==batch.source)throw new Error('Geländedaten aus verschiedenen Höhenreferenzquellen dürfen nicht gemischt werden.');
  source=batch.source;heights.push(...batch.heights);
 }
 return terrainReport(plan,start,altitude,heights,source||'eudem25m');
}
