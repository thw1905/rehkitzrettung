export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser) {
      return NextResponse.json({ count: 0 });
    }

    const recipients = await db.notificationRecipient.findMany({
      where: {
        userId: currentUser.id,
      },
      select: {
        notificationId: true,
      },
    });

    if (recipients.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    const notificationIds = recipients.map((item) => item.notificationId);

    const acknowledged = await db.notificationAcknowledgement.findMany({
      where: {
        userId: currentUser.id,
        notificationId: {
          in: notificationIds,
        },
      },
      select: {
        notificationId: true,
      },
    });

    const acknowledgedIds = new Set(
      acknowledged.map((item) => item.notificationId)
    );

    const openCount = notificationIds.filter(
      (id) => !acknowledgedIds.has(id)
    ).length;

    return NextResponse.json({
      count: openCount,
    });
  } catch (error: any) {
    console.error("Unread notification count Fehler:", error);

    return NextResponse.json({ count: 0 });
  }
}