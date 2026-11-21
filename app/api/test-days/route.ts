export const runtime='nodejs';
export const dynamic='force-dynamic';
import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getCurrentUserWithTeams} from '@/lib/current-user';
import {dateOnly,inSeason,verifyTestDayPin} from '@/lib/test-mode';
const failed=new Map<string,{count:number;until:number}>();
const noStore={'Cache-Control':'no-store'};
export async function GET(){
 const user=await getCurrentUserWithTeams();
 if(!user?.isApproved)return NextResponse.json({error:'Nicht berechtigt'},{status:403});
 const rows=await db.operationDay.findMany({where:{isTest:true},select:{id:true,date:true,isTest:true},orderBy:{date:'asc'},take:180});
 return NextResponse.json({days:rows.map(x=>({id:x.id,date:x.date.toISOString().slice(0,10),isTest:true}))},{headers:noStore});
}
export async function POST(req:NextRequest){
 try{
  const user=await getCurrentUserWithTeams();
  if(!user?.isAdmin||!user.isApproved)return NextResponse.json({error:'Nur Administratoren'},{status:403});
  const submittedOrigin=req.headers.get('origin');
  let validOrigin=false;
  if(process.env.NODE_ENV==='production'){
   const expectedOrigin=process.env.NEXTAUTH_URL?new URL(process.env.NEXTAUTH_URL).origin:req.nextUrl.origin;
   validOrigin=submittedOrigin===expectedOrigin;
  }else if(submittedOrigin){
   // Lokal mit dem tatsaechlichen Host vergleichen, unabhaengig von NEXTAUTH_URL.
   try{
    const parsed=new URL(submittedOrigin);
    validOrigin=parsed.host===req.headers.get('host')&&(parsed.protocol==='http:'||parsed.protocol==='https:');
   }catch{validOrigin=false;}
  }
  if(!validOrigin)return NextResponse.json({error:'Ungültiger Ursprung'},{status:403});
  const gate=failed.get(user.id);
  if(gate && gate.until>Date.now()&&gate.count>=5)return NextResponse.json({error:'PIN vorübergehend gesperrt'},{status:429});
  if(!process.env.DEMO_ORDER_PIN)return NextResponse.json({error:'Gemeinsamer Admin-PIN (DEMO_ORDER_PIN) ist nicht konfiguriert'},{status:503});
  const body=await req.json();
  if(typeof body?.date!=='string'||typeof body?.pin!=='string')return NextResponse.json({error:'Datum und PIN fehlen'},{status:400});
  const date=dateOnly(body.date);
  if(inSeason(date))return NextResponse.json({error:'Mai bis Juli ist die normale Saison'},{status:400});
  const year=new Date().getUTCFullYear();
  if(date.getUTCFullYear()<year-1||date.getUTCFullYear()>year+2)return NextResponse.json({error:'TEST-Datum außerhalb des zulässigen Planungszeitraums'},{status:400});
  if(!(await verifyTestDayPin(body.pin))){
   const next=gate&&gate.until>Date.now()?{count:gate.count+1,until:gate.until}:{count:1,until:Date.now()+15*60_000};
   failed.set(user.id,next);return NextResponse.json({error:'PIN ungültig'},{status:403});
  }
  failed.delete(user.id);
  const existing=await db.operationDay.findUnique({where:{date},select:{id:true,isTest:true}});
  if(existing&&!existing.isTest)return NextResponse.json({error:'Dieser Tag ist bereits als produktiver Einsatztag angelegt; keine Umwandlung möglich'},{status:409});
  const day=existing||await db.operationDay.create({data:{date,isTest:true,status:'PLANUNG',note:'TEST-EINSATZ'},select:{id:true,isTest:true,date:true}});
  return NextResponse.json({success:true,id:day.id,date:body.date,isTest:true},{headers:noStore});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'TEST-Tag konnte nicht angelegt werden'},{status:400});}
}
