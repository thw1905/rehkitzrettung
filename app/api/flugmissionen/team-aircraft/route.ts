// REHKITZ_DJI_V36 – Drohne je Einsatztag-Team, Admin oder zugeordneter Pilot.
import { NextRequest,NextResponse } from 'next/server';
import { getCurrentUserWithTeams } from '@/lib/current-user';
import { db } from '@/lib/db';
import { isAllowedFlightMutationOrigin } from '@/lib/flight-missions/request-origin';
import { readTeamDrone,writeTeamDrone } from '@/lib/flight-missions/team-aircraft-v36';
import {prepareDay} from '@/lib/flight-missions/auto-prepare-v36';
export const runtime='nodejs';export const dynamic='force-dynamic';
const NOSTORE={'Cache-Control':'no-store'};
async function authorized(teamId:string,user:{id:string;isApproved:boolean;isAdmin:boolean}){
 if(!user.isApproved)return null;
 const team=await db.operationDayTeam.findUnique({where:{id:teamId},select:{id:true,pilotId:true,operationDayId:true}});
 if(!team||(!user.isAdmin&&team.pilotId!==user.id))return null;
 return team;
}
export async function GET(req:NextRequest){
 const user=await getCurrentUserWithTeams();if(!user)return NextResponse.json({error:'Nicht angemeldet'},{status:401});
 const id=req.nextUrl.searchParams.get('operationDayTeamId')||'';
 const team=await authorized(id,user);if(!team)return NextResponse.json({error:'Keine Berechtigung'},{status:403});
 return NextResponse.json({teamId:team.id,aircraft:(await readTeamDrone(team.id))?.aircraft||null},{headers:NOSTORE});
}
export async function POST(req:NextRequest){
 try{
  const user=await getCurrentUserWithTeams();if(!user)return NextResponse.json({error:'Nicht angemeldet'},{status:401});
  if(!isAllowedFlightMutationOrigin(req))return NextResponse.json({error:'Ungueltiger Ursprung'},{status:403});
  const body=await req.json();
  if(!['M3T','M4T'].includes(body.aircraft))return NextResponse.json({error:'Drohne angeben'},{status:400});
  let selectedId=typeof body?.operationDayTeamId==='string'?body.operationDayTeamId:'';
  if(!selectedId && user.isAdmin && typeof body.operationDayId==='string' && typeof body.teamSlotId==='string'){
   const [day,slot]=await Promise.all([
     db.operationDay.findUnique({where:{id:body.operationDayId},select:{id:true}}),
     db.team.findUnique({where:{id:body.teamSlotId},select:{id:true,isActive:true}}),
   ]);
   if(!day||!slot?.isActive)return NextResponse.json({error:'Team oder Einsatztag nicht gefunden'},{status:404});
   const row=await db.operationDayTeam.upsert({where:{operationDayId_teamId:{operationDayId:day.id,teamId:slot.id}},
       update:{},create:{operationDayId:day.id,teamId:slot.id,pilotId:null},select:{id:true}});
   selectedId=row.id;
  }
  const team=await authorized(selectedId,user);if(!team)return NextResponse.json({error:'Keine Berechtigung'},{status:403});
  const before=await readTeamDrone(team.id);
  if(before && before.aircraft===body.aircraft)return NextResponse.json({success:true,operationDayTeamId:team.id,aircraft:before.aircraft,unchanged:true},{headers:NOSTORE});
  const change=await writeTeamDrone(team.id,body.aircraft,user.id);
  // Ganzer Einsatztag: keine abgeschlossenen/laufenden Missionen überschreiben.
  const result=await prepareDay(team.operationDayId);
  return NextResponse.json({success:true,operationDayTeamId:team.id,aircraft:change.aircraft,preparation:result,message:'Offene Flugvorbereitungen aktualisiert. Cloud-Missionen unveraendert.'},{headers:NOSTORE});
 }catch(e){console.error('Drohnenwechsel V3.6:',e);return NextResponse.json({error:e instanceof Error?e.message:'Drohnenwechsel fehlgeschlagen'},{status:500});}
}
