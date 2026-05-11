export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

function parseDateOnlyToUtc(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error("Ungültiges Datum.");
  }

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function normalizeMeetingTime(value: unknown) {
  const text = String(value || "").trim();

  if (!text) return "";

  if (!/^\d{2}:\d{2}$/.test(text)) {
    throw new Error("Ungültige Uhrzeit.");
  }

  return text;
}

export async function PATCH(req: NextRequest) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const body = await req.json();

    const dateString = String(body?.date || "").trim();
    const meetingTime = normalizeMeetingTime(body?.meetingTime);

    if (!dateString) {
      return NextResponse.json({ error: "Datum fehlt." }, { status: 400 });
    }
    const date = parseDateOnlyToUtc(dateString);

    const operationDay = await db.operationDay.upsert({
      where: { date },
      update: {
        meetingTime: meetingTime || null,
      },
      create: {
        date,
        status: "PLANUNG",
        meetingTime: meetingTime || null,
      },
    });

    return NextResponse.json({
      success: true,
      operationDay: {
        id: operationDay.id,
        date: operationDay.date.toISOString().slice(0, 10),
        status: operationDay.status,
        meetingTime: operationDay.meetingTime || "",
      },
    });
  } catch (error: any) {
    console.error("Treffzeit speichern Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Treffzeit konnte nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}