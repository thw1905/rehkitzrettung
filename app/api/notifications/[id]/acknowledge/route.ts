export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { id } = await context.params;

  const notification = await db.notificationMessage.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!notification) {
    return NextResponse.json(
      { error: "Benachrichtigung nicht gefunden." },
      { status: 404 }
    );
  }

  const acknowledgement = await db.notificationAcknowledgement.upsert({
    where: {
      notificationId_userId: {
        notificationId: id,
        userId: currentUser.id,
      },
    },
    update: {
      acknowledgedAt: new Date(),
    },
    create: {
      notificationId: id,
      userId: currentUser.id,
    },
  });

  return NextResponse.json({
    success: true,
    acknowledgedAt: acknowledgement.acknowledgedAt,
  });
}