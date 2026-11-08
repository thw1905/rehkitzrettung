// REHKITZ_DJI_AUFTRAGSFLUGPLANUNG_V3: nur ein aktiver Cloud-Eintrag je Field-ID.
// Beim Ersetzen bleibt nur die neue Cloud-KMZ erhalten; keine Archivversion.
import { promises as fs } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import type { MissionOptions, FlightPlan, LonLat, FlightLine } from "./planner";
import type { MissionCamera } from "./coverage";
import type {TerrainSettingsV31} from "./terrain-v31";
import {
  configuredWorkspace, listWaylines, readWaylineKmz, replaceWaylineForField,
  WaylineConflictError,
  type StoredMission,
} from "./cloud-store";
import { db } from "@/lib/db";

type AuthorizedUser = { id: string; isAdmin: boolean; isApproved: boolean; role: string };
export type SavedSettings = {
  aircraft: "M3T" | "M4T";
  camera: MissionCamera;
  options: MissionOptions;
  overlapPercent: number;
  manualSpacing: boolean;
  terrain?: TerrainSettingsV31;
};
type SavedPlan = SavedSettings & { plan: FlightPlan; editorId: string; savedAt: number };

const idRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function storageDir() { return process.env.DJI_WAYLINE_STORAGE_DIR || path.join(process.cwd(), ".data", "dji-waylines"); }
function metadataPath(id: string) {
  if (!idRe.test(id)) throw new Error("Ungueltige Mission-ID.");
  return path.join(storageDir(), ".planung", id + ".json");
}
// REHKITZ_DJI_MISSIONNAME_OHNE_FL_V3_0_3
// Keine FL-Nummer erfinden; sichere, stabile Bezeichnung aus dem Feldnamen.
// Die eindeutige Zuordnung zur Mission erfolgt weiterhin ueber field.id.
function flightFallbackName(field: { name: string; displayName: string | null }) {
  const raw = [field.displayName, field.name]
    .find(v => typeof v === "string" && v.trim().length > 0)?.trim() || "";
  if (!raw) throw new Error("Die Flaeche hat weder Nummer noch Namen.");
  let label = raw.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toUpperCase();
  // TEST / UEBUNG - Demo-Wiese -> TEST-DEMO-WIESE
  label = label.replace(/^TEST[\s/_-]*U(?:E)?BUNG(?:[\s/_\u2013\u2014-]+|$)/, "TEST-");
  label = label.replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60).replace(/-+$/g, "");
  if (!label) throw new Error("Aus der Flaechenbezeichnung laesst sich kein Missionsname erzeugen.");
  return label;
}

