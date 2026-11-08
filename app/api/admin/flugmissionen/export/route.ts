// REHKITZ_DJI_FLUGPLANUNG_V3_4
// REHKITZ_WAYLINE_CLOUD_V1 - M4T und Pilot2-Cloud-Routenbibliothek.
// REHKITZ_FLUGMISSION_V1 – DJI-Flugplanung; keine Aenderung bestehender DJI-Bindings.
import { NextRequest,NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";
import { createFlightPlan,validateOptions } from "@/lib/flight-missions/planner";
import { makeMissionKmz } from "@/lib/flight-missions/wpml";
import { optionsForCamera, type MissionCamera } from "@/lib/flight-missions/coverage";
import {validateTerrainSettings,checkExportHeights} from "@/lib/flight-missions/terrain-v31";
import {analyzeTerrainForPlan} from "@/lib/flight-missions/terrain-service-v31";
import {publicOrigin} from "@/lib/flight-missions/cloud-store";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 try{
  const user=await getCurrentUserWithTeams();
  if(!user) return NextResponse.json({error:"Nicht angemeldet."},{status:401});
  if(!user.isApproved||!user.isAdmin) return NextResponse.json({error:"Nur Admins duerfen Flugmissionen exportieren."},{status:403});
  if(req.headers.get("origin")!==publicOrigin(req.url))return NextResponse.json({error:"Ungueltiger Anfrage-Ursprung."},{status:403});
  const body=await req.json();
  if(typeof body?.fieldId!=="string" || body.fieldId.length>100) return NextResponse.json({error:"Flaeche fehlt."},{status:400});
  // M4T noch nicht freigeschaltet: DJI-spezifische Geraetekennungen muessen mit Pilot2-Export verifiziert werden.
  if(body.aircraft!=="M3T" && body.aircraft!=="M4T")return NextResponse.json({error:"Nur M3T/M4T."},{status:400});
  const field=await db.field.findUnique({where:{id:body.fieldId},select:{id:true,name:true,displayName:true,areaGeoJson:true}});
  if(!field)return NextResponse.json({error:"Flaeche existiert nicht mehr."},{status:404});
  const camera=body.camera as MissionCamera;
  const manualSpacing=body.manualSpacing===true;
  if(body.manualSpacing!==true && body.manualSpacing!==false)return NextResponse.json({error:"Modus fuer Bahnabstand fehlt."},{status:400});
  const options=validateOptions(optionsForCamera(body.options,body.aircraft,camera,body.overlapPercent,manualSpacing));
  const terrain=validateTerrainSettings(body.terrain??{startPoint:null,altitudeMode:"constant",rthHeight:Math.min(150,Math.max(options.altitude+20,50))});
  const plan=createFlightPlan(field.areaGeoJson,options,terrain.startPoint);
  const report=terrain.altitudeMode==="terrain"?await analyzeTerrainForPlan(plan,terrain.startPoint!,options.altitude):null;
  const heights=checkExportHeights(plan,terrain.altitudeMode,report,terrain.rthHeight,options.altitude);
  const blob=await makeMissionKmz(plan,options,field.displayName||field.name,body.aircraft,{waypointHeights:heights,rthHeight:terrain.rthHeight});
  const filename=`FL-${String(field.displayName||field.name).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,36)}-${body.aircraft}-${camera}.kmz`;
  return new NextResponse(blob as unknown as BodyInit,{status:200,headers:{'Content-Type':'application/vnd.google-earth.kmz','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store, no-cache, must-revalidate','X-Content-Type-Options':'nosniff'}});
 }catch(error){
  console.error("Flugmission Export:",error);
  return NextResponse.json({error:error instanceof Error?error.message:"KMZ konnte nicht erzeugt werden."},{status:400});
 }
}
