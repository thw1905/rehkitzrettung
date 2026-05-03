export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    const body = await req.json();

    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "Ungültiges Push-Abo." },
        { status: 400 }
      );
    }

    const userAgent = req.headers.get("user-agent") || null;

    const existing = await db.webPushSubscription.findUnique({
      where: { endpoint },
    });

    if (existing) {
      const updated = await db.webPushSubscription.update({
        where: { endpoint },
        data: {
          userId: currentUser.id,
          p256dh,
          auth,
          userAgent,
          isActive: true,
          lastSeenAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        id: updated.id,
        updated: true,
      });
    }

    const created = await db.webPushSubscription.create({
      data: {
        userId: currentUser.id,
        endpoint,
        p256dh,
        auth,
        userAgent,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      id: created.id,
      created: true,
    });
  } catch (error: any) {
    console.error("WebPush Subscribe Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Push konnte nicht aktiviert werden." },
      { status: 500 }
    );
  }
}