import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const unregisterPushSchema = z.object({
  token: z.string().min(10),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = unregisterPushSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabedaten" },
        { status: 400 }
      );
    }

    const userId = String((session.user as any).id);
    const { token } = parsed.data;

    const existing = await db.pushDevice.findFirst({
      where: {
        token,
        userId,
      },
    });

    if (!existing) {
      return NextResponse.json({
        success: true,
        message: "Gerät war nicht registriert",
      });
    }

    await db.pushDevice.update({
      where: { id: existing.id },
      data: {
        isActive: false,
        lastSeenAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("POST /api/push/unregister error:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}