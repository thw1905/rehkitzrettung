// REHKITZ_DJI_TERRAIN_V3_1 – DEM-based test planning, NOT flight clearance.
// Public EU-DEM 25 m data can miss trees, wires, banks, small hills and other obstacles.
import type { FlightPlan, LonLat } from "./planner";

export type AltitudeModeV31 = "constant" | "terrain";
export type TerrainSettingsV31 = {
  startPoint: LonLat | null;
  altitudeMode: AltitudeModeV31;
  rthHeight: number;
};
export type TerrainReportV31 = {
  dataset: "eudem25m" | "dgm1";
  sampleSpacingM: number;
  sampledPoints: number;
  startElevationM: number;
  highestTerrainM: number;
  constantMinGroundClearanceM: number;
  adjustedMinGroundClearanceM: number;
  maxRelativeHeightM: number;
  minRelativeHeightM: number;
  maxAdjustedGroundClearanceM: number;
  recommendedRthM: number;
  waypointHeightsM: number[];
  profile: Array<{distanceM:number;groundRelativeM:number;constantHeightM:number;adjustedHeightM:number}>;
  warnings: string[];
};
export function validLonLat(value: unknown): value is LonLat {
  return Array.isArray(value) && value.length===2 && value.every(x=>typeof x==="number"&&Number.isFinite(x)) &&
    Math.abs(value[0])<=180 && Math.abs(value[1])<=85;
}
export function validateTerrainSettings(raw: unknown): TerrainSettingsV31 {
  const x=raw as Partial<TerrainSettingsV31>|null;
  if (!x || (x.altitudeMode!=="constant" && x.altitudeMode!=="terrain")) throw new Error("Hoehenmodus ist ungueltig.");
  if (x.startPoint!==null && x.startPoint!==undefined && !validLonLat(x.startPoint)) throw new Error("Startpunkt-Koordinaten ungueltig.");
  if (typeof x.rthHeight!=="number" || !Number.isFinite(x.rthHeight) || x.rthHeight<20 || x.rthHeight>150) throw new Error("Rueckkehrhoehe muss zwischen 20 und 150 m liegen.");
  if (x.altitudeMode==="terrain" && !validLonLat(x.startPoint)) throw new Error("Fuer Geländeanpassung einen Startpunkt auf der Karte markieren.");
  return { startPoint: x.startPoint??null, altitudeMode: x.altitudeMode, rthHeight:x.rthHeight };
}
const distance=(a:LonLat,b:LonLat)=>{
  const lat=(a[1]+b[1])*Math.PI/360;
  return Math.hypot((a[0]-b[0])*111320*Math.cos(lat),(a[1]-b[1])*111132);
};
const interpolate=(a:LonLat,b:LonLat,t:number):LonLat=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];

