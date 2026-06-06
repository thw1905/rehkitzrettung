import { NextRequest, NextResponse } from "next/server";
import { area as turfArea } from "@turf/turf";
import { requireAdminApi } from "@/lib/admin";
import { db } from "@/lib/db";

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getEndOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function diffMinutes(startTime: Date | null, endTime: Date | null) {
  if (!startTime || !endTime) return 0;

  return Math.max(
    0,
    Math.floor((endTime.getTime() - startTime.getTime()) / 60000)
  );
}

function safeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeAreaSqm(feature: any) {
  try {
    return turfArea(feature);
  } catch {
    return 0;
  }
}

function getPersonName(user?: {
  firstName?: string | null;
  lastName?: string | null;
} | null) {
  if (!user) return null;

  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();

  return name || null;
}

function getOwnerName(owner?: {
  firstName?: string | null;
  lastName?: string | null;
} | null) {
  return getPersonName(owner) || "-";
}

function getFieldLabel(field?: {
  displayName?: string | null;
  name?: string | null;
} | null) {
  if (!field) return "-";

  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} · ${name}`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

/**
 * Wichtig:
 * Die Wildzahlen kommen aus zwei Stellen:
 *
 * 1. Direktfunde am Auftrag:
 *    order.rehkitzeGesichert, order.rehkitzeAbgesprungen usw.
 *
 * 2. Funde an PinPoints:
 *    order.pinpoints[].rehkitzeGesichert usw.
 *
 * Für die Statistik müssen beide zusammengezählt werden.
 */
function getWildCounts(order: any) {
  const pinpoints = Array.isArray(order.pinpoints) ? order.pinpoints : [];

  const pinpointCounts = {
    rehkitzeGesichert: pinpoints.reduce(
      (sum: number, p: any) => sum + safeNumber(p.rehkitzeGesichert),
      0
    ),
    rehkitzeAbgesprungen: pinpoints.reduce(
      (sum: number, p: any) => sum + safeNumber(p.rehkitzeAbgesprungen),
      0
    ),
    sonstigesWildGesichert: pinpoints.reduce(
      (sum: number, p: any) => sum + safeNumber(p.sonstigesWildGesichert),
      0
    ),
    sonstigesWildAbgesprungen: pinpoints.reduce(
      (sum: number, p: any) => sum + safeNumber(p.sonstigesWildAbgesprungen),
      0
    ),
    maulwurfhuegelFehlstelle: pinpoints.reduce(
      (sum: number, p: any) => sum + safeNumber(p.maulwurfhuegelFehlstelle),
      0
    ),
  };

  return {
    rehkitzeGesichert:
      safeNumber(order.rehkitzeGesichert) + pinpointCounts.rehkitzeGesichert,

    rehkitzeAbgesprungen:
      safeNumber(order.rehkitzeAbgesprungen) +
      pinpointCounts.rehkitzeAbgesprungen,

    sonstigesWildGesichert:
      safeNumber(order.sonstigesWildGesichert) +
      pinpointCounts.sonstigesWildGesichert,

    sonstigesWildAbgesprungen:
      safeNumber(order.sonstigesWildAbgesprungen) +
      pinpointCounts.sonstigesWildAbgesprungen,

    maulwurfhuegelFehlstelle:
      safeNumber(order.maulwurfhuegelFehlstelle) +
      pinpointCounts.maulwurfhuegelFehlstelle,
  };
}

function getWildTotal(counts: {
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
}) {
  return (
    counts.rehkitzeGesichert +
    counts.rehkitzeAbgesprungen +
    counts.sonstigesWildGesichert +
    counts.sonstigesWildAbgesprungen
  );
}

function hasAnyWild(counts: ReturnType<typeof getWildCounts>) {
  return (
    getWildTotal(counts) + safeNumber(counts.maulwurfhuegelFehlstelle) > 0
  );
}

function getRevierName(revier?: {
  name?: string | null;
  nummer?: string | null;
} | null) {
  if (!revier) return "Ohne Revier";

  const name = (revier.name || "").trim();
  const nummer = (revier.nummer || "").trim();

  if (name && nummer) return `${name} (${nummer})`;
  if (name) return name;
  if (nummer) return nummer;

  return "Unbenanntes Revier";
}

/**
 * Ein Auftrag kann mehrere Reviere überschneiden.
 * Damit Wildzahlen nicht mehrfach gezählt werden, ordnen wir die Wildzahlen
 * nur dem Hauptrevier zu.
 *
 * Hauptrevier = Revier mit größter overlapSqm.
 */
function getMainRevierAssignment(order: any) {
  const reviere = Array.isArray(order.reviere) ? order.reviere : [];

  if (reviere.length === 0) return null;

  return [...reviere].sort((a, b) => {
    const areaA = safeNumber(a.overlapSqm);
    const areaB = safeNumber(b.overlapSqm);

    return areaB - areaA;
  })[0];
}

function getOrderAreaSqm(order: any) {
  const executedAreaSqm = safeNumber(order.executedAreaSqm);

  if (executedAreaSqm > 0) return executedAreaSqm;

  return safeAreaSqm(order.field?.areaGeoJson);
}

function getOrCreateTeamEntry(
  teamMap: Map<
    string,
    {
      teamName: string;
      pilotName: string | null;
      searchersText: string | null;
      orderCount: number;
      totalAreaSqm: number;
      totalMinutes: number;
      teamDeploymentMinutes: number;
      rehkitzeGesichert: number;
      rehkitzeAbgesprungen: number;
      sonstigesWildGesichert: number;
      sonstigesWildAbgesprungen: number;
      maulwurfhuegelFehlstelle: number;
    }
  >,
  params: {
    teamName: string;
    pilotName?: string | null;
    searchersText?: string | null;
  }
) {
  const existing = teamMap.get(params.teamName);

  if (existing) {
    if (!existing.pilotName && params.pilotName) {
      existing.pilotName = params.pilotName;
    }

    if (!existing.searchersText && params.searchersText) {
      existing.searchersText = params.searchersText;
    }

    return existing;
  }

  const created = {
    teamName: params.teamName,
    pilotName: params.pilotName || null,
    searchersText: params.searchersText || null,
    orderCount: 0,
    totalAreaSqm: 0,
    totalMinutes: 0,
    teamDeploymentMinutes: 0,
    rehkitzeGesichert: 0,
    rehkitzeAbgesprungen: 0,
    sonstigesWildGesichert: 0,
    sonstigesWildAbgesprungen: 0,
    maulwurfhuegelFehlstelle: 0,
  };

  teamMap.set(params.teamName, created);

  return created;
}

function getOrCreateDayEntry(
  dayMap: Map<
    string,
    {
      date: string;
      orderCount: number;
      totalAreaSqm: number;
      totalMinutes: number;
      teamDeploymentMinutes: number;
      rehkitzeGesichert: number;
      rehkitzeAbgesprungen: number;
      sonstigesWildGesichert: number;
      sonstigesWildAbgesprungen: number;
      maulwurfhuegelFehlstelle: number;
    }
  >,
  dateKey: string
) {
  const existing = dayMap.get(dateKey);

  if (existing) return existing;

  const created = {
    date: dateKey,
    orderCount: 0,
    totalAreaSqm: 0,
    totalMinutes: 0,
    teamDeploymentMinutes: 0,
    rehkitzeGesichert: 0,
    rehkitzeAbgesprungen: 0,
    sonstigesWildGesichert: 0,
    sonstigesWildAbgesprungen: 0,
    maulwurfhuegelFehlstelle: 0,
  };

  dayMap.set(dateKey, created);

  return created;
}

function toOptionLabelUser(user: { firstName: string; lastName: string }) {
  return `${user.firstName} ${user.lastName}`.trim();
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
    const ownerId = searchParams.get("ownerId") || "";
    const revierId = searchParams.get("revierId") || "";
    const teamId = searchParams.get("teamId") || "";
    const pilotId = searchParams.get("pilotId") || "";
    const fundFilter = searchParams.get("fundFilter") || "ALLE";

    const today = new Date();
    const defaultFrom = getStartOfDay(today);
    const defaultToExclusive = getEndOfDay(today);

    const from = fromParam ? getStartOfDay(new Date(fromParam)) : defaultFrom;
    const toExclusive = toParam
      ? getEndOfDay(new Date(toParam))
      : defaultToExclusive;

    const orderWhere: any = {
      status: "ERLEDIGT",
      executionDate: {
        gte: from,
        lt: toExclusive,
      },
    };

    if (ownerId) {
      orderWhere.ownerId = ownerId;
    }

    if (revierId) {
      orderWhere.reviere = {
        some: {
          revierId,
        },
      };
    }

    if (teamId || pilotId) {
      orderWhere.operationDayTeam = {
        is: {
          ...(teamId ? { teamId } : {}),
          ...(pilotId ? { pilotId } : {}),
        },
      };
    }

    const operationDayTeamWhere: any = {
      operationDay: {
        date: {
          gte: from,
          lt: toExclusive,
        },
      },
      actualStartTime: {
        not: null,
      },
    };

    if (teamId) {
      operationDayTeamWhere.teamId = teamId;
    }

    if (pilotId) {
      operationDayTeamWhere.pilotId = pilotId;
    }

    const [ordersRaw, operationDayTeams, owners, reviereOptions, teamsOptions, pilotsOptions] =
      await Promise.all([
        db.order.findMany({
          where: orderWhere,
          orderBy: {
            executionDate: "asc",
          },
          select: {
            id: true,
            orderCode: true,
            title: true,
            executionDate: true,
            executedTeamName: true,
            executedPilotName: true,
            executedSearchersText: true,
            executedAreaSqm: true,
            startTime: true,
            endTime: true,
            ownerId: true,

            rehkitzeGesichert: true,
            rehkitzeAbgesprungen: true,
            sonstigesWildGesichert: true,
            sonstigesWildAbgesprungen: true,
            maulwurfhuegelFehlstelle: true,

            owner: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },

            field: {
              select: {
                id: true,
                name: true,
                displayName: true,
                areaGeoJson: true,
              },
            },

            operationDayTeam: {
              select: {
                id: true,
                teamId: true,
                pilotId: true,
                team: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                pilot: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },

            pinpoints: {
              select: {
                rehkitzeGesichert: true,
                rehkitzeAbgesprungen: true,
                sonstigesWildGesichert: true,
                sonstigesWildAbgesprungen: true,
                maulwurfhuegelFehlstelle: true,
              },
            },

            reviere: {
              select: {
                overlapSqm: true,
                overlapPercent: true,
                revier: {
                  select: {
                    id: true,
                    name: true,
                    nummer: true,
                  },
                },
              },
            },
          },
        }),

        db.operationDayTeam.findMany({
          where: operationDayTeamWhere,
          orderBy: [
            {
              operationDay: {
                date: "asc",
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
                date: true,
              },
            },
            team: {
              select: {
                name: true,
              },
            },
            pilot: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            members: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        }),

        db.owner.findMany({
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        }),

        db.revier.findMany({
          orderBy: [{ nummer: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            nummer: true,
          },
        }),

        db.team.findMany({
          where: {
            isActive: true,
          },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
          },
        }),

        db.user.findMany({
          where: {
            role: "PILOT",
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        }),
      ]);

    const orders = ordersRaw.filter((order) => {
      if (fundFilter === "ALLE") return true;

      const counts = getWildCounts(order);
      const foundSomething = hasAnyWild(counts);

      if (fundFilter === "MIT_FUND") return foundSomething;
      if (fundFilter === "OHNE_FUND") return !foundSomething;

      return true;
    });

    const totals = {
      totalOrders: 0,
      totalAreaSqm: 0,
      totalMinutes: 0,
      teamDeploymentMinutes: 0,
      rehkitzeGesichert: 0,
      rehkitzeAbgesprungen: 0,
      sonstigesWildGesichert: 0,
      sonstigesWildAbgesprungen: 0,
      maulwurfhuegelFehlstelle: 0,
    };

    const teamMap = new Map<
      string,
      {
        teamName: string;
        pilotName: string | null;
        searchersText: string | null;
        orderCount: number;
        totalAreaSqm: number;
        totalMinutes: number;
        teamDeploymentMinutes: number;
        rehkitzeGesichert: number;
        rehkitzeAbgesprungen: number;
        sonstigesWildGesichert: number;
        sonstigesWildAbgesprungen: number;
        maulwurfhuegelFehlstelle: number;
      }
    >();

    const dayMap = new Map<
      string,
      {
        date: string;
        orderCount: number;
        totalAreaSqm: number;
        totalMinutes: number;
        teamDeploymentMinutes: number;
        rehkitzeGesichert: number;
        rehkitzeAbgesprungen: number;
        sonstigesWildGesichert: number;
        sonstigesWildAbgesprungen: number;
        maulwurfhuegelFehlstelle: number;
      }
    >();

    const revierMap = new Map<
      string,
      {
        revierId: string;
        revierName: string;
        orderCount: number;
        totalAreaSqm: number;
        rehkitzeGesichert: number;
        rehkitzeAbgesprungen: number;
        sonstigesWildGesichert: number;
        sonstigesWildAbgesprungen: number;
        maulwurfhuegelFehlstelle: number;
      }
    >();

    const rows: any[] = [];

    for (const order of orders) {
      const minutes = diffMinutes(order.startTime, order.endTime);
      const areaSqm = getOrderAreaSqm(order);
      const teamName =
        order.executedTeamName || order.operationDayTeam?.team?.name || "Unbekanntes Team";
      const pilotName =
        order.executedPilotName || getPersonName(order.operationDayTeam?.pilot) || null;
      const dateKey = order.executionDate
        ? new Date(order.executionDate).toISOString().slice(0, 10)
        : "ohne-datum";

      const counts = getWildCounts(order);

      totals.totalOrders += 1;
      totals.totalAreaSqm += areaSqm;
      totals.totalMinutes += minutes;
      totals.rehkitzeGesichert += counts.rehkitzeGesichert;
      totals.rehkitzeAbgesprungen += counts.rehkitzeAbgesprungen;
      totals.sonstigesWildGesichert += counts.sonstigesWildGesichert;
      totals.sonstigesWildAbgesprungen += counts.sonstigesWildAbgesprungen;
      totals.maulwurfhuegelFehlstelle += counts.maulwurfhuegelFehlstelle;

      const teamEntry = getOrCreateTeamEntry(teamMap, {
        teamName,
        pilotName,
        searchersText: order.executedSearchersText || null,
      });

      teamEntry.orderCount += 1;
      teamEntry.totalAreaSqm += areaSqm;
      teamEntry.totalMinutes += minutes;
      teamEntry.rehkitzeGesichert += counts.rehkitzeGesichert;
      teamEntry.rehkitzeAbgesprungen += counts.rehkitzeAbgesprungen;
      teamEntry.sonstigesWildGesichert += counts.sonstigesWildGesichert;
      teamEntry.sonstigesWildAbgesprungen += counts.sonstigesWildAbgesprungen;
      teamEntry.maulwurfhuegelFehlstelle += counts.maulwurfhuegelFehlstelle;

      const dayEntry = getOrCreateDayEntry(dayMap, dateKey);

      dayEntry.orderCount += 1;
      dayEntry.totalAreaSqm += areaSqm;
      dayEntry.totalMinutes += minutes;
      dayEntry.rehkitzeGesichert += counts.rehkitzeGesichert;
      dayEntry.rehkitzeAbgesprungen += counts.rehkitzeAbgesprungen;
      dayEntry.sonstigesWildGesichert += counts.sonstigesWildGesichert;
      dayEntry.sonstigesWildAbgesprungen += counts.sonstigesWildAbgesprungen;
      dayEntry.maulwurfhuegelFehlstelle += counts.maulwurfhuegelFehlstelle;

      const mainRevierAssignment = getMainRevierAssignment(order);
      const mainRevier = mainRevierAssignment?.revier || null;

      const revierIdForRow = mainRevier?.id || "ohne-revier";
      const revierName = getRevierName(mainRevier);

      /**
       * Für Wildzahlen wird der Auftrag nur dem Hauptrevier zugerechnet.
       * Für die Fläche verwenden wir bevorzugt die Überschneidungsfläche
       * des Hauptreviers. Wenn diese fehlt, nehmen wir die ausgeführte Fläche.
       */
      const revierAreaSqm =
        safeNumber(mainRevierAssignment?.overlapSqm) > 0
          ? safeNumber(mainRevierAssignment?.overlapSqm)
          : areaSqm;

      const revierEntry = revierMap.get(revierIdForRow) || {
        revierId: revierIdForRow,
        revierName,
        orderCount: 0,
        totalAreaSqm: 0,
        rehkitzeGesichert: 0,
        rehkitzeAbgesprungen: 0,
        sonstigesWildGesichert: 0,
        sonstigesWildAbgesprungen: 0,
        maulwurfhuegelFehlstelle: 0,
      };

      revierEntry.orderCount += 1;
      revierEntry.totalAreaSqm += revierAreaSqm;
      revierEntry.rehkitzeGesichert += counts.rehkitzeGesichert;
      revierEntry.rehkitzeAbgesprungen += counts.rehkitzeAbgesprungen;
      revierEntry.sonstigesWildGesichert += counts.sonstigesWildGesichert;
      revierEntry.sonstigesWildAbgesprungen += counts.sonstigesWildAbgesprungen;
      revierEntry.maulwurfhuegelFehlstelle += counts.maulwurfhuegelFehlstelle;

      revierMap.set(revierIdForRow, revierEntry);

      const wildGesamt = getWildTotal(counts);

      rows.push({
        id: order.id,
        date: dateKey,
        orderCode: order.orderCode,
        title: order.title,
        fieldLabel: getFieldLabel(order.field),
        ownerName: getOwnerName(order.owner),
        revierName,
        teamName,
        pilotName,
        areaSqm,
        areaHa: areaSqm / 10000,
        minutes,
        wildGesamt,
        rehkitzeGesichert: counts.rehkitzeGesichert,
        rehkitzeAbgesprungen: counts.rehkitzeAbgesprungen,
        sonstigesWildGesichert: counts.sonstigesWildGesichert,
        sonstigesWildAbgesprungen: counts.sonstigesWildAbgesprungen,
        maulwurfhuegelFehlstelle: counts.maulwurfhuegelFehlstelle,
      });
    }

    for (const operationDayTeam of operationDayTeams) {
      const startTime = operationDayTeam.actualStartTime;
      const endTime = operationDayTeam.actualEndTime || new Date();
      const minutes = diffMinutes(startTime, endTime);

      if (minutes <= 0) continue;

      const teamName = operationDayTeam.team?.name || "Unbekanntes Team";
      const pilotName = getPersonName(operationDayTeam.pilot);
      const searchersText =
        operationDayTeam.members
          ?.map((member) => getPersonName(member.user))
          .filter(Boolean)
          .join(", ") || null;

      const dateKey = operationDayTeam.operationDay?.date
        ? new Date(operationDayTeam.operationDay.date).toISOString().slice(0, 10)
        : "ohne-datum";

      totals.teamDeploymentMinutes += minutes;

      const teamEntry = getOrCreateTeamEntry(teamMap, {
        teamName,
        pilotName,
        searchersText,
      });

      teamEntry.teamDeploymentMinutes += minutes;

      const dayEntry = getOrCreateDayEntry(dayMap, dateKey);
      dayEntry.teamDeploymentMinutes += minutes;
    }

    const totalHa = totals.totalAreaSqm / 10000;
    const avgMinPerHa = totalHa > 0 ? totals.totalMinutes / totalHa : 0;
    const avgTeamDeploymentMinPerHa =
      totalHa > 0 ? totals.teamDeploymentMinutes / totalHa : 0;

    const teams = Array.from(teamMap.values())
      .map((item) => {
        const totalHa = item.totalAreaSqm / 10000;

        return {
          ...item,
          totalHa,
          avgMinPerHa: totalHa > 0 ? item.totalMinutes / totalHa : 0,
          avgTeamDeploymentMinPerHa:
            totalHa > 0 ? item.teamDeploymentMinutes / totalHa : 0,
        };
      })
      .sort((a, b) => a.teamName.localeCompare(b.teamName, "de"));

    const days = Array.from(dayMap.values())
      .map((item) => {
        const totalHa = item.totalAreaSqm / 10000;

        return {
          ...item,
          totalHa,
          avgMinPerHa: totalHa > 0 ? item.totalMinutes / totalHa : 0,
          avgTeamDeploymentMinPerHa:
            totalHa > 0 ? item.teamDeploymentMinutes / totalHa : 0,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const reviere = Array.from(revierMap.values())
      .map((item) => {
        const totalHa = item.totalAreaSqm / 10000;

        const wildGesamt = getWildTotal({
          rehkitzeGesichert: item.rehkitzeGesichert,
          rehkitzeAbgesprungen: item.rehkitzeAbgesprungen,
          sonstigesWildGesichert: item.sonstigesWildGesichert,
          sonstigesWildAbgesprungen: item.sonstigesWildAbgesprungen,
        });

        const rehkitzeGesamt =
          item.rehkitzeGesichert + item.rehkitzeAbgesprungen;

        return {
          ...item,
          totalHa,
          wildGesamt,
          rehkitzeGesamt,
          rehkitzeGesichertPerHa:
            totalHa > 0 ? item.rehkitzeGesichert / totalHa : 0,
          rehkitzeGesamtPerHa: totalHa > 0 ? rehkitzeGesamt / totalHa : 0,
          wildGesamtPerHa: totalHa > 0 ? wildGesamt / totalHa : 0,
        };
      })
      .sort((a, b) => {
        if (a.revierId === "ohne-revier") return 1;
        if (b.revierId === "ohne-revier") return -1;

        return b.wildGesamtPerHa - a.wildGesamtPerHa;
      });

    return NextResponse.json({
      range: {
        from: from.toISOString().slice(0, 10),
        to: new Date(toExclusive.getTime() - 1).toISOString().slice(0, 10),
      },
      filters: {
        ownerId,
        revierId,
        teamId,
        pilotId,
        fundFilter,
      },
      filterOptions: {
        owners: owners.map((owner) => ({
          id: owner.id,
          label: getOwnerName(owner),
        })),
        reviere: reviereOptions.map((revier) => ({
          id: revier.id,
          label: getRevierName(revier),
        })),
        teams: teamsOptions.map((team) => ({
          id: team.id,
          label: team.name,
        })),
        pilots: pilotsOptions.map((pilot) => ({
          id: pilot.id,
          label: toOptionLabelUser(pilot),
        })),
      },
      summary: {
        ...totals,
        totalHa,
        avgMinPerHa,
        avgTeamDeploymentMinPerHa,
      },
      teams,
      days,
      reviere,
      rows,
    });
  } catch (error: any) {
    console.error("Fehler beim Laden der Statistik:", error);

    return NextResponse.json(
      { error: error?.message || "Statistik konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}