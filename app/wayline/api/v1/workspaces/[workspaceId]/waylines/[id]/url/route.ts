// REHKITZ_DJI_DOWNLOAD_DIAG_V1_3
import { NextRequest,NextResponse } from "next/server";
import { checkDjiSession } from "@/lib/dji/token";
import { findWayline,signedUrl,publicOrigin } from "@/lib/flight-missions/cloud-store";
export const runtime="nodejs";
type Ctx={params:Promise<{workspaceId:string;id:string}>};
export async function GET(req:NextRequest,{params}:Ctx){
 const {workspaceId,id}=await params;
 console.info("[DJI-WAYLINE-URL] Anfrage",id);
 const session=await checkDjiSession(req.headers.get("x-auth-token"),workspaceId);
 if(!session){console.warn("[DJI-WAYLINE-URL] HTTP 401",id);return NextResponse.json({code:401,message:"Unauthorized",data:{}},{status:401});}
 const mission=await findWayline(id,workspaceId);
 if(!mission){console.warn("[DJI-WAYLINE-URL] HTTP 404",id);return NextResponse.json({code:404,message:"Mission not found",data:{}},{status:404});}
 try{const origin=publicOrigin(req.url);const download=signedUrl(mission.id,origin);console.info("[DJI-WAYLINE-URL] HTTP 200",id,"Download-Host",new URL(download).host);return NextResponse.json({code:0,message:"success",data:{url:download}},{headers:{"Cache-Control":"no-store"}});}
 catch(e){console.error("[DJI-WAYLINE-URL] HTTP 500",id,e instanceof Error?e.message:"unbekannt");return NextResponse.json({code:500,message:e instanceof Error?e.message:"Download error",data:{}},{status:500});}
}
