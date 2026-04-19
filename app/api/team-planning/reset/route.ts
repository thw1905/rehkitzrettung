import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function parseDateOnlyToUtc(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    throw new Error("Ungültiges Datum.");
  }

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (!body.date) {
      return NextResponse.json({ error: "Datum fehlt." }, { status: 400 });
    }

    const date = parseDateOnlyToUtc(body.date);

    const operationDay = await db.operationDay.findUnique({
      where: { date },
      select: { id: true, date: true },
    });

    if (!operationDay) {
      return NextResponse.json({
        success: true,
        message: "Für diesen Tag existiert noch keine Planung.",
      });
    }

    await db.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: {
          operationDayId: operationDay.id,
        },
        data: {
          operationDayTeamId: null,
        },
      });

      await tx.operationDayTeamMember.deleteMany({
        where: {
          operationDayTeam: {
            operationDayId: operationDay.id,
          },
        },
      });

      await tx.operationDayTeam.deleteMany({
        where: {
          operationDayId: operationDay.id,
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Tagesplanung wurde vollständig gelöscht.",
    });
  } catch (error: any) {
    console.error("Fehler beim Löschen der Tagesplanung:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Tagesplanung konnte nicht gelöscht werden.",
      },
      { status: 500 }
    );
  }
}