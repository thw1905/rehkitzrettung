import { NextRequest,NextResponse } from "next/server";
import { checkDjiSession } from "@/lib/dji/token";
import { findWayline,signedUrl,publicOrigin } from "@/lib/flight-missions/cloud-store";
export const runtime="nodejs";
type Ctx={params:Promise<{workspaceId:string;id:string}>};
export async function GET(req:NextRequest,{params}:Ctx){
 const {workspaceId,id}=await params;
 const session=await checkDjiSession(req.headers.get("x-auth-token"),workspaceId);
 if(!session)return NextResponse.json({code:401,message:"Unauthorized",data:{}},{status:401});
 const mission=await findWayline(id,workspaceId);
 if(!mission)return NextResponse.json({code:404,message:"Mission not found",data:{}},{status:404});
 try{return NextResponse.json({code:0,message:"success",data:{url:signedUrl(mission.id,publicOrigin(req.url))}},{headers:{"Cache-Control":"no-store"}});}
 catch(e){return NextResponse.json({code:500,message:e instanceof Error?e.message:"Download error",data:{}},{status:500});}
}
