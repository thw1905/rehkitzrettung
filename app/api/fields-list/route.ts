import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export async function GET() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  try {
    if (currentUser.isAdmin) {
      const fields = await db.field.findMany({
        orderBy: [
          { displayName: "asc" },
          { name: "asc" },
        ],
      });

      return NextResponse.json(fields);
    }

    const teamIds = new Set<string>();

    for (const membership of (currentUser.teamMemberships ?? []) as Array<{
      teamId: string;
    }>) {
      if (membership.teamId) {
        teamIds.add(membership.teamId);
      }
    }

    for (const team of (currentUser.pilotTeams ?? []) as Array<{ id: string }>) {
      if (team.id) {
        teamIds.add(team.id);
      }
    }

    for (const team of (currentUser.copilotTeams ?? []) as Array<{ id: string }>) {
      if (team.id) {
        teamIds.add(team.id);
      }
    }

    if (teamIds.size === 0) {
      return NextResponse.json([]);
    }

    const fields = await db.field.findMany({
      where: {
        orders: {
          some: {
            operationDayTeam:{
              is:{
            teamId: {
              in: Array.from(teamIds),
            },
          },
            },
          },
        },
      },
      orderBy: [
        { displayName: "asc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(fields);
  } catch (error: any) {
    console.error("Fehler beim Laden der Felder:", error);

    return NextResponse.json(
      { error: error?.message || "Felder konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}