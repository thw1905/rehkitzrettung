export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { sendWebPushToUser } from "@/lib/web-push";

function parseDateOnlyToUtc(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error("Ungültiges Datum.");
  }

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function formatDateGerman(dateString: string) {
  const [year, month, day] = dateString.split("-");
  return `${day}.${month}.${year}`;
}

async function createNotificationForUsers(params: {
  title: string;
  body: string;
  type: string;
  date: Date;
  userIds: Set<string>;
}) {
  const notification = await db.notificationMessage.create({
    data: {
      title: params.title,
      body: params.body,
      type: params.type,
      date: params.date,
      recipients: {
        create: Array.from(params.userIds).map((userId) => ({
          userId,
        })),
      },
    },
  });

  let sentPushes = 0;

  for (const userId of params.userIds) {
    const sent = await sendWebPushToUser(userId, {
      title: notification.title,
      body: notification.body,
      url: `/notifications/${notification.id}`,
    });

    sentPushes += sent;
  }

  return {
    notificationId: notification.id,
    sentPushes,
  };
}

export async function POST(req: NextRequest) {
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

    if (!dateString) {
      return NextResponse.json({ error: "Datum fehlt." }, { status: 400 });
    }

    const date = parseDateOnlyToUtc(dateString);
    const displayDate = formatDateGerman(dateString);

    let meetingText = "";

    const operationDay = await db.operationDay.findUnique({
      where: { date },
      include: {
        teams: {
          include: {
            pilot: true,
            members: {
              include: {
                user: true,
              },
            },
            orders: true,
          },
        },
      },
    });
    if (!operationDay) {
      return NextResponse.json(
        { error: "Für dieses Datum wurde kein Einsatztag gefunden." },
        { status: 404 }
      );
    }
    meetingText = operationDay.meetingTime
  ? ` Treffzeit: ${operationDay.meetingTime} Uhr.`
  : "";

    const plannedUserIds = new Set<string>();

    for (const dayTeam of operationDay.teams) {
      if (dayTeam.pilotId) {
        plannedUserIds.add(dayTeam.pilotId);
      }

      for (const member of dayTeam.members) {
        plannedUserIds.add(member.userId);
      }
    }

    const availableUsers = await db.availability.findMany({
      where: {
        date,
        status: {
          in: ["ZUGESAGT", "VIELLEICHT"],
        },
      },
      select: {
        userId: true,
      },
    });

    const notPlannedUserIds = new Set<string>();

    for (const availability of availableUsers) {
      if (!plannedUserIds.has(availability.userId)) {
        notPlannedUserIds.add(availability.userId);
      }
    }

    let plannedPushes = 0;
    let notPlannedPushes = 0;

    if (plannedUserIds.size > 0) {
      const plannedMessage =
        `Du bist für den Einsatz am ${displayDate}, ${meetingText} eingeplant. Bitte öffne die App, prüfe deine Aufträge und bestätige die Kenntnisnahme.`;

      const result = await createNotificationForUsers({
        title: "🚨 Einsatz geplant",
        body: plannedMessage,
        type: "TEAM_ASSIGNMENT",
        date,
        userIds: plannedUserIds,
      });

      plannedPushes = result.sentPushes;
    }

    if (notPlannedUserIds.size > 0) {
      const notPlannedMessage =
        `Danke für deine Rückmeldung. Für den Einsatz am ${displayDate} bist du nicht eingeplant und musst nicht kommen.`;

      const result = await createNotificationForUsers({
        title: "✅ Heute frei",
        body: notPlannedMessage,
        type: "NOT_PLANNED",
        date,
        userIds: notPlannedUserIds,
      });

      notPlannedPushes = result.sentPushes;
    }

    return NextResponse.json({
      success: true,
      plannedUsers: plannedUserIds.size,
      notPlannedUsers: notPlannedUserIds.size,
      plannedPushes,
      notPlannedPushes,
      sentPushes: plannedPushes + notPlannedPushes,
    });
  } catch (error: any) {
    console.error("Team-Benachrichtigung Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Team-Benachrichtigung konnte nicht gesendet werden.",
      },
      { status: 500 }
    );
  }
}