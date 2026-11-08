// REHKITZ_DJI_FLUGPLANUNG_V3_4
// REHKITZ_DJI_TERRAIN_V3_1 – authorized, server-calculated elevation profile.
import {NextRequest,NextResponse} from "next/server";
import {getCurrentUserWithTeams} from "@/lib/current-user";
import {db} from "@/lib/db";
import {orderFlightField} from "@/lib/flight-missions/mission-v3";
import {createFlightPlan,validateOptions} from "@/lib/flight-missions/planner";
import {optionsForCamera,type MissionCamera} from "@/lib/flight-missions/coverage";
import {analyzeTerrainForPlan} from "@/lib/flight-missions/terrain-service-v31";
import {inspectHazards} from "@/lib/flight-missions/hazards-v32";
import {validLonLat} from "@/lib/flight-missions/terrain-v31";
import {publicOrigin} from "@/lib/flight-missions/cloud-store";
export const runtime="nodejs";
const NO_STORE={"Cache-Control":"no-store"};
export async function POST(req:NextRequest){
 try {
  const user=await getCurrentUserWithTeams();
  if(!user)return NextResponse.json({error:"Nicht angemeldet."},{status:401,headers:NO_STORE});
  if(!user.isApproved)return NextResponse.json({error:"Nicht freigegeben."},{status:403,headers:NO_STORE});
  const origin=req.headers.get("origin");
  if(!origin||origin!==publicOrigin(req.url))return NextResponse.json({error:"Ungueltiger Anfrage-Ursprung."},{status:403,headers:NO_STORE});
  const body=await req.json();
  if(typeof body.fieldId!=="string"||!body.fieldId||body.fieldId.length>100)return NextResponse.json({error:"Flaeche fehlt."},{status:400});
  if(!validLonLat(body.startPoint))return NextResponse.json({error:"Startpunkt auf der Karte markieren."},{status:400});
  if(!["M3T","M4T"].includes(body.aircraft)||!["THERMAL","RGB_WIDE"].includes(body.camera)||typeof body.manualSpacing!=="boolean")
   return NextResponse.json({error:"Kamera- oder Abstandsangabe ungueltig."},{status:400});
  const field=body.orderId?await orderFlightField(user,String(body.orderId)):
   user.isAdmin?await db.field.findUnique({where:{id:body.fieldId},select:{id:true,name:true,displayName:true,areaGeoJson:true}}):null;
  if(!field||field.id!==body.fieldId)return NextResponse.json({error:"Keine Berechtigung fuer diese Flaeche."},{status:403,headers:NO_STORE});
  const o=validateOptions(optionsForCamera(body.options,body.aircraft,body.camera as MissionCamera,body.overlapPercent,body.manualSpacing));
  const plan=createFlightPlan(field.areaGeoJson,o,body.startPoint);
  if(plan.waypoints.length>500||plan.estimatedMinutes>80)throw new Error("Testlimit: maximal 500 Wegpunkte und 80 Minuten.");
  const report=await analyzeTerrainForPlan(plan,body.startPoint,o.altitude);
  const hazards=await inspectHazards(plan,body.startPoint);
  return NextResponse.json({report,hazards},{headers:NO_STORE});
 }catch(e){console.error("DJI Terrainanalyse:",e);return NextResponse.json({error:e instanceof Error?e.message:"Geländeprüfung fehlgeschlagen."},{status:400,headers:NO_STORE});}
}
