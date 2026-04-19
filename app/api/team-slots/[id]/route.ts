import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

function parseSortOrder(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;

  const n = Number(value);

  if (!Number.isFinite(n)) {
    throw new Error("Ungültige Reihenfolge.");
  }

  return Math.floor(n);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status }
    );
  }

  try {
    const { id } = await context.params;
    const body = await req.json();

    const existing = await db.team.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Team-Slot nicht gefunden." },
        { status: 404 }
      );
    }

    const name =
      body.name === undefined ? existing.name : String(body.name || "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Name fehlt." },
        { status: 400 }
      );
    }

    const updated = await db.team.update({
      where: { id },
      data: {
        name,
        sortOrder: parseSortOrder(body.sortOrder, existing.sortOrder),
        isActive:
          body.isActive === undefined ? existing.isActive : Boolean(body.isActive),
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Fehler beim Aktualisieren des Team-Slots:", error);

    return NextResponse.json(
      { error: error?.message || "Team-Slot konnte nicht aktualisiert werden." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status }
    );
  }

  try {
    const { id } = await context.params;

    const existing = await db.team.findUnique({
      where: { id },
      include: {
        operationDayTeams: {
          select: {
            id: true,
          },
          take: 1,
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Team-Slot nicht gefunden." },
        { status: 404 }
      );
    }

    if (existing.operationDayTeams.length > 0) {
      return NextResponse.json(
        {
          error:
            "Dieser Team-Slot wurde bereits verwendet und kann nicht gelöscht werden. Bitte stattdessen deaktivieren.",
        },
        { status: 400 }
      );
    }

    await db.team.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Fehler beim Löschen des Team-Slots:", error);

    return NextResponse.json(
      { error: error?.message || "Team-Slot konnte nicht gelöscht werden." },
      { status: 500 }
    );
  }
}