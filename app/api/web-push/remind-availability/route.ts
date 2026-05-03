export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { sendWebPushToUser } from "@/lib/web-push";

function toDateKeyUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildSeasonDays() {
  const year = new Date().getFullYear();

  // Saison: 01.05. – 30.06.
  const start = new Date(Date.UTC(year, 4, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, 6, 1, 0, 0, 0, 0));

  const days: string[] = [];

  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(toDateKeyUtc(d));
  }

  return { start, end, days };
}

export async function POST() {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const { start, end, days } = buildSeasonDays();

    const users = await db.user.findMany({
      where: {
        isApproved: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    const availabilities = await db.availability.findMany({
      where: {
        date: {
          gte: start,
          lt: end,
        },
      },
      select: {
        userId: true,
        date: true,
        status: true,
      },
    });

    const byUserDate = new Map<string, string>();

    for (const item of availabilities) {
      byUserDate.set(
        `${item.userId}_${toDateKeyUtc(item.date)}`,
        item.status
      );
    }

    let remindedUsers = 0;
    let sentPushes = 0;

    for (const user of users) {
      const needsReminder = days.some((day) => {
        const status = byUserDate.get(`${user.id}_${day}`);

        return !status || status === "OFFEN" || status === "VIELLEICHT";
      });

      if (!needsReminder) continue;

      remindedUsers++;

      const sent = await sendWebPushToUser(user.id, {
        title: "📅 Verfügbarkeit eintragen",
        body: "Bitte trage deine Verfügbarkeit für die kommenden Tage ein.",
        url: "/availability",
      });

      sentPushes += sent;
    }

    return NextResponse.json({
      success: true,
      remindedUsers,
      sentPushes,
    });
  } catch (error: any) {
    console.error("Verfügbarkeits-Erinnerung Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Erinnerung konnte nicht gesendet werden.",
      },
      { status: 500 }
    );
  }
}