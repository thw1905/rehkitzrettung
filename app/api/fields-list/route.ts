import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export async function GET() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json(
      { error: "Nicht angemeldet" },
      { status: 401 }
    );
  }

  if (currentUser.isAdmin) {
    const fields = await db.field.findMany({
      select: {
        id: true,
        name: true,
        ownerId: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(fields);
  }

  const teamIds = new Set<string>();

  for (const membership of currentUser.teamMemberships) {
    teamIds.add(membership.teamId);
  }

  for (const team of currentUser.pilotTeams) {
    teamIds.add(team.id);
  }

  for (const team of currentUser.copilotTeams) {
    teamIds.add(team.id);
  }

  const fields = await db.field.findMany({
    where: {
      orders: {
        some: {
          teamId: {
            in: Array.from(teamIds),
          },
        },
      },
    },
    select: {
  id: true,
  name: true,
  displayName: true,
  ownerId: true,
},
    orderBy: {
      name: "asc",
    },
  });

  return NextResponse.json(fields);
}