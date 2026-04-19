import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { db } from "@/lib/db";
import { OrderStatus } from "@prisma/client";

function getTodayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end };
}

function diffMinutes(startTime: Date | null, endTime: Date | null) {
  if (!startTime || !endTime) return 0;
  return Math.max(
    0,
    Math.floor((endTime.getTime() - startTime.getTime()) / 60000)
  );
}

export async function GET() {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const { start, end } = getTodayRange();

    const orders = await db.order.findMany({
      where: {
        executionDate: {
          gte: start,
          lt: end,
        },
        status: OrderStatus.ERLEDIGT,
      },
      orderBy: [
        { executedTeamName: "asc" },
        { endTime: "asc" },
        { createdAt: "asc" },
      ],
    });

    const grouped = new Map<
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

    for (const order of orders) {
      const key = order.executedTeamName || "Unbekanntes Team";

      const current = grouped.get(key) || {
        teamName: key,
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

      current.orderCount += 1;
      current.totalAreaSqm += order.executedAreaSqm || 0;
      current.totalMinutes += diffMinutes(order.startTime, order.endTime);
      current.rehkitzeGesichert += order.rehkitzeGesichert || 0;
      current.rehkitzeAbgesprungen += order.rehkitzeAbgesprungen || 0;
      current.sonstigesWildGesichert += order.sonstigesWildGesichert || 0;
      current.sonstigesWildAbgesprungen += order.sonstigesWildAbgesprungen || 0;
      current.maulwurfhuegelFehlstelle +=
        order.maulwurfhuegelFehlstelle || 0;

      if (!current.pilotName && order.executedPilotName) {
        current.pilotName = order.executedPilotName;
      }

      if (!current.searchersText && order.executedSearchersText) {
        current.searchersText = order.executedSearchersText;
      }

      grouped.set(key, current);
    }

    const result = Array.from(grouped.values()).map((item) => {
      const totalHa = item.totalAreaSqm / 10000;
      const avgMinPerHa = totalHa > 0 ? item.totalMinutes / totalHa : 0;

      return {
        ...item,
        totalHa,
        avgMinPerHa,
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Fehler bei Team-Tagesleistung:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Team-Tagesleistung konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}