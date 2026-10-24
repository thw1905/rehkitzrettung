export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { db } from "@/lib/db";
import { getOperationDayMeetingPoint } from "@/lib/operation-day-meeting-point";

function parseDate(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? null : date;
}

async function lookupDate(raw: string) {
  const date = parseDate(raw);
  if (!date) return { error: "Ungültiges Datum.", status: 400 as const };
  const day = await db.operationDay.findUnique({ where: { date }, select: { id: true } });
  if (!day) return { error: "Einsatztag nicht vorhanden.", status: 404 as const };
  return { id: day.id };
}

export async function GET(req: NextRequest) {
  const check = await requireAdminApi();
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: check.status });
  try {
    const lookup = await lookupDate(req.nextUrl.searchParams.get("date") || "");
    if ("error" in lookup) return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    const point = await getOperationDayMeetingPoint(lookup.id!);
    return NextResponse.json(point, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Treffpunkt laden:", error);
    return NextResponse.json({ error: "Treffpunkt konnte nicht geladen werden." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const check = await requireAdminApi();
  if (!check.ok) return NextResponse.json({ error: check.message }, { status: check.status });
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
      if (new URL(origin).host !== host) return NextResponse.json({ error: "Ungültiger Aufruf." }, { status: 403 });
    } catch { return NextResponse.json({ error: "Ungültiger Aufruf." }, { status: 403 }); }
  }
  try {
    const body = await req.json();
    const lookup = await lookupDate(String(body?.date || ""));
    if ("error" in lookup) return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    if (body?.meetingPointText !== null && typeof body?.meetingPointText !== "string") {
      return NextResponse.json({ error: "Ungültiger Treffpunkt." }, { status: 400 });
    }
    const override = typeof body.meetingPointText === "string" ? body.meetingPointText.trim() : null;
    if (override !== null && (override.length === 0 || override.length > 500)) {
      return NextResponse.json({ error: "Bitte den manuellen Treffpunkt mit maximal 500 Zeichen eingeben." }, { status: 400 });
    }
    await db.operationDay.update({
      where: { id: lookup.id },
      data: { meetingPointText: override },
    });
    return NextResponse.json(await getOperationDayMeetingPoint(lookup.id!), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Treffpunkt speichern:", error);
    return NextResponse.json({ error: "Treffpunkt konnte nicht gespeichert werden." }, { status: 500 });
  }
}
