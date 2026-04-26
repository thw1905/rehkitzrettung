import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function getCurrentUserWithTeams() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email || !(session.user as any)?.id) {
    return null;
  }

  const user = await db.user.findUnique({
    where: {
      id: (session.user as any).id,
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

  if (
    typeof (session.user as any).sessionVersion === "number" &&
    user.sessionVersion !== (session.user as any).sessionVersion
  ) {
    return null;
  }

  void db.user
    .update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {});

  return {
    ...user,
    teamMemberships: [],
    pilotTeams: [],
    copilotTeams: [],
  };
}