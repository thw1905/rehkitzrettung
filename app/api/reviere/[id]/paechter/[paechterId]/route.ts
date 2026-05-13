import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; paechterId: string }> }
) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const { id, paechterId } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Revier fehlt." },
        { status: 400 }
      );
    }

    if (!paechterId) {
      return NextResponse.json(
        { error: "Pächter fehlt." },
        { status: 400 }
      );
    }

    await db.revierPachterAssignment.deleteMany({
      where: {
        revierId: id,
        pachterId: paechterId,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("Pächter vom Revier entfernen Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Pächter konnte nicht vom Revier entfernt werden.",
      },
      { status: 500 }
    );
  }
}