// REHKITZ_DJI_V3_ONE_PER_FIELD: Adminliste mit dauerhaftem Loeschen ohne Archivierung.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { deleteWaylinePermanently, configuredWorkspace, listWaylines, publicOrigin } from "@/lib/flight-missions/cloud-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

async function isAdmin(){
 const user=await getCurrentUserWithTeams();
 return Boolean(user?.isApproved && user.isAdmin);
}

export async function GET(){
 try{
  if(!(await isAdmin()))return NextResponse.json({error:"Keine Berechtigung."},{status:403,headers:noStore});
  const list=await listWaylines(configuredWorkspace());
  const missions=list.map(m=>({id:m.id,name:m.name,aircraft:m.aircraft,camera:m.camera,createdAt:m.createdAt,size:m.size}));
  return NextResponse.json({missions},{headers:noStore});
 }catch(e){console.error("DJI-Cloud-Missionen GET:",e);return NextResponse.json({error:"Missionen konnten nicht geladen werden."},{status:500,headers:noStore});}
}

export async function DELETE(req:NextRequest){
 try{
  if(!(await isAdmin()))return NextResponse.json({error:"Keine Berechtigung."},{status:403,headers:noStore});
  // Schutz vor fremden Websites bei cookie-basierter Admin-Anmeldung.
  const origin=req.headers.get("origin");
  if(!origin || origin!==publicOrigin(req.url))return NextResponse.json({error:"Ungueltiger Anfrage-Ursprung."},{status:403,headers:noStore});
  const body:unknown=await req.json();
  const id=(body && typeof body==="object" && "id" in body) ? (body as {id?:unknown}).id : undefined;
  if(typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){
   return NextResponse.json({error:"Ungueltige Mission-ID."},{status:400,headers:noStore});
  }
  const ok=await deleteWaylinePermanently(id,configuredWorkspace());
  if(!ok)return NextResponse.json({error:"Mission nicht gefunden oder bereits entfernt."},{status:404,headers:noStore});
  console.info("[DJI-CLOUD-DELETE] Mission dauerhaft entfernt:",id);
  return NextResponse.json({success:true},{headers:noStore});
 }catch(e){
  console.error("DJI-Cloud-Missionen DELETE:",e);
  return NextResponse.json({error:"Mission konnte nicht entfernt werden."},{status:500,headers:noStore});
 }
}
