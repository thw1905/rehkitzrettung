// DJI Cloud API: Pilot2 abonniert die Cloud-Routenbibliothek.
import { NextRequest,NextResponse } from "next/server";
import { checkDjiSession } from "@/lib/dji/token";
import { listWaylines } from "@/lib/flight-missions/cloud-store";
export const runtime="nodejs";
type Ctx={params:Promise<{workspaceId:string}>};
export async function GET(req:NextRequest,{params}:Ctx){
 const {workspaceId}=await params;
 const session=await checkDjiSession(req.headers.get("x-auth-token"),workspaceId);
 if(!session)return NextResponse.json({code:401,message:"Unauthorized",data:{}},{status:401});
 const query=req.nextUrl.searchParams;
 const page=Math.max(1,Math.min(100,Number(query.get("page"))||1));
 const page_size=Math.max(1,Math.min(100,Number(query.get("page_size"))||20));
 const missions=await listWaylines(workspaceId);
 const list=missions.slice((page-1)*page_size,page*page_size).map(m=>({
  id:m.id,name:m.name,object_key:m.id+".kmz",sign:m.sign,
  drone_model_key:m.aircraft==="M4T"?"99-1":"77-1",
  payload_model_keys:[m.aircraft==="M4T"?"89-2-0":"67-0-0"],
  template_types:[0],user_name:"Rehkitzrettung Hegering Hittfeld",
  update_time:m.createdAt,create_time:m.createdAt,
  action_type:"",favorited:false,
 }));
 return NextResponse.json({code:0,message:"success",data:{list,pagination:{page,page_size,total:missions.length}}},{headers:{"Cache-Control":"no-store"}});
}
