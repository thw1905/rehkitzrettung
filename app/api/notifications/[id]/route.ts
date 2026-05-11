export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

export async function GET(
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
    include: {
      acknowledgements: {
        where: { userId: currentUser.id },
        select: {
          id: true,
          acknowledgedAt: true,
        },
      },
    },
  });

  if (!notification) {
    return NextResponse.json(
      { error: "Benachrichtigung nicht gefunden." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...notification,
    acknowledged: notification.acknowledgements.length > 0,
    acknowledgedAt: notification.acknowledgements[0]?.acknowledgedAt ?? null,
  });
}