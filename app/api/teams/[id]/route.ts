import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

type TeamBody = {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
};

function parseSortOrder(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const n = Number(value);

  if (!Number.isFinite(n)) {
    throw new Error("Ungültige Sortierung.");
  }

  return Math.floor(n);
}

function parseIsActive(value: unknown, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") return true;
  if (value === "false") return false;

  throw new Error("Ungültiger Aktiv-Status.");
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const { id } = await context.params;
    const body = (await req.json()) as TeamBody;

    const existingTeam = await db.team.findUnique({
      where: { id },
    });

    if (!existingTeam) {
      return NextResponse.json(
        { error: "Team nicht gefunden." },
        { status: 404 }
      );
    }

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json(
        { error: "Teamname fehlt." },
        { status: 400 }
      );
    }

    const sortOrder = parseSortOrder(body.sortOrder, existingTeam.sortOrder);
    const isActive = parseIsActive(body.isActive, existingTeam.isActive);

    const team = await db.team.update({
      where: { id },
      data: {
        name,
        sortOrder,
        isActive,
      },
      include: {
        operationDayTeams: {
          include: {
            operationDay: true,
            pilot: true,
            members: {
              include: {
                user: true,
              },
            },
            orders: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    return NextResponse.json(team);
  } catch (error: any) {
    console.error("Fehler beim Aktualisieren des Teams:", error);

    return NextResponse.json(
      {
        error: error?.message || "Team konnte nicht aktualisiert werden.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const { id } = await context.params;

    const existingTeam = await db.team.findUnique({
      where: { id },
      include: {
        operationDayTeams: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!existingTeam) {
      return NextResponse.json(
        { error: "Team nicht gefunden." },
        { status: 404 }
      );
    }

    if (existingTeam.operationDayTeams.length > 0) {
      return NextResponse.json(
        {
          error:
            "Team kann nicht gelöscht werden, weil es noch in Einsatztagen verwendet wird.",
        },
        { status: 400 }
      );
    }

    await db.team.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Fehler beim Löschen des Teams:", error);

    return NextResponse.json(
      {
        error: error?.message || "Team konnte nicht gelöscht werden.",
      },
      { status: 500 }
    );
  }
}