export function flightNameFromField(field: {name: string;displayName: string|null}) {
  const digits = [field.displayName, field.name]
    .filter((x): x is string => typeof x === "string")
    .map(x=>x.match(/(?:^|[^a-zA-Z0-9])FL[\s_-]*([0-9]{1,8})(?![0-9])/i))
    .find(Boolean)?.[1];
  if (!digits) return flightFallbackName(field);
  return "FL" + digits.padStart(4,"0");
}
export async function orderFlightField(user: AuthorizedUser|null, orderId: string) {
  if (!user?.isApproved || !orderId || orderId.length > 120) return null;
  const order = await db.order.findUnique({
    where: {id: orderId},
    select: {id:true,fieldId:true,operationDayTeam:{select:{pilotId:true}},field:{select:{id:true,name:true,displayName:true,areaGeoJson:true}}},
  });
  if (!order) return null;
  if (!user.isAdmin && (user.role !== "PILOT" || order.operationDayTeam?.pilotId !== user.id)) return null;
  return order.field;
}
export async function activeMissionForField(fieldId: string) {
  const missions = await listWaylines(configuredWorkspace());
  return missions.find(m=>m.fieldId===fieldId) || null;
}
function localName(tag:string) {return tag.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function tagValue(xml:string,tag:string) {
 const pattern=new RegExp("<(?:\\w+:)?"+localName(tag)+"(?:\\s[^>]*)?>([^<]*)<\\/(?:\\w+:)?"+localName(tag)+">","i");
 return pattern.exec(xml)?.[1]?.trim() || "";
}
function flightPlanFromCoordinates(points: LonLat[], speed: number): FlightPlan|null {
 if(points.length<2 || points.length>900)return null;
 const dist=(a:LonLat,b:LonLat)=>{
  const avg=(a[1]+b[1])/2*Math.PI/180;
  const dx=(b[0]-a[0])*111320*Math.cos(avg),dy=(b[1]-a[1])*111132;
  return Math.hypot(dx,dy);
 };
 const lines:FlightLine[]=[],transfers:FlightLine[]=[];
 let totalMeters=0,searchMeters=0;
 for(let i=0;i<points.length-1;i++){
  const line={start:points[i],end:points[i+1]};
  const d=dist(line.start,line.end); totalMeters+=d;
  if(i%2===0){lines.push(line);searchMeters+=d;}else transfers.push(line);
 }
 return {waypoints:points,lines,transfers,totalMeters,searchMeters,estimatedMinutes:totalMeters/Math.max(speed,1)/60,warnings:["Aus KMZ wiederhergestellt: Flugroute und Wegpunkte pruefen. Einzelne Bahnsegmente koennen von der Originalplanung abweichen.","Die Hoehe ist relativ zum Startpunkt; Hindernisse und Geländeverlauf sind nicht geprueft."]};
}
async function legacyMissionDetails(m: StoredMission):Promise<{settings:SavedSettings|null;plan:FlightPlan|null}> {
 try {
  const zip=await JSZip.loadAsync(await readWaylineKmz(m.id));
  const template=await zip.file("wpmz/template.kml")?.async("string")||"";
  const waylines=await zip.file("wpmz/waylines.wpml")?.async("string")||"";
  const altitude=Number(tagValue(template,"globalHeight")||tagValue(template,"height")||tagValue(waylines,"executeHeight"));
  const speed=Number(tagValue(waylines,"autoFlightSpeed")||tagValue(template,"autoFlightSpeed"));
  const points:LonLat[]=[];
  for(const hit of waylines.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/g)){
   const val=tagValue(hit[1],"coordinates").split(",");
   const lon=Number(val[0]),lat=Number(val[1]);
   if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>85)throw new Error("KMZ-Koordinaten ungueltig.");
   points.push([lon,lat]);
  }
  // Alte KMZ enthalten keine kompletten Planungsparameter. Nur Hoehe/Tempo sind rekonstruierbar.
  const settings:SavedSettings|null = Number.isFinite(altitude)&&altitude>=10&&altitude<=120&&Number.isFinite(speed)&&speed>=1&&speed<=12 ? {
   aircraft:m.aircraft,camera:m.camera,options:{altitude,speed,spacing:25,direction:0,margin:5},overlapPercent:40,manualSpacing:false,
  }:null;
  return {settings,plan:flightPlanFromCoordinates(points,Number.isFinite(speed)?speed:5)};
 }catch(e){console.warn("[DJI-V3] Aeltere KMZ nicht vollstaendig lesbar",m.id,e instanceof Error?e.message:"");return {settings:null,plan:null};}
}
export async function readCurrentPlanning(fieldId: string){
 const mission=await activeMissionForField(fieldId);
 if(!mission)return null;
 let saved:SavedPlan|null=null;
 try{saved=JSON.parse(await fs.readFile(metadataPath(mission.id),"utf8")) as SavedPlan;}
 catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
 const legacy=saved?null:await legacyMissionDetails(mission);
 return {
  id:mission.id,name:mission.name,aircraft:mission.aircraft,camera:mission.camera,
  createdAt:mission.createdAt,hasExactSettings:Boolean(saved),
  settings:saved?{aircraft:saved.aircraft,camera:saved.camera,options:saved.options,overlapPercent:saved.overlapPercent,manualSpacing:saved.manualSpacing,terrain:saved.terrain}:legacy?.settings||null,
  plan:saved?.plan || legacy?.plan || null,
 };
}
export class StaleMissionError extends Error {constructor(){super("Die Mission wurde zwischenzeitlich geaendert. Seite neu laden und aktuelle Version pruefen.");}}
export async function publishOrReplaceMission(args:{
 fieldId:string;name:string;aircraft:"M3T"|"M4T";camera:MissionCamera;fileFactory:()=>Promise<Uint8Array>;
 expectedMissionId:string|null;editorId:string;settings:SavedSettings|null;plan:FlightPlan|null;
}) {
 // Vorbereitung vor dem Indexwechsel: ein Fehler laesst die bisherige Mission unangetastet.
 const file=await args.fileFactory();
 const planningJson=args.settings&&args.plan?JSON.stringify({
  ...args.settings,plan:args.plan,editorId:args.editorId,savedAt:Date.now()
 }):null;
 try{
  return await replaceWaylineForField({
   name:args.name,fieldId:args.fieldId,aircraft:args.aircraft,
   camera:args.camera,workspaceId:configuredWorkspace()
  },file,args.expectedMissionId,planningJson);
 }catch(e){if(e instanceof WaylineConflictError)throw new StaleMissionError();throw e;}
}
