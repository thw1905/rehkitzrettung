// REHKITZ_DJI_TERRAIN_V3_1 – server-side, explicit opt-in to an external DEM API.
// Test service: OpenTopoData eudem25m (25m); not an obstacle map or flight approval.
import type {FlightPlan,LonLat} from "./planner";
import {routeSamples,terrainReport,type TerrainReportV31} from "./terrain-v31";

let requestQueue:Promise<void>=Promise.resolve();
let nextAvailable=0;
async function oneRequest(locations:LonLat[]):Promise<number[]> {
  const previous=requestQueue;
  let release:()=>void=()=>{};
  requestQueue=new Promise<void>(resolve=>{release=resolve;});
  await previous;
  try {
    const delay=Math.max(0,nextAvailable-Date.now());
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    nextAvailable=Date.now()+1150;
    const qs=locations.map(([lon,lat])=>`${lat.toFixed(7)},${lon.toFixed(7)}`).join("|");
    const response=await fetch("https://api.opentopodata.org/v1/eudem25m?"+new URLSearchParams({locations:qs,interpolation:"bilinear"}),
      {method:"GET",headers:{"Accept":"application/json"},cache:"no-store",signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`Geländedienst nicht erreichbar (HTTP ${response.status}).`);
    const result=await response.json() as {status?:string;results?:Array<{elevation:number|null;dataset:string}>};
    if(result.status!=="OK"||!Array.isArray(result.results)||result.results.length!==locations.length)
      throw new Error("Geländedienst hat unvollstaendige Daten zurueckgegeben.");
    return result.results.map((e,i)=>{
      if(e.dataset!=="eudem25m"||typeof e.elevation!=="number"||!Number.isFinite(e.elevation))
        throw new Error(`Geländedaten fehlen bei Messpunkt ${i+1}.`);
      return e.elevation;
    });
  }finally{release();}
}
export async function analyzeTerrainForPlan(plan:FlightPlan,start:LonLat,altitude:number):Promise<TerrainReportV31>{
  const samples=routeSamples(plan,start);
  const heights:number[]=[];
  for(let i=0;i<samples.length;i+=100){
    const batch=samples.slice(i,i+100).map(s=>s.coord);
    heights.push(...await oneRequest(batch));
  }
  return terrainReport(plan,start,altitude,heights);
}