type SampleV31={coord:LonLat;segment:number;t:number; elevation:number};
// Deliberate strict cap: never silently produce an incomplete terrain clearance report.
export function routeSamples(plan:FlightPlan,start:LonLat): Omit<SampleV31,"elevation">[] {
  if (!validLonLat(start) || plan.waypoints.length<2 || plan.waypoints.length>500) throw new Error("Route oder Startpunkt ungueltig.");
  if (Math.min(...plan.waypoints.map(p=>distance(p,start)))>5000) throw new Error("Startpunkt ist mehr als 5 km von allen Wegpunkten entfernt.");
  const path=[start,...plan.waypoints,start];
  const samples:Omit<SampleV31,"elevation">[]=[];
  for(let i=0;i<path.length-1;i++){
    const steps=Math.max(1,Math.ceil(distance(path[i],path[i+1])/25));
    for(let j=0;j<steps;j++) samples.push({coord:interpolate(path[i],path[i+1],j/steps),segment:i,t:j/steps});
    if(samples.length>800) throw new Error("Route fuer Geländedienst zu lang (>800 Messpunkte). Bitte Flaeche aufteilen.");
  }
  samples.push({coord:start,segment:path.length-2,t:1});
  if(samples.length>800) throw new Error("Route fuer Geländedienst zu lang (>800 Messpunkte).");
  return samples;
}
// Accepts data already queried from the provider. No remote data is trusted for flight approval.
export function terrainReport(plan:FlightPlan,start:LonLat,requestedAgl:number,elevations:number[],dataset:TerrainReportV31["dataset"]="eudem25m"):TerrainReportV31 {
  if(!Number.isFinite(requestedAgl)||requestedAgl<10||requestedAgl>120) throw new Error("Flughoehe ungueltig.");
  const samples=routeSamples(plan,start);
  if(samples.length!==elevations.length||elevations.some(v=>typeof v!=="number"||!Number.isFinite(v)||v< -500||v>9000))throw new Error("Hoehendaten fehlen oder sind ungueltig.");
  const routePoints=plan.waypoints.length;
  const full=samples.map((s,i)=>({...s,elevation:elevations[i]}));
  const startElevation=full[0].elevation;
  const peaks=Array(routePoints).fill(-Infinity) as number[];
  const routeOnly=full.filter(s=>s.segment>=1 && s.segment<routePoints);
  if(!routeOnly.length)throw new Error("Suchroute ohne Hoehendaten.");
  for(const s of full){
    // Include both departure/return terrain in first/last waypoint envelopes.
    if(s.segment===0)peaks[0]=Math.max(peaks[0],s.elevation);
    else if(s.segment===routePoints)peaks[routePoints-1]=Math.max(peaks[routePoints-1],s.elevation);
    else{peaks[s.segment-1]=Math.max(peaks[s.segment-1],s.elevation);peaks[s.segment]=Math.max(peaks[s.segment],s.elevation);}
  }
  // EU-DEM 25m: conservative local 5m margin for algorithm demonstration only, NOT obstacle clearance.
  const relative=peaks.map(z=>Math.ceil((requestedAgl+5+z-startElevation)*10)/10);
  const altForSegment=(s:SampleV31)=>{
    if(s.segment===0)return relative[0];
    if(s.segment===routePoints)return relative[routePoints-1];
    return relative[s.segment-1]*(1-s.t)+relative[s.segment]*s.t;
  };
  const constantMin=Math.min(...full.map(s=>requestedAgl+startElevation-s.elevation));
  const minAdjusted=Math.min(...routeOnly.map(s=>altForSegment(s)+startElevation-s.elevation));
  const maxAdjusted=Math.max(...routeOnly.map(s=>altForSegment(s)+startElevation-s.elevation));
  let cumulative=0;
  const profile=full.map((s,i)=>{
    if(i>0)cumulative+=distance(full[i-1].coord,s.coord);
    return {distanceM:cumulative,groundRelativeM:s.elevation-startElevation,
      constantHeightM:requestedAgl,adjustedHeightM:altForSegment(s)};
  });
  const highest=Math.max(...elevations);
  const rth=Math.ceil(Math.max(50,highest-startElevation+30,...relative.map(z=>z+10)));
  const warnings=[
    dataset==="dgm1"?"DGM1 beschreibt nur die Geländeoberfläche. Keine Hindernis- oder Flugfreigabe.":"EU-DEM 25m ist fuer Hindernisfreiheit und sichere Mindestabstaende NICHT ausreichend.",
    "Baeume, Stromleitungen, Gebaeude, Geländestufen, Flugbeschraenkungen und Wind fehlen in den Hoehendaten.",
    "RTH ist nur ein Gelände-Richtwert aus den untersuchten Punkten; Rueckflug aus jedem Punkt und Hindernisse sind nicht vollstaendig untersucht.",
    "Gelaendeanpassung verwendet relative DJI-Wegpunkthoehen; tatsaechliche Hoehen muss der Pilot in Pilot 2 kontrollieren.",
  ];
  if(relative.some(z=>z<10||z>120))warnings.push("Einzelne relative Wegpunkthoehen liegen ausserhalb 10–120 m. Automatische Ausgabe wird gesperrt.");
  if(maxAdjusted>120)warnings.push("Bodenabstand kann 120 m ueberschreiten; Rechtslage und Hoehenbegrenzung pruefen.");
  return {dataset,sampleSpacingM:25,sampledPoints:full.length,startElevationM:startElevation,highestTerrainM:highest,
    constantMinGroundClearanceM:constantMin,adjustedMinGroundClearanceM:minAdjusted,maxRelativeHeightM:Math.max(...relative),minRelativeHeightM:Math.min(...relative),maxAdjustedGroundClearanceM:maxAdjusted,
    recommendedRthM:rth,waypointHeightsM:relative,profile,warnings};
}
export function checkExportHeights(plan:FlightPlan,altitudeMode:AltitudeModeV31,report:TerrainReportV31|null,rthHeight:number,baseAltitude:number) {
  if(!Number.isFinite(rthHeight)||rthHeight<20||rthHeight>150)throw new Error("Rueckkehrhoehe muss 20-150 m betragen.");
  const heights=altitudeMode==="terrain"?report?.waypointHeightsM:Array(plan.waypoints.length).fill(baseAltitude) as number[];
  if(!heights||heights.length!==plan.waypoints.length||heights.some(h=>!Number.isFinite(h)||h<10||h>120))throw new Error("Gelaende-Wegpunkthoehen unvollstaendig oder ausserhalb 10–120 m.");
  const maxH=Math.max(...heights);
  if(rthHeight < maxH+10)throw new Error(`Rueckkehrhoehe ${rthHeight} m liegt weniger als 10 m ueber der höchsten Wegpunkthoehe ${maxH.toFixed(1)} m.`);
  if(altitudeMode==="terrain" && report?.maxAdjustedGroundClearanceM && report.maxAdjustedGroundClearanceM>120)throw new Error("Modellierter AGL-Abstand kann 120 m ueberschreiten. Diese Route ist nicht exportierbar.");
  if(altitudeMode==="terrain" && (!report||rthHeight<report.recommendedRthM))throw new Error("Rueckkehrhoehe liegt unter dem Geländemodell-Richtwert. Bitte erhöhen und Route neu pruefen.");
  return heights;
}
