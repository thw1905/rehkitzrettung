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
  return Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 60000));
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
      }
    >();

    for (const order of orders) {
      const minutes = diffMinutes(order.startTime, order.endTime);
      const areaSqm = order.executedAreaSqm || 0;
      const teamName = order.executedTeamName || "Unbekanntes Team";
      const dateKey = order.executionDate
        ? new Date(order.executionDate).toISOString().slice(0, 10)
        : "ohne-datum";

      totals.totalOrders += 1;
      totals.totalAreaSqm += areaSqm;
      totals.totalMinutes += minutes;
      totals.rehkitzeGesichert += order.rehkitzeGesichert || 0;
      totals.rehkitzeAbgesprungen += order.rehkitzeAbgesprungen || 0;
      totals.sonstigesWildGesichert += order.sonstigesWildGesichert || 0;
      totals.sonstigesWildAbgesprungen += order.sonstigesWildAbgesprungen || 0;

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
      };

      teamEntry.orderCount += 1;
      teamEntry.totalAreaSqm += areaSqm;
      teamEntry.totalMinutes += minutes;
      teamEntry.rehkitzeGesichert += order.rehkitzeGesichert || 0;
      teamEntry.rehkitzeAbgesprungen += order.rehkitzeAbgesprungen || 0;
      teamEntry.sonstigesWildGesichert += order.sonstigesWildGesichert || 0;
      teamEntry.sonstigesWildAbgesprungen += order.sonstigesWildAbgesprungen || 0;

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
      };

      dayEntry.orderCount += 1;
      dayEntry.totalAreaSqm += areaSqm;
      dayEntry.totalMinutes += minutes;
      dayEntry.rehkitzeGesichert += order.rehkitzeGesichert || 0;
      dayEntry.rehkitzeAbgesprungen += order.rehkitzeAbgesprungen || 0;
      dayEntry.sonstigesWildGesichert += order.sonstigesWildGesichert || 0;
      dayEntry.sonstigesWildAbgesprungen += order.sonstigesWildAbgesprungen || 0;

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