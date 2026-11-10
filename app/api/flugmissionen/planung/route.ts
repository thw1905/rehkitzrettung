// REHKITZ_DJI_AUFTRAGSFLUGPLANUNG_V3: Piloten nur ueber zugeteilten Auftrag.
import { NextRequest,NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";
import { orderFlightField, readCurrentPlanning } from "@/lib/flight-missions/mission-v3";
import {getOrderPreparation} from "@/lib/flight-missions/auto-prepare-v36";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
  const user=await getCurrentUserWithTeams();
  if(!user)return NextResponse.json({error:"Nicht angemeldet."},{status:401});
  if(!user.isApproved)return NextResponse.json({error:"Nicht freigegeben."},{status:403});
  const query=req.nextUrl.searchParams;
  const orderId=query.get("orderId");
  const fieldId=query.get("fieldId");
  if((orderId?1:0)+(fieldId?1:0)!==1)return NextResponse.json({error:"Auftrag ODER Flaeche angeben."},{status:400});
  const field=orderId ? await orderFlightField(user,orderId) :
   user.isAdmin && fieldId && fieldId.length<=100 ? await db.field.findUnique({where:{id:fieldId},select:{id:true,name:true,displayName:true,areaGeoJson:true}}):null;
  if(!field)return NextResponse.json({error:"Keine Berechtigung fuer diese Auftragsflaeche oder Flaeche existiert nicht."},{status:403});
  const mission=await readCurrentPlanning(field.id);
   const preparation=orderId?await getOrderPreparation(orderId):null;
  return NextResponse.json({field,mission,preparation},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("DJI-Flugplanung laden:",e);return NextResponse.json({error:"Flugplanung konnte nicht geladen werden."},{status:500});}
}
