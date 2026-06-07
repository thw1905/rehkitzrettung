export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
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
    const result = await db.revier.updateMany({
      data: {
        isActive: false,
      },
    });

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `${result.count} Reviere wurden auf inaktiv gesetzt.`,
    });
  } catch (error: any) {
    console.error("Alle Reviere deaktivieren Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Reviere konnten nicht deaktiviert werden.",
      },
      { status: 500 }
    );
  }
}