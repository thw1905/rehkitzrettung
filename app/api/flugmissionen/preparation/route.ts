// REHKITZ_DJI_V36 – Vorbereitung, keine Cloud-Publikation.
import {NextRequest,NextResponse} from 'next/server';
import {getCurrentUserWithTeams} from '@/lib/current-user';
import {db} from '@/lib/db';
import {publicOrigin} from '@/lib/flight-missions/cloud-store';
import {getOrderPreparation,prepareOrder,prepareDay} from '@/lib/flight-missions/auto-prepare-v36';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const user=await getCurrentUserWithTeams();if(!user?.isApproved)return NextResponse.json({error:'Keine Berechtigung'},{status:403});
 const orderId=req.nextUrl.searchParams.get('orderId')||'';
 const info=await getOrderPreparation(orderId);
 if(!info.assignment||(!user.isAdmin&&(user.role!=='PILOT'||info.assignment.team.pilotId!==user.id)))return NextResponse.json({error:'Keine Berechtigung'},{status:403});
 return NextResponse.json(info,{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 try{
 const user=await getCurrentUserWithTeams();if(!user?.isApproved)return NextResponse.json({error:'Keine Berechtigung'},{status:403});
 const origin=req.headers.get('origin');if(!origin||origin!==publicOrigin(req.url))return NextResponse.json({error:'Ungueltiger Ursprung'},{status:403});
 const body=await req.json();
 if(typeof body?.operationDayId==='string'&&user.isAdmin){
  const day=await db.operationDay.findUnique({where:{id:body.operationDayId},select:{id:true}});if(!day)return NextResponse.json({error:'Einsatztag unbekannt'},{status:404});
  return NextResponse.json(await prepareDay(day.id));
 }
 if(typeof body?.orderId!=='string')return NextResponse.json({error:'Auftrag fehlt'},{status:400});
 const info=await getOrderPreparation(body.orderId);
 if(!info.assignment||(!user.isAdmin&&(user.role!=='PILOT'||info.assignment.team.pilotId!==user.id)))return NextResponse.json({error:'Keine Berechtigung'},{status:403});
 const result=await prepareOrder(body.orderId);
 return NextResponse.json(result);
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Vorbereitung fehlgeschlagen'},{status:400});}
}
