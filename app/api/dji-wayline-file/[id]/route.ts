// Fuer DJI Pilot 2 kurzzeitig signierter Download (kein offener Dateiserver).
import { NextRequest,NextResponse } from "next/server";
import { findWayline,readWaylineKmz,validSignature } from "@/lib/flight-missions/cloud-store";
export const runtime="nodejs";
type Ctx={params:Promise<{id:string}>};
export async function GET(req:NextRequest,{params}:Ctx){
 const {id}=await params;
 if(!validSignature(id,req.nextUrl.searchParams.get("exp"),req.nextUrl.searchParams.get("sig")))return NextResponse.json({error:"Link abgelaufen oder ungueltig."},{status:403});
 const mission=await findWayline(id);
 if(!mission)return NextResponse.json({error:"Mission nicht gefunden."},{status:404});
 try{
  const file=await readWaylineKmz(id);
  return new NextResponse(new Uint8Array(file) as unknown as BodyInit,{headers:{"Content-Type":"application/vnd.google-earth.kmz","Content-Disposition":`attachment; filename="${id}.kmz"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return NextResponse.json({error:"Datei fehlt."},{status:404});}
}
