export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

export async function GET() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const recipients = await db.notificationRecipient.findMany({
    where: {
      userId: currentUser.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      notification: {
        include: {
          acknowledgements: {
            where: {
              userId: currentUser.id,
            },
            select: {
              id: true,
              acknowledgedAt: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json(
    recipients.map((item) => ({
      id: item.notification.id,
      title: item.notification.title,
      body: item.notification.body,
      type: item.notification.type,
      date: item.notification.date,
      createdAt: item.notification.createdAt,
      acknowledged: item.notification.acknowledgements.length > 0,
      acknowledgedAt:
        item.notification.acknowledgements[0]?.acknowledgedAt ?? null,
    }))
  );
}