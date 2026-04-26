import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export async function GET() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const count = await db.user.count({
      where: {
        lastSeenAt: {
          gte: tenMinutesAgo,
        },
      },
    });

    return NextResponse.json({ count });
  } catch (error: any) {
    console.error("Fehler beim Laden der Online-Zahl:", error);

    return NextResponse.json(
      { error: error?.message || "Online-Zahl konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}