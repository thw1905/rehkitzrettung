export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    if (!currentUser.isAdmin) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const notifications = await db.notificationMessage.findMany({
  orderBy: {
    createdAt: "desc",
  },
  take: 20,
  include: {
    acknowledgements: {
      orderBy: {
        acknowledgedAt: "asc",
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    },
  },
});

    return NextResponse.json(notifications);
  } catch (error: any) {
    console.error("Notifications Admin Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Benachrichtigungen konnten nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}