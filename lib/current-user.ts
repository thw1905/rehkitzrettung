import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function getCurrentUserWithTeams() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return null;
  }

  const user = await db.user.findUnique({
    where: {
      email: session.user.email,
    },
    include: {
      availabilities: true,
      operationDayTeamPilots: {
        include: {
          team: true,
          operationDay: true,
          members: {
            include: {
              user: true,
            },
          },
        },
      },
      operationDayTeamMembers: {
        include: {
          operationDayTeam: {
            include: {
              team: true,
              operationDay: true,
              pilot: true,
              members: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  return {
    ...user,

    // Übergangskompatibilität für alten Code
    teamMemberships: [],
    pilotTeams: [],
    copilotTeams: [],
  };
}