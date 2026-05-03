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

    const { title, body: text, target } = body;

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

    if (target === "SUCHER") {
      filtered = users.filter((u) => u.role === "SUCHER");
    }

    if (target === "ADMIN") {
      filtered = users.filter((u) => u.isAdmin);
    }

    if (target === "PILOT_SUCHER") {
      filtered = users.filter(
        (u) => u.role === "PILOT" || u.role === "SUCHER"
      );
    }

    let sent = 0;

    for (const user of filtered) {
      const count = await sendWebPushToUser(user.id, {
        title,
        body: text,
        url: "/dashboard",
      });

      sent += count;
    }

    return NextResponse.json({
      success: true,
      sent,
    });
  } catch (error: any) {
    console.error("Custom Push Fehler:", error);

    return NextResponse.json(
      { error: "Fehler beim Senden" },
      { status: 500 }
    );
  }
}