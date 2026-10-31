// REHKITZ_WAYLINE_CLOUD_V1: ausschliesslich Admin, keine Flugsteuerung.
import { NextRequest,NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";
import { createFlightPlan,validateOptions } from "@/lib/flight-missions/planner";
import { optionsForCamera,type MissionCamera } from "@/lib/flight-missions/coverage";
import { makeMissionKmz } from "@/lib/flight-missions/wpml";
import { storeWayline,configuredWorkspace,publicOrigin } from "@/lib/flight-missions/cloud-store";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 try{
  const user=await getCurrentUserWithTeams();
  if(!user?.isApproved||!user.isAdmin)return NextResponse.json({error:"Nur Administratoren koennen Missionen veroeffentlichen."},{status:403});
  // Kontrolliere vor dem Speichern, ob der serverseitige Download ueber HTTPS moeglich ist.
  publicOrigin(req.url);
  const body=await req.json();
  if(typeof body?.fieldId!=="string"||body.fieldId.length>100)return NextResponse.json({error:"FL-Flaeche fehlt."},{status:400});
  if(!["M3T","M4T"].includes(body.aircraft))return NextResponse.json({error:"Nur M3T/M4T."},{status:400});
  if(!["THERMAL","RGB_WIDE"].includes(body.camera))return NextResponse.json({error:"Kamera ungueltig."},{status:400});
  if(typeof body.manualSpacing!=="boolean")return NextResponse.json({error:"Abstandsmodus fehlt."},{status:400});
  const field=await db.field.findUnique({where:{id:body.fieldId},select:{id:true,name:true,displayName:true,areaGeoJson:true}});
  if(!field)return NextResponse.json({error:"Flaeche existiert nicht."},{status:404});
  const aircraft=body.aircraft as "M3T"|"M4T",camera=body.camera as MissionCamera;
  const options=validateOptions(optionsForCamera(body.options,aircraft,camera,body.overlapPercent,body.manualSpacing));
  const plan=createFlightPlan(field.areaGeoJson,options);
  // Nicht uebertragen, wenn die angelegte Mission extrem komplex oder lange waere.
  if(plan.waypoints.length>500||plan.estimatedMinutes>80)throw new Error("Testlimit: hoechstens 500 Wegpunkte und 80 Minuten. Flaeche aufteilen.");
  const shortName=String(field.displayName||field.name).replace(/[<>"']/g,"").slice(0,55);
  const name=`FL ${shortName} ${aircraft} ${camera==="THERMAL"?"IR":"RGB"} ${new Date().toISOString().slice(0,16).replace("T"," ")}`.slice(0,95);
  const kmz=await makeMissionKmz(plan,options,name,aircraft);
  const entry=await storeWayline({name,fieldId:field.id,aircraft,camera,workspaceId:configuredWorkspace()},kmz);
  return NextResponse.json({success:true,mission:{id:entry.id,name:entry.name,waypoints:plan.waypoints.length,estimatedMinutes:plan.estimatedMinutes},message:"Mission in DJI-Cloud-Bibliothek bereitgestellt. Noch kein Pilot2-Import bestaetigt."},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("DJI-Wayline publish:",e);return NextResponse.json({error:e instanceof Error?e.message:"Mission konnte nicht bereitgestellt werden."},{status:400});}
}
