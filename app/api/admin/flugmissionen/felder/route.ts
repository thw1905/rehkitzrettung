// REHKITZ_FLUGMISSION_V1 – DJI-Flugplanung; keine Aenderung bestehender DJI-Bindings.
import { NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";
export const dynamic="force-dynamic";
export async function GET(){
 const user=await getCurrentUserWithTeams();
 if(!user) return NextResponse.json({error:"Nicht angemeldet."},{status:401});
 if(!user.isApproved || !user.isAdmin) return NextResponse.json({error:"Nur für Administratoren."},{status:403});
 const fields=await db.field.findMany({select:{id:true,name:true,displayName:true,areaGeoJson:true},orderBy:{displayName:'asc'},take:3000});
 return NextResponse.json({fields},{headers:{'Cache-Control':'no-store'}});
}
