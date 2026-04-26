import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const registerPushSchema = z.object({
  token: z.string().min(10),
  platform: z.string().optional(),
  browser: z.string().optional(),
  deviceLabel: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = registerPushSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabedaten" },
        { status: 400 }
      );
    }

    const userId = String((session.user as any).id);
    const { token, platform, browser, deviceLabel } = parsed.data;

    const existing = await db.pushDevice.findUnique({
      where: { token },
    });

    if (existing) {
      const updated = await db.pushDevice.update({
        where: { token },
        data: {
          userId,
          platform: platform ?? existing.platform,
          browser: browser ?? existing.browser,
          deviceLabel: deviceLabel ?? existing.deviceLabel,
          isActive: true,
          lastSeenAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        pushDeviceId: updated.id,
        updated: true,
      });
    }

    const created = await db.pushDevice.create({
      data: {
        userId,
        token,
        platform,
        browser,
        deviceLabel,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      pushDeviceId: created.id,
      created: true,
    });
  } catch (error) {
    console.error("POST /api/push/register error:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}