export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { db } from "@/lib/db";

type AvailabilityStatus = "OFFEN" | "ZUGESAGT" | "ABGESAGT" | "VIELLEICHT";

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getEndOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function parseDateOrFallback(value: string | null, fallback: Date) {
  if (!value) return fallback;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed;
}

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function buildDateKeys(from: Date, toExclusive: Date) {
  const result: string[] = [];
  const current = getStartOfDay(from);

  while (current < toExclusive) {
    result.push(toDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function getPersonName(user?: {
  firstName?: string | null;
  lastName?: string | null;
} | null) {
  if (!user) return "-";

  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();

  return name || "-";
}

function getFieldLabel(field?: {
  displayName?: string | null;
  name?: string | null;
} | null) {
  if (!field) return "";

  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} · ${name}`;
  if (displayName) return displayName;
  if (name) return name;

  return "";
}

function toIso(value?: Date | string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

export async function GET(req: NextRequest) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const searchParams = req.nextUrl.searchParams;

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const today = new Date();

    const from = getStartOfDay(parseDateOrFallback(fromParam, today));
    const toExclusive = getEndOfDay(parseDateOrFallback(toParam, today));

    if (from >= toExclusive) {
      return NextResponse.json(
        { error: "Der Zeitraum ist ungültig." },
        { status: 400 }
      );
    }

    const dateKeys = buildDateKeys(from, toExclusive);

    const [users, availabilities, operationDayTeams] = await Promise.all([
      db.user.findMany({
        where: {
          isApproved: true,
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          isAdmin: true,
        },
      }),

      db.availability.findMany({
        where: {
          date: {
            gte: from,
            lt: toExclusive,
          },
        },
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
        orderBy: [{ date: "asc" }, { user: { lastName: "asc" } }],
      }),

      db.operationDayTeam.findMany({
        where: {
          operationDay: {
            date: {
              gte: from,
              lt: toExclusive,
            },
          },
        },
        orderBy: [
          {
            operationDay: {
              date: "asc",
            },
          },
          {
            team: {
              sortOrder: "asc",
            },
          },
          {
            team: {
              name: "asc",
            },
          },
        ],
        include: {
          operationDay: {
            select: {
              id: true,
              date: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              sortOrder: true,
            },
          },
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
            select: {
              id: true,
              orderCode: true,
              title: true,
              status: true,
              mowingDate: true,
              executionDate: true,
              sortOrder: true,
              field: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                },
              },
            },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      }),
    ]);

    const availabilityMap = new Map<string, (typeof availabilities)[number]>();

    for (const item of availabilities) {
      availabilityMap.set(`${item.userId}|${toDateKey(item.date)}`, item);
    }

    const availabilityRows = dateKeys.flatMap((date) =>
      users.map((user) => {
        const entry = availabilityMap.get(`${user.id}|${date}`);
        const status = (entry?.status || "OFFEN") as AvailabilityStatus;

        return {
          id: `${date}-${user.id}`,
          date,
          userId: user.id,
          helperName: getPersonName(user),
          helperRole: user.role,
          isAdmin: user.isAdmin,
          status,
          note: entry?.note || null,
          hasEntry: Boolean(entry),
          updatedAt: toIso(entry?.updatedAt),
          createdAt: toIso(entry?.createdAt),
        };
      })
    );

    const assignmentRows: any[] = [];

    for (const dayTeam of operationDayTeams) {
      const date = toDateKey(dayTeam.operationDay.date);

      const orders = dayTeam.orders.map((order) => ({
        id: order.id,
        orderCode: order.orderCode,
        title: order.title,
        status: order.status,
        mowingDate: toIso(order.mowingDate),
        executionDate: toIso(order.executionDate),
        fieldLabel: getFieldLabel(order.field),
        label: [order.orderCode || order.title, getFieldLabel(order.field)]
          .filter(Boolean)
          .join(" ·"),
      }));

      if (dayTeam.pilot) {
        assignmentRows.push({
          id: `${dayTeam.id}-pilot-${dayTeam.pilot.id}`,
          date,
          operationDayTeamId: dayTeam.id,
          teamId: dayTeam.team.id,
          teamName: dayTeam.team.name,
          userId: dayTeam.pilot.id,
          helperName: getPersonName(dayTeam.pilot),
          helperRole: dayTeam.pilot.role,
          roleInTeam: "PILOT",
          assignedAt: toIso(dayTeam.updatedAt || dayTeam.createdAt),
          assignmentCreatedAt: toIso(dayTeam.createdAt),
          assignmentUpdatedAt: toIso(dayTeam.updatedAt),
          orders,
        });
      }

      for (const member of dayTeam.members) {
        assignmentRows.push({
          id: `${dayTeam.id}-searcher-${member.userId}`,
          date,
          operationDayTeamId: dayTeam.id,
          teamId: dayTeam.team.id,
          teamName: dayTeam.team.name,
          userId: member.userId,
          helperName: getPersonName(member.user),
          helperRole: member.user.role,
          roleInTeam: "SUCHER",
          assignedAt: toIso(member.createdAt),
          assignmentCreatedAt: toIso(member.createdAt),
          assignmentUpdatedAt: null,
          orders,
        });
      }
    }

    const availabilityCounts: Record<AvailabilityStatus, number> = {
      OFFEN: 0,
      ZUGESAGT: 0,
      ABGESAGT: 0,
      VIELLEICHT: 0,
    };

    for (const row of availabilityRows) {
      availabilityCounts[row.status] += 1;
    }

    const assignedUserIds = new Set(assignmentRows.map((row) => row.userId));
    const assignedTeamIds = new Set(assignmentRows.map((row) => row.teamId));

    return NextResponse.json({
      range: {
        from: toDateKey(from),
        to: toDateKey(new Date(toExclusive.getTime() - 1)),
      },
      users: users.map((user) => ({
        id: user.id,
        name: getPersonName(user),
        role: user.role,
        isAdmin: user.isAdmin,
      })),
      summary: {
        helpers: users.length,
        availabilityRows: availabilityRows.length,
        availabilityCounts,
        assignmentRows: assignmentRows.length,
        assignedHelpers: assignedUserIds.size,
        assignedTeams: assignedTeamIds.size,
      },
      availabilityRows,
      assignmentRows,
    });
  } catch (error: any) {
    console.error("Helfer-Statistik Fehler:", error);

    return NextResponse.json(
      {
        error: error?.message || "Helfer-Statistik konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}