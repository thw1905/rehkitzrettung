export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { getTeamMeetingPointsByDay } from "@/lib/team-meeting-points";

function dateValue(raw:string):Date|null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date=new Date(`${raw}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===raw ? date : null;
}

export async function GET(req:NextRequest) {
  const check=await requireAdminApi();
  if(!check.ok) return NextResponse.json({error:check.message},{status:check.status});
  const date=dateValue(req.nextUrl.searchParams.get("date") || "");
  if(!date) return NextResponse.json({error:"Ungültiges Datum."},{status:400});
  const day=await db.operationDay.findUnique({where:{date},select:{id:true}});
  if(!day) return NextResponse.json({error:"Einsatztag nicht gefunden."},{status:404});
  return NextResponse.json({points:await getTeamMeetingPointsByDay(day.id)},{headers:{"Cache-Control":"no-store"}});
}

export async function PATCH(req:NextRequest) {
  const check=await requireAdminApi();
  if(!check.ok) return NextResponse.json({error:check.message},{status:check.status});
  try {
    const input=await req.json();
    const id=String(input?.operationDayTeamId||"");
    if(!id) return NextResponse.json({error:"Team-ID fehlt."},{status:400});
    if(input?.meetingPointText !== null && typeof input?.meetingPointText !== "string")
      return NextResponse.json({error:"Ungültiger Treffpunkt."},{status:400});
    const manual=typeof input.meetingPointText === "string" ? input.meetingPointText.trim() : null;
    if (manual !== null && (!manual || manual.length>500))
      return NextResponse.json({error:"Manuellen Treffpunkt mit maximal 500 Zeichen eingeben."},{status:400});
    const team=await db.operationDayTeam.findUnique({where:{id},select:{operationDayId:true}});
    if(!team) return NextResponse.json({error:"Tages-Team nicht gefunden."},{status:404});
    await db.operationDayTeam.update({where:{id},data:{meetingPointText:manual}});
    const points=await getTeamMeetingPointsByDay(team.operationDayId);
    return NextResponse.json({point:points.find(p=>p.operationDayTeamId===id)},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    console.error("Teamtreffpunkt speichern:",error);
    return NextResponse.json({error:"Teamtreffpunkt konnte nicht gespeichert werden."},{status:500});
  }
}
