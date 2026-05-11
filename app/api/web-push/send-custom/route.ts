export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { sendWebPushToUser } from "@/lib/web-push";

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

    const title = String(body?.title || "").trim();
    const text = String(body?.body || "").trim();
    const target = String(body?.target || "ALL").trim();

    if (!title) {
      return NextResponse.json(
        { error: "Titel fehlt." },
        { status: 400 }
      );
    }

    if (!text) {
      return NextResponse.json(
        { error: "Nachricht fehlt." },
        { status: 400 }
      );
    }

    const users = await db.user.findMany({
      where: {
        isApproved: true,
      },
      select: {
        id: true,
        role: true,
        isAdmin: true,
      },
    });

    let filtered = users;

    if (target === "PILOT") {
      filtered = users.filter((u) => u.role === "PILOT");
    }

    if (target === "SUCHER" || target === "SEARCHER") {
      filtered = users.filter((u) => u.role === "SUCHER");
    }

    if (target === "ADMIN") {
      filtered = users.filter((u) => u.isAdmin);
    }

    if (target === "PILOT_SUCHER" || target === "PILOT_SEARCHER") {
      filtered = users.filter(
        (u) => u.role === "PILOT" || u.role === "SUCHER"
      );
    }

    const userIds = Array.from(new Set(filtered.map((user) => user.id)));

    if (userIds.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        recipientCount: 0,
      });
    }

    const notification = await db.notificationMessage.create({
      data: {
        title,
        body: text,
        type: "CUSTOM_MESSAGE",
        recipients: {
          create: userIds.map((userId) => ({
            userId,
          })),
        },
      },
    });

    let sent = 0;

    for (const userId of userIds) {
      const count = await sendWebPushToUser(userId, {
        title: notification.title,
        body: notification.body,
        url: `/notifications/${notification.id}`,
      });

      sent += count;
    }

    return NextResponse.json({
      success: true,
      sent,
      recipientCount: userIds.length,
      notificationId: notification.id,
    });
  } catch (error: any) {
    console.error("Custom Push Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Fehler beim Senden.",
      },
      { status: 500 }
    );
  }
}