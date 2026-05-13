import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { buildTeamsByDistance } from "@/lib/team-clustering";
import { assignOrdersToTeams } from "@/lib/order-assignment";

type AvailabilityStatus = "OFFEN" | "ZUGESAGT" | "ABGESAGT" | "VIELLEICHT";

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

async function getOrCreateOperationDay(date: Date) {
  const existing = await db.operationDay.findUnique({
    where: { date },
  });

  if (existing) {
    return existing;
  }

  try {
    return await db.operationDay.create({
      data: {
        date,
        status: "PLANUNG",
      },
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      const createdByParallelRequest = await db.operationDay.findUnique({
        where: { date },
      });

      if (createdByParallelRequest) {
        return createdByParallelRequest;
      }
    }

    throw error;
  }
}

function statusRank(status: AvailabilityStatus) {
  if (status === "ZUGESAGT") return 0;
  if (status === "VIELLEICHT") return 1;
  if (status === "OFFEN") return 2;
  return 3;
}

function canUseForPlanning(status: AvailabilityStatus) {
  return status === "ZUGESAGT" || status === "VIELLEICHT";
}

function compareUsers(
  a: {
    availabilityStatus: AvailabilityStatus;
    lastName: string;
    firstName: string;
  },
  b: {
    availabilityStatus: AvailabilityStatus;
    lastName: string;
    firstName: string;
  }
) {
  const rankDiff =
    statusRank(a.availabilityStatus) - statusRank(b.availabilityStatus);

  if (rankDiff !== 0) return rankDiff;

  return `${a.lastName} ${a.firstName}`.localeCompare(
    `${b.lastName} ${b.firstName}`,
    "de"
  );
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

    const body = (await req.json()) as {
      date?: string;
      maxSearchersPerTeam?: number;
      includeVielleicht?: boolean;
      overwriteExisting?: boolean;
      assignOrders?: boolean;
    };

    if (!body.date) {
      return NextResponse.json({ error: "Datum fehlt." }, { status: 400 });
    }

    const date = parseDateOnlyToUtc(body.date);
    const operationDay = await getOrCreateOperationDay(date);

    const maxSearchersPerTeam =
      typeof body.maxSearchersPerTeam === "number" &&
      body.maxSearchersPerTeam >= 1 &&
      body.maxSearchersPerTeam <= 6
        ? Math.floor(body.maxSearchersPerTeam)
        : 6;

    const includeVielleicht = body.includeVielleicht !== false;
    const overwriteExisting = body.overwriteExisting !== false;
    const assignOrders = body.assignOrders !== false;

    const [teamSlots, users, openOrders] = await Promise.all([
      db.team.findMany({
        where: {
          isActive: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),

      db.user.findMany({
        where: {
          isApproved: true,
        },
        include: {
          availabilities: {
            where: { date },
            take: 1,
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),

      db.order.findMany({
        where: {
          operationDayId: operationDay.id,
          status: {
            not: "ERLEDIGT",
          },
        },
        include: {
          field: {
            select: {
              locationLatitude: true,
              locationLongitude: true,
            },
          },
        },
        orderBy: [
          { sortOrder: "asc" },
          { mowingDate: "asc" },
          { createdAt: "asc" },
        ],
      }),
    ]);

    if (teamSlots.length === 0) {
      return NextResponse.json(
        { error: "Es sind keine aktiven Team-Slots vorhanden." },
        { status: 400 }
      );
    }

    const eligibleUsers = users
      .map((user) => {
        const availabilityStatus =
          (user.availabilities[0]?.status as AvailabilityStatus | undefined) ||
          "OFFEN";

        return {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          isAdmin: user.isAdmin,
          availabilityStatus,
          availabilityNote: user.availabilities[0]?.note || null,
          homeLatitude: user.homeLatitude,
          homeLongitude: user.homeLongitude,
          autoAssignPriority: user.autoAssignPriority ?? 0,
          isPrimaryPilot: user.isPrimaryPilot ?? false,
        };
      })
      .filter((user) => {
        if (!canUseForPlanning(user.availabilityStatus)) return false;

        if (!includeVielleicht && user.availabilityStatus !== "ZUGESAGT") {
          return false;
        }

        return true;
      })
      .sort(compareUsers);

    const builtTeamsRaw = buildTeamsByDistance(
      eligibleUsers,
      maxSearchersPerTeam
    );

    const builtTeams = builtTeamsRaw
      .slice(0, teamSlots.length)
      .map((team, index) => ({
        teamId: teamSlots[index].id,
        teamName: teamSlots[index].name,
        pilotId: team.pilotId,
        searcherIds: team.members,
      }))
      .filter((team) => team.pilotId || team.searcherIds.length > 0);

    const orderAssignments = assignOrders
      ? assignOrdersToTeams(builtTeams, eligibleUsers, openOrders)
      : [];

    await db.$transaction(async (tx) => {
      if (overwriteExisting) {
        await tx.order.updateMany({
          where: {
            operationDayId: operationDay.id,
          },
          data: {
            operationDayTeamId: null,
            sortOrder: 0,
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
      }

      const createdTeams: Array<{
        id: string;
        teamId: string;
      }> = [];

      for (const team of builtTeams) {
        const created = await tx.operationDayTeam.create({
          data: {
            operationDayId: operationDay.id,
            teamId: team.teamId,
            pilotId: team.pilotId,
            members: {
              create: team.searcherIds.map((userId) => ({
                userId,
              })),
            },
          },
        });

        createdTeams.push({
          id: created.id,
          teamId: created.teamId,
        });
      }

      if (assignOrders && orderAssignments.length > 0) {
        const orderIndexByTeamId = new Map<string, number>();

        for (const assignment of orderAssignments) {
          const targetOperationDayTeam = createdTeams.find(
            (team) => team.teamId === assignment.teamId
          );

          if (!targetOperationDayTeam) continue;

          const currentIndex = orderIndexByTeamId.get(assignment.teamId) || 0;
          const nextSortOrder = currentIndex + 1;

          orderIndexByTeamId.set(assignment.teamId, nextSortOrder);

          await tx.order.update({
            where: {
              id: assignment.orderId,
            },
            data: {
              operationDayTeamId: targetOperationDayTeam.id,
              sortOrder: nextSortOrder,
            },
          });
        }
      }
    });

    const savedAssignments = await db.operationDayTeam.findMany({
      where: {
        operationDayId: operationDay.id,
      },
      include: {
        team: true,
        pilot: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            isAdmin: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                isAdmin: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        orders: {
          include: {
            owner: true,
            field: {
              select: {
                id: true,
                name: true,
                displayName: true,
                locationLatitude: true,
                locationLongitude: true,
              },
            },
            reviere: {
              include: {
                revier: {
                  include: {
                    paechter: {
                      include: {
                        pachter: true,
                      },
                      orderBy: {
                        createdAt: "asc",
                      },
                    },
                  },
                },
              },
              orderBy: {
                overlapSqm: "desc",
              },
            },
          },
          orderBy: [
            { sortOrder: "asc" },
            { mowingDate: "asc" },
            { createdAt: "asc" },
          ],
        },
      },
      orderBy: {
        team: {
          sortOrder: "asc",
        },
      },
    });

    const assignedUserIds = new Set<string>();

    for (const team of builtTeams) {
      if (team.pilotId) {
        assignedUserIds.add(team.pilotId);
      }

      for (const userId of team.searcherIds) {
        assignedUserIds.add(userId);
      }
    }

    const unassignedUsers = eligibleUsers.filter(
      (user) => !assignedUserIds.has(user.id)
    );

    return NextResponse.json({
      success: true,
      operationDayId: operationDay.id,
      createdCount: savedAssignments.length,
      assignments: savedAssignments,
      orderAssignments,
      summary: {
        totalEligibleUsers: eligibleUsers.length,
        totalAssignedUsers: assignedUserIds.size,
        totalUnassignedUsers: unassignedUsers.length,
        totalTeamsUsed: builtTeams.length,
        totalOrdersConsidered: openOrders.length,
        totalAssignedOrders: orderAssignments.length,
      },
      unassignedUsers,
      warnings: [
        ...(builtTeams.length === 0
          ? ["Es konnten keine Teams gebildet werden."]
          : []),
        ...(eligibleUsers.filter((u) => u.role === "PILOT").length === 0
          ? ["Es wurde kein verfügbarer Pilot gefunden."]
          : []),
      ],
    });
  } catch (error: any) {
    console.error("Fehler bei der automatischen Teamverteilung:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Automatische Teamverteilung konnte nicht durchgeführt werden.",
      },
      { status: 500 }
    );
  }
}