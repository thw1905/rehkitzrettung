import { NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { listWaylines } from "@/lib/flight-missions/cloud-store";
export const runtime="nodejs";
export async function GET(){
 const user=await getCurrentUserWithTeams();
 if(!user?.isApproved||!user.isAdmin)return NextResponse.json({error:"Nur Administratoren."},{status:403});
 return NextResponse.json({missions:(await listWaylines()).map(({id,name,createdAt,aircraft,camera,fieldId})=>({id,name,createdAt,aircraft,camera,fieldId}))},{headers:{"Cache-Control":"no-store"}});
}
