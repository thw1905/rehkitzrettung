import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

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

function toDateKeyUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function canBeUsedForSearcher(status: AvailabilityStatus) {
  return status === "ZUGESAGT" || status === "VIELLEICHT";
}

function canBeUsedForPilot(role: string, status: AvailabilityStatus) {
  return role === "PILOT" && canBeUsedForSearcher(status);
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

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date");

    if (!dateParam) {
      return NextResponse.json({ error: "Datum fehlt." }, { status: 400 });
    }

    const date = parseDateOnlyToUtc(dateParam);
    const operationDay = await getOrCreateOperationDay(date);

    const [teamSlots, operationDayTeams, users] = await Promise.all([
      db.team.findMany({
        where: {
          isActive: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      db.operationDayTeam.findMany({
        where: {
          operationDayId: operationDay.id,
        },
        include: {
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
          team: true,
        },
        orderBy: {
          team: {
            sortOrder: "asc",
          },
        },
      }),
      db.user.findMany({
        where: {
          isApproved: true,
        },
        include: {
          availabilities: {
            where: {
              date,
            },
            take: 1,
          },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
    ]);

    const availableUsers = users.map((user) => {
      const availability = user.availabilities[0];
      const availabilityStatus: AvailabilityStatus =
        (availability?.status as AvailabilityStatus | undefined) || "OFFEN";

      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isAdmin: user.isAdmin,
        availabilityStatus,
        availabilityNote: availability?.note || null,
      };
    });

    const pilots = availableUsers.filter((user) =>
      canBeUsedForPilot(user.role, user.availabilityStatus)
    );

    const searchers = availableUsers.filter((user) =>
      canBeUsedForSearcher(user.availabilityStatus)
    );

    const assignments = teamSlots.map((teamSlot) => {
      const existingAssignment = operationDayTeams.find(
        (item) => item.teamId === teamSlot.id
      );

      return {
        teamId: teamSlot.id,
        teamName: teamSlot.name,
        sortOrder: teamSlot.sortOrder,
        operationDayTeamId: existingAssignment?.id || null,
        pilot: existingAssignment?.pilot || null,
        searchers:
          existingAssignment?.members.map((member) => member.user) || [],
        note: existingAssignment?.note || "",
      };
    });

    return NextResponse.json({
      operationDay: {
        id: operationDay.id,
        date: toDateKeyUtc(operationDay.date),
        status: operationDay.status,
        note: operationDay.note || "",
      },
      pilots,
      searchers,
      assignments,
    });
  } catch (error: any) {
    console.error("Fehler beim Laden der Teamplanung:", error);

    return NextResponse.json(
      { error: error?.message || "Teamplanung konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
    }

    const body = (await req.json()) as {
      date?: string;
      teamId?: string;
      pilotId?: string | null;
      searcherIds?: string[];
      note?: string | null;
    };

    if (!body.date) {
      return NextResponse.json({ error: "Datum fehlt." }, { status: 400 });
    }

    if (!body.teamId) {
      return NextResponse.json({ error: "Team fehlt." }, { status: 400 });
    }

    const searcherIds = Array.isArray(body.searcherIds)
      ? [...new Set(body.searcherIds.filter((id): id is string => typeof id === "string" && !!id))]
      : [];

    if (!body.pilotId) {
      return NextResponse.json({ error: "Pilot fehlt." }, { status: 400 });
    }

    if (searcherIds.length < 1) {
      return NextResponse.json(
        { error: "Bitte mindestens einen Sucher auswählen." },
        { status: 400 }
      );
    }

    if (searcherIds.length > 6) {
      return NextResponse.json(
        { error: "Maximal 6 Sucher pro Team." },
        { status: 400 }
      );
    }

    if (searcherIds.includes(body.pilotId)) {
      return NextResponse.json(
        { error: "Pilot darf nicht gleichzeitig als Sucher eingetragen sein." },
        { status: 400 }
      );
    }

    const date = parseDateOnlyToUtc(body.date);
    const operationDay = await getOrCreateOperationDay(date);

    const teamSlot = await db.team.findUnique({
      where: { id: body.teamId },
    });

    if (!teamSlot) {
      return NextResponse.json({ error: "Team-Slot nicht gefunden." }, { status: 404 });
    }

    const allUserIds = [body.pilotId, ...searcherIds];

    const users = await db.user.findMany({
      where: {
        id: {
          in: allUserIds,
        },
        isApproved: true,
      },
      include: {
        availabilities: {
          where: {
            date,
          },
          take: 1,
        },
      },
    });

    const usersById = new Map(users.map((user) => [user.id, user]));

    const pilotUser = usersById.get(body.pilotId);
    if (!pilotUser) {
      return NextResponse.json({ error: "Pilot nicht gefunden." }, { status: 404 });
    }

    const pilotStatus =
      (pilotUser.availabilities[0]?.status as AvailabilityStatus | undefined) || "OFFEN";

    if (!canBeUsedForPilot(pilotUser.role, pilotStatus)) {
      return NextResponse.json(
        { error: "Der ausgewählte Pilot ist für diesen Tag nicht als Pilot verfügbar." },
        { status: 400 }
      );
    }

    for (const searcherId of searcherIds) {
      const searcherUser = usersById.get(searcherId);

      if (!searcherUser) {
        return NextResponse.json(
          { error: "Mindestens ein Sucher wurde nicht gefunden." },
          { status: 404 }
        );
      }

      const searcherStatus =
        (searcherUser.availabilities[0]?.status as AvailabilityStatus | undefined) ||
        "OFFEN";

      if (!canBeUsedForSearcher(searcherStatus)) {
        return NextResponse.json(
          { error: "Mindestens ein Sucher ist für diesen Tag nicht verfügbar." },
          { status: 400 }
        );
      }
    }

    const existingAssignments = await db.operationDayTeam.findMany({
      where: {
        operationDayId: operationDay.id,
      },
      include: {
        members: true,
      },
    });

    for (const assignment of existingAssignments) {
      if (assignment.teamId === body.teamId) continue;

      if (assignment.pilotId === body.pilotId) {
        return NextResponse.json(
          { error: "Dieser Pilot ist an diesem Tag bereits einem anderen Team zugeordnet." },
          { status: 400 }
        );
      }

      const memberIds = assignment.members.map((member) => member.userId);

      if (searcherIds.some((id) => memberIds.includes(id))) {
        return NextResponse.json(
          { error: "Mindestens ein Sucher ist an diesem Tag bereits einem anderen Team zugeordnet." },
          { status: 400 }
        );
      }

      if (memberIds.includes(body.pilotId)) {
        return NextResponse.json(
          { error: "Der Pilot ist an diesem Tag bereits als Sucher in einem anderen Team eingetragen." },
          { status: 400 }
        );
      }

      if (searcherIds.includes(assignment.pilotId || "")) {
        return NextResponse.json(
          { error: "Mindestens ein Sucher ist an diesem Tag bereits Pilot in einem anderen Team." },
          { status: 400 }
        );
      }
    }

    const existing = await db.operationDayTeam.findUnique({
      where: {
        operationDayId_teamId: {
          operationDayId: operationDay.id,
          teamId: body.teamId,
        },
      },
      include: {
        members: true,
      },
    });

    let saved;

    if (!existing) {
      saved = await db.operationDayTeam.create({
        data: {
          operationDayId: operationDay.id,
          teamId: body.teamId,
          pilotId: body.pilotId,
          note: body.note?.trim() || null,
          members: {
            create: searcherIds.map((userId) => ({
              userId,
            })),
          },
        },
        include: {
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
          team: true,
        },
      });
    } else {
      await db.operationDayTeamMember.deleteMany({
        where: {
          operationDayTeamId: existing.id,
        },
      });

      saved = await db.operationDayTeam.update({
        where: {
          id: existing.id,
        },
        data: {
          pilotId: body.pilotId,
          note: body.note?.trim() || null,
          members: {
            create: searcherIds.map((userId) => ({
              userId,
            })),
          },
        },
        include: {
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
          team: true,
        },
      });
    }

    return NextResponse.json(saved);
  } catch (error: any) {
    console.error("Fehler beim Speichern der Teamplanung:", error);

    return NextResponse.json(
      { error: error?.message || "Teamplanung konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}