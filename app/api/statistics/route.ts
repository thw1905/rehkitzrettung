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

function safeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

    for (const order of orders) {
      const minutes = diffMinutes(order.startTime, order.endTime);
      const areaSqm = safeNumber(order.executedAreaSqm);
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

      const mainRevierAssignment = getMainRevierAssignment(order);
      const mainRevier = mainRevierAssignment?.revier || null;

      const revierId = mainRevier?.id || "ohne-revier";
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

      const revierEntry = revierMap.get(revierId) || {
        revierId,
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

      revierMap.set(revierId, revierEntry);
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
      summary: {
        ...totals,
        totalHa,
        avgMinPerHa,
      },
      teams,
      days,
      reviere,
    });
  } catch (error: any) {
    console.error("Fehler beim Laden der Statistik:", error);

    return NextResponse.json(
      { error: error?.message || "Statistik konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}