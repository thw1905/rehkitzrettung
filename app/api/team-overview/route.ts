import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export async function GET() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const operationDay = await db.operationDay.findFirst({
      where: {
        date: {
          gte: today,
          lt: tomorrow,
        },
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

if (!ownTeam) {
  return NextResponse.json({
    operationDay: operationDayResponse,
    ownTeamId: null,
    teams: [],
  });
}

return NextResponse.json({
  operationDay: operationDayResponse,
  ownTeamId: ownTeam.id,
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