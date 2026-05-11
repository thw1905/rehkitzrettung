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

    const reminderUserIds = new Set<string>();

    for (const user of users) {
      const needsReminder = days.some((day) => {
        const status = byUserDate.get(`${user.id}_${day}`);

        return !status || status === "OFFEN" || status === "VIELLEICHT";
      });

      if (needsReminder) {
        reminderUserIds.add(user.id);
      }
    }

    if (reminderUserIds.size === 0) {
      return NextResponse.json({
        success: true,
        remindedUsers: 0,
        sentPushes: 0,
      });
    }

    const notification = await db.notificationMessage.create({
      data: {
        title: "📅 Verfügbarkeit eintragen",
        body: "Bitte trage deine Verfügbarkeit für die kommenden Tage ein.",
        type: "AVAILABILITY_REMINDER",
        recipients: {
          create: Array.from(reminderUserIds).map((userId) => ({
            userId,
          })),
        },
      },
    });

    let sentPushes = 0;

    for (const userId of reminderUserIds) {
      const sent = await sendWebPushToUser(userId, {
        title: notification.title,
        body: notification.body,
        url: `/notifications/${notification.id}`,
      });

      sentPushes += sent;
    }

    return NextResponse.json({
      success: true,
      remindedUsers: reminderUserIds.size,
      sentPushes,
      notificationId: notification.id,
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