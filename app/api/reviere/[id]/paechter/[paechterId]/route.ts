export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; pachterId: string }> }
) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const { id, pachterId } = await context.params;

    const existing = await db.revierPachterAssignment.findUnique({
      where: {
        revierId_pachterId: {
          revierId: id,
          pachterId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return NextResponse.json({
        success: true,
      });
    }

    await db.revierPachterAssignment.delete({
      where: {
        id: existing.id,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("Revierpächter entfernen Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Revierpächter konnte nicht entfernt werden.",
      },
      { status: 500 }
    );
  }
}