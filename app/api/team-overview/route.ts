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

function getTodayDateUtc() {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    )
  );
}

export async function GET(req: NextRequest) {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");

    const selectedDate = dateParam
      ? parseDateOnlyToUtc(dateParam)
      : getTodayDateUtc();

    const operationDay = await db.operationDay.findUnique({
      where: {
        date: selectedDate,
      },
      include: {
        teams: {
          include: {
            team: true,
            pilot: true,
            members: {
              include: {
                user: true,
              },
              orderBy: {
                createdAt: "asc",
              },
            },
          },
          orderBy: {
            team: {
              sortOrder: "asc",
            },
          },
        },
      },
    });

    if (!operationDay) {
      return NextResponse.json({
        operationDay: null,
        ownTeamId: null,
        teams: [],
      });
    }

    const ownTeam = operationDay.teams.find((team) => {
      if (team.pilotId === currentUser.id) return true;

      return team.members.some((member) => member.userId === currentUser.id);
    });

    const operationDayResponse = {
      id: operationDay.id,
      date: operationDay.date,
      status: operationDay.status,
    };

    return NextResponse.json({
      operationDay: operationDayResponse,
      ownTeamId: ownTeam?.id || null,
      teams: operationDay.teams.map((operationDayTeam) => ({
        id: operationDayTeam.id,
        teamName: operationDayTeam.team.name,
        pilot: operationDayTeam.pilot
          ? {
              id: operationDayTeam.pilot.id,
              firstName: operationDayTeam.pilot.firstName,
              lastName: operationDayTeam.pilot.lastName,
              phone: operationDayTeam.pilot.phone,
              email: operationDayTeam.pilot.email,
              role: operationDayTeam.pilot.role,
            }
          : null,
        members: operationDayTeam.members.map((member) => ({
          id: member.user.id,
          firstName: member.user.firstName,
          lastName: member.user.lastName,
          phone: member.user.phone,
          email: member.user.email,
          role: member.user.role,
        })),
      })),
    });
  } catch (error: any) {
    console.error("Fehler bei Teamübersicht:", error);

    return NextResponse.json(
      { error: error?.message || "Teamübersicht konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}