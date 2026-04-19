import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";
import { haversineDistanceKm } from "@/lib/geo";

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

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDistance(distanceKm: number | null) {
  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return null;
  }

  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(distanceKm);
}

function fullName(user: {
  firstName: string;
  lastName: string;
}) {
  return `${user.firstName} ${user.lastName}`.trim();
}

function getFieldLabel(field: {
  name: string;
  displayName?: string | null;
}) {
  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} (${name})`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status }
    );
  }

  try {
    const dateParam = req.nextUrl.searchParams.get("date") || getTodayDateString();
    const date = parseDateOnlyToUtc(dateParam);

    const operationDay = await db.operationDay.findUnique({
      where: { date },
      select: { id: true, date: true },
    });

    if (!operationDay) {
      return NextResponse.json({
        date: dateParam,
        pilotAssignments: [],
        helperAssignments: [],
        orderAssignments: [],
      });
    }

    const [dayTeams, approvedUsers] = await Promise.all([
      db.operationDayTeam.findMany({
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
              homeLatitude: true,
              homeLongitude: true,
              autoAssignPriority: true,
              isPrimaryPilot: true,
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
                  homeLatitude: true,
                  homeLongitude: true,
                  autoAssignPriority: true,
                  isPrimaryPilot: true,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          orders: {
            include: {
              field: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  locationLatitude: true,
                  locationLongitude: true,
                },
              },
            },
            orderBy: [
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
      }),
      db.user.findMany({
        where: {
          isApproved: true,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          homeLatitude: true,
          homeLongitude: true,
          autoAssignPriority: true,
          isPrimaryPilot: true,
        },
      }),
    ]);

    const pilotAssignments = dayTeams
      .filter((dayTeam) => !!dayTeam.pilot)
      .map((dayTeam) => {
        const pilot = dayTeam.pilot!;
        const pilotPoint =
          pilot.homeLatitude != null && pilot.homeLongitude != null
            ? { lat: pilot.homeLatitude, lng: pilot.homeLongitude }
            : null;

        let reason = `${fullName(pilot)} → ${dayTeam.team.name}`;

        if (pilot.isPrimaryPilot) {
          reason += " (Hauptpilot";
          if ((pilot.autoAssignPriority ?? 0) > 0) {
            reason += `, Priorität ${pilot.autoAssignPriority}`;
          }
          reason += ")";
        } else if ((pilot.autoAssignPriority ?? 0) > 0) {
          reason += ` (Priorität ${pilot.autoAssignPriority})`;
        }

        return {
          teamId: dayTeam.teamId,
          teamName: dayTeam.team.name,
          pilotId: pilot.id,
          pilotName: fullName(pilot),
          distanceKm: pilotPoint ? 0 : null,
          reason,
        };
      });

    const helperAssignments = dayTeams.flatMap((dayTeam) =>
      dayTeam.members.map((member) => {
        const helper = member.user;
        const pilot = dayTeam.pilot;

        let distanceKm: number | null = null;

        if (
          pilot?.homeLatitude != null &&
          pilot?.homeLongitude != null &&
          helper.homeLatitude != null &&
          helper.homeLongitude != null
        ) {
          distanceKm = haversineDistanceKm(
            {
              lat: pilot.homeLatitude,
              lng: pilot.homeLongitude,
            },
            {
              lat: helper.homeLatitude,
              lng: helper.homeLongitude,
            }
          );
        }

        let reason = `${fullName(helper)} → ${dayTeam.team.name}`;

        if ((helper.autoAssignPriority ?? 0) > 0) {
          reason += ` (Priorität ${helper.autoAssignPriority}`;
          if (distanceKm != null) {
            reason += `, ${formatDistance(distanceKm)} km zum Pilot`;
          }
          reason += ")";
        } else if (distanceKm != null) {
          reason += ` (${formatDistance(distanceKm)} km zum Pilot)`;
        }

        return {
          teamId: dayTeam.teamId,
          teamName: dayTeam.team.name,
          helperId: helper.id,
          helperName: fullName(helper),
          priority: helper.autoAssignPriority ?? 0,
          distanceKm,
          reason,
        };
      })
    );

    const orderAssignments = dayTeams.flatMap((dayTeam) =>
      dayTeam.orders.map((order) => {
        let distanceKm: number | null = null;

        if (
          dayTeam.pilot?.homeLatitude != null &&
          dayTeam.pilot?.homeLongitude != null &&
          order.field?.locationLatitude != null &&
          order.field?.locationLongitude != null
        ) {
          distanceKm = haversineDistanceKm(
            {
              lat: dayTeam.pilot.homeLatitude,
              lng: dayTeam.pilot.homeLongitude,
            },
            {
              lat: order.field.locationLatitude,
              lng: order.field.locationLongitude,
            }
          );
        }

        const reason =
          distanceKm != null
            ? `${order.orderCode || order.title} → ${dayTeam.team.name} (${formatDistance(distanceKm)} km zum Pilot)`
            : `${order.orderCode || order.title} → ${dayTeam.team.name}`;

        return {
          orderId: order.id,
          orderCode: order.orderCode || order.title,
          teamId: dayTeam.teamId,
          teamName: dayTeam.team.name,
          fieldLabel: getFieldLabel(order.field),
          distanceKm,
          reason,
        };
      })
    );

    return NextResponse.json({
      date: dateParam,
      pilotAssignments,
      helperAssignments,
      orderAssignments,
    });
  } catch (error: any) {
    console.error("Fehler bei Zuweisungsgründen:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Zuweisungsgründe konnten nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}