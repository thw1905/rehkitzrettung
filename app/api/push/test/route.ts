import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { messaging } from "@/lib/firebase-admin";
import { requireAdminApi } from "@/lib/admin";

export async function POST() {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const devices = await db.pushDevice.findMany({
      where: {
        isActive: true,
      },
      select: {
        token: true,
      },
    });

    const tokens = devices.map((device) => device.token);

    if (tokens.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Keine aktiven Push-Geräte gefunden.",
      });
    }

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: "Testbenachrichtigung 🚀",
        body: "Push funktioniert.",
      },
      data: {
        link: "/dashboard",
      },
    });

    return NextResponse.json({
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
    });
  } catch (error: any) {
    console.error("Push-Test Fehler:", error);

    return NextResponse.json(
      {
        error: error?.message || "Push-Test fehlgeschlagen.",
      },
      { status: 500 }
    );
  }
}