import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const { id } = await context.params;

    const existing = await db.operationDayTeam.findUnique({
      where: { id },
      include: {
        orders: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Tages-Team nicht gefunden." },
        { status: 404 }
      );
    }

    if (existing.orders.length > 0) {
      return NextResponse.json(
        {
          error:
            "Dieses Tages-Team ist bereits Aufträgen zugeordnet und kann nicht gelöscht werden.",
        },
        { status: 400 }
      );
    }

    await db.operationDayTeam.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Fehler beim Löschen des Tages-Teams:", error);

    return NextResponse.json(
      { error: error?.message || "Tages-Team konnte nicht gelöscht werden." },
      { status: 500 }
    );
  }
}