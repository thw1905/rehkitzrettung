// REHKITZ_DJI_AUFTRAGSFLUGPLANUNG_V3: admin-frei oder Pilot nach Auftragszuweisung.
import { NextRequest,NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";
import { createFlightPlan,validateOptions,type MissionOptions } from "@/lib/flight-missions/planner";
import { optionsForCamera,type MissionCamera } from "@/lib/flight-missions/coverage";
import { makeMissionKmz } from "@/lib/flight-missions/wpml";
import { readWaylineKmz,publicOrigin,findWayline,configuredWorkspace } from "@/lib/flight-missions/cloud-store";
import { flightNameFromField,orderFlightField,publishOrReplaceMission,readCurrentPlanning,StaleMissionError } from "@/lib/flight-missions/mission-v3";
export const runtime="nodejs";
const NO_STORE={"Cache-Control":"no-store"};
export async function POST(req:NextRequest){
 try{
  const user=await getCurrentUserWithTeams();
  if(!user)return NextResponse.json({error:"Nicht angemeldet."},{status:401,headers:NO_STORE});
  if(!user.isApproved)return NextResponse.json({error:"Nicht freigegeben."},{status:403,headers:NO_STORE});
  const origin=req.headers.get("origin");
  if(!origin || origin!==publicOrigin(req.url))return NextResponse.json({error:"Ungueltiger Anfrage-Ursprung."},{status:403,headers:NO_STORE});
  const body=await req.json();
  const fieldId=body?.fieldId;
  if(typeof fieldId!=="string"||!fieldId||fieldId.length>100)return NextResponse.json({error:"FL-Flaeche fehlt."},{status:400});
  if(typeof body?.orderId!=="undefined" && (typeof body.orderId!=="string"||!body.orderId||body.orderId.length>120))return NextResponse.json({error:"Auftrag ungueltig."},{status:400});
  if(!user.isAdmin && !body.orderId)return NextResponse.json({error:"Piloten muessen einen zugewiesenen Auftrag angeben."},{status:403});
  const field=body.orderId ? await orderFlightField(user,body.orderId) :
   user.isAdmin ? await db.field.findUnique({where:{id:fieldId},select:{id:true,name:true,displayName:true,areaGeoJson:true}}):null;
  if(!field || field.id!==fieldId)return NextResponse.json({error:"Keine Berechtigung fuer diese Auftragsflaeche."},{status:403});
  const expectedMissionId=body?.expectedMissionId;
  if(expectedMissionId!==null && (typeof expectedMissionId!=="string"||!/^[a-f0-9-]{36}$/i.test(expectedMissionId)))return NextResponse.json({error:"Missionsversion fehlt. Seite neu laden."},{status:400});
  const current=await readCurrentPlanning(field.id);
  // Optimistische Version: alter Client darf aktuelle Mission nicht ueberschreiben.
  if((current?.id||null)!==expectedMissionId)throw new StaleMissionError();
  const reuse=body?.reuseExisting===true;
  let aircraft:"M3T"|"M4T";let camera:MissionCamera;
  let settings: {aircraft:"M3T"|"M4T";camera:MissionCamera;options:MissionOptions;overlapPercent:number;manualSpacing:boolean}|null=null;
  let plan: ReturnType<typeof createFlightPlan>|null=null;
  let fileFactory:()=>Promise<Uint8Array>;
  const name=flightNameFromField(field);
  if(reuse){
   if(!current||!expectedMissionId)return NextResponse.json({error:"Keine vorhandene Mission zum erneuten Hochladen."},{status:400});
   const old=await findWayline(current.id,configuredWorkspace());
   if(!old || old.fieldId!==field.id)return NextResponse.json({error:"Vorhandene Mission nicht gefunden."},{status:404});
   aircraft=old.aircraft;camera=old.camera;
   settings=current.hasExactSettings?current.settings:null;
   plan=current.hasExactSettings?current.plan:null;
   fileFactory=async()=>new Uint8Array(await readWaylineKmz(old.id));
  }else{
   if(body.aircraft!=="M3T" && body.aircraft!=="M4T")return NextResponse.json({error:"Nur M3T/M4T."},{status:400});
   if(body.camera!=="THERMAL" && body.camera!=="RGB_WIDE")return NextResponse.json({error:"Kamera ungueltig."},{status:400});
   if(typeof body.manualSpacing!=="boolean")return NextResponse.json({error:"Abstandsmodus fehlt."},{status:400});
   aircraft=body.aircraft;camera=body.camera;
   const overlap=body.overlapPercent;
   const options=validateOptions(optionsForCamera(body.options,aircraft,camera,overlap,body.manualSpacing));
   plan=createFlightPlan(field.areaGeoJson,options);
   if(plan.waypoints.length>500||plan.estimatedMinutes>80)throw new Error("Testlimit: hoechstens 500 Wegpunkte und 80 Minuten.");
   const rawOptions=body.options as MissionOptions;
   settings={aircraft,camera,options:rawOptions,overlapPercent:overlap,manualSpacing:body.manualSpacing};
   // Persistente Planungsparameter; keine Versionshistorie und keine Archivkopie.
   fileFactory=()=>makeMissionKmz(plan!,options,name,aircraft);
  }
  const entry=await publishOrReplaceMission({fieldId:field.id,name,aircraft,camera,fileFactory,expectedMissionId,editorId:user.id,settings,plan});
  console.info("[DJI-V3] Cloud-Mission aktualisiert",field.id,"Mission",entry.id,"Vorgaenger",expectedMissionId||"keiner");
  return NextResponse.json({success:true,mission:{id:entry.id,name:entry.name,waypoints:plan?.waypoints.length||current?.plan?.waypoints.length||0},message:"Aktuelle Mission gespeichert. Die Fernsteuerung muss die neue Cloud-Version herunterladen."},{headers:NO_STORE});
 }catch(e){
  if(e instanceof StaleMissionError)return NextResponse.json({error:e.message},{status:409,headers:NO_STORE});
  console.error("DJI-V3 Mission veroeffentlichen:",e);
  return NextResponse.json({error:e instanceof Error?e.message:"Mission konnte nicht gespeichert werden."},{status:400,headers:NO_STORE});
 }
}
