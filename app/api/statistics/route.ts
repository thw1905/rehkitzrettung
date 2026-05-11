import { NextRequest, NextResponse } from "next/server";
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

function getWildCounts(order: any) {
  const pinpoints = Array.isArray(order.pinpoints) ? order.pinpoints : [];

  if (pinpoints.length > 0) {
    return {
      rehkitzeGesichert: pinpoints.reduce(
        (sum: number, p: any) => sum + (p.rehkitzeGesichert || 0),
        0
      ),
      rehkitzeAbgesprungen: pinpoints.reduce(
        (sum: number, p: any) => sum + (p.rehkitzeAbgesprungen || 0),
        0
      ),
      sonstigesWildGesichert: pinpoints.reduce(
        (sum: number, p: any) => sum + (p.sonstigesWildGesichert || 0),
        0
      ),
      sonstigesWildAbgesprungen: pinpoints.reduce(
        (sum: number, p: any) => sum + (p.sonstigesWildAbgesprungen || 0),
        0
      ),
      maulwurfhuegelFehlstelle: pinpoints.reduce(
        (sum: number, p: any) => sum + (p.maulwurfhuegelFehlstelle || 0),
        0
      ),
    };
  }

  return {
    rehkitzeGesichert: order.rehkitzeGesichert || 0,
    rehkitzeAbgesprungen: order.rehkitzeAbgesprungen || 0,
    sonstigesWildGesichert: order.sonstigesWildGesichert || 0,
    sonstigesWildAbgesprungen: order.sonstigesWildAbgesprungen || 0,
    maulwurfhuegelFehlstelle: order.maulwurfhuegelFehlstelle || 0,
  };
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
    const defaultFrom = getStartOfDay(today);
    const defaultToExclusive = getEndOfDay(today);

    const from = fromParam ? getStartOfDay(new Date(fromParam)) : defaultFrom;
    const toExclusive = toParam
      ? getEndOfDay(new Date(toParam))
      : defaultToExclusive;

    const orders = await db.order.findMany({
      where: {
        status: "ERLEDIGT",
        executionDate: {
          gte: from,
          lt: toExclusive,
        },
      },
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

        rehkitzeGesichert: true,
        rehkitzeAbgesprungen: true,
        sonstigesWildGesichert: true,
        sonstigesWildAbgesprungen: true,
        maulwurfhuegelFehlstelle: true,

        pinpoints: {
          select: {
            rehkitzeGesichert: true,
            rehkitzeAbgesprungen: true,
            sonstigesWildGesichert: true,
            sonstigesWildAbgesprungen: true,
            maulwurfhuegelFehlstelle: true,
          },
        },
      },
    });

    const totals = {
      totalOrders: 0,
      totalAreaSqm: 0,
      totalMinutes: 0,
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
        rehkitzeGesichert: number;
        rehkitzeAbgesprungen: number;
        sonstigesWildGesichert: number;
        sonstigesWildAbgesprungen: number;
        maulwurfhuegelFehlstelle: number;
      }
    >();

    for (const order of orders) {
      const minutes = diffMinutes(order.startTime, order.endTime);
      const areaSqm = order.executedAreaSqm || 0;
      const teamName = order.executedTeamName || "Unbekanntes Team";
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

      const teamEntry = teamMap.get(teamName) || {
        teamName,
        pilotName: order.executedPilotName || null,
        searchersText: order.executedSearchersText || null,
        orderCount: 0,
        totalAreaSqm: 0,
        totalMinutes: 0,
        rehkitzeGesichert: 0,
        rehkitzeAbgesprungen: 0,
        sonstigesWildGesichert: 0,
        sonstigesWildAbgesprungen: 0,
        maulwurfhuegelFehlstelle: 0,
      };

      teamEntry.orderCount += 1;
      teamEntry.totalAreaSqm += areaSqm;
      teamEntry.totalMinutes += minutes;
      teamEntry.rehkitzeGesichert += counts.rehkitzeGesichert;
      teamEntry.rehkitzeAbgesprungen += counts.rehkitzeAbgesprungen;
      teamEntry.sonstigesWildGesichert += counts.sonstigesWildGesichert;
      teamEntry.sonstigesWildAbgesprungen += counts.sonstigesWildAbgesprungen;
      teamEntry.maulwurfhuegelFehlstelle += counts.maulwurfhuegelFehlstelle;

      teamMap.set(teamName, teamEntry);

      const dayEntry = dayMap.get(dateKey) || {
        date: dateKey,
        orderCount: 0,
        totalAreaSqm: 0,
        totalMinutes: 0,
        rehkitzeGesichert: 0,
        rehkitzeAbgesprungen: 0,
        sonstigesWildGesichert: 0,
        sonstigesWildAbgesprungen: 0,
        maulwurfhuegelFehlstelle: 0,
      };

      dayEntry.orderCount += 1;
      dayEntry.totalAreaSqm += areaSqm;
      dayEntry.totalMinutes += minutes;
      dayEntry.rehkitzeGesichert += counts.rehkitzeGesichert;
      dayEntry.rehkitzeAbgesprungen += counts.rehkitzeAbgesprungen;
      dayEntry.sonstigesWildGesichert += counts.sonstigesWildGesichert;
      dayEntry.sonstigesWildAbgesprungen += counts.sonstigesWildAbgesprungen;
      dayEntry.maulwurfhuegelFehlstelle += counts.maulwurfhuegelFehlstelle;

      dayMap.set(dateKey, dayEntry);
    }

    const totalHa = totals.totalAreaSqm / 10000;
    const avgMinPerHa = totalHa > 0 ? totals.totalMinutes / totalHa : 0;

    const teams = Array.from(teamMap.values())
      .map((item) => {
        const totalHa = item.totalAreaSqm / 10000;

        return {
          ...item,
          totalHa,
          avgMinPerHa: totalHa > 0 ? item.totalMinutes / totalHa : 0,
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
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      range: {
        from: from.toISOString().slice(0, 10),
        to: new Date(toExclusive.getTime() - 1).toISOString().slice(0, 10),
      },
      summary: {
        ...totals,
        totalHa,
        avgMinPerHa,
      },
      teams,
      days,
    });
  } catch (error: any) {
    console.error("Fehler beim Laden der Statistik:", error);

    return NextResponse.json(
      { error: error?.message || "Statistik konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}