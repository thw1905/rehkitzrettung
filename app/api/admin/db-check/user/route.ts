export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "E-Mail fehlt." },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isAdmin: true,
        isApproved: true,
        createdAt: true,
        updatedAt: true,

        webPushSubscriptions: {
          select: {
            id: true,
            endpoint: true,
            isActive: true,
            userAgent: true,
            createdAt: true,
            updatedAt: true,
            lastSeenAt: true,
          },
          orderBy: {
            updatedAt: "desc",
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Benutzer wurde nicht gefunden." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      user,
    });
  } catch (error: any) {
    console.error("DB-Check Benutzer Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Benutzer konnte nicht geprüft werden.",
      },
      { status: 500 }
    );
  }
}