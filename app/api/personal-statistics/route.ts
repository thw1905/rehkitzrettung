export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import area from "@turf/area";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

function toDateKey(date: Date | null) {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function getAreaSqm(order: any) {
  if (typeof order.executedAreaSqm === "number") {
    return order.executedAreaSqm;
  }

  try {
    if (order.field?.areaGeoJson) {
      return area(order.field.areaGeoJson as any);
    }
  } catch {
    return 0;
  }

  return 0;
}

function getDurationMinutes(order: any) {
  if (!order.startTime || !order.endTime) return 0;

  const start = new Date(order.startTime).getTime();
  const end = new Date(order.endTime).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  if (end <= start) return 0;

  return Math.round((end - start) / 1000 / 60);
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

function sumOrders(orders: any[]) {
  const days = new Set<string>();

  let totalAreaSqm = 0;
  let totalMinutes = 0;

  let rehkitzeGesichert = 0;
  let rehkitzeAbgesprungen = 0;
  let sonstigesWildGesichert = 0;
  let sonstigesWildAbgesprungen = 0;
  let maulwurfhuegelFehlstelle = 0;

  for (const order of orders) {
    const day = toDateKey(
      order.executionDate || order.mowingDate || order.createdAt
    );

    if (day) {
      days.add(day);
    }

    totalAreaSqm += getAreaSqm(order);
    totalMinutes += getDurationMinutes(order);

    const counts = getWildCounts(order);

    rehkitzeGesichert += counts.rehkitzeGesichert;
    rehkitzeAbgesprungen += counts.rehkitzeAbgesprungen;
    sonstigesWildGesichert += counts.sonstigesWildGesichert;
    sonstigesWildAbgesprungen += counts.sonstigesWildAbgesprungen;
    maulwurfhuegelFehlstelle += counts.maulwurfhuegelFehlstelle;
  }

  return {
    totalOrders: orders.length,
    totalDays: days.size,
    totalAreaSqm,
    totalAreaHa: totalAreaSqm / 10000,
    totalMinutes,
    rehkitzeGesichert,
    rehkitzeAbgesprungen,
    sonstigesWildGesichert,
    sonstigesWildAbgesprungen,
    maulwurfhuegelFehlstelle,
  };
}

export async function GET() {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    const allCompletedOrders = await db.order.findMany({
      where: {
        status: "ERLEDIGT",
      },
      include: {
        field: true,
        owner: true,
        pinpoints: true,
        operationDayTeam: {
          include: {
            team: true,
            pilot: true,
            members: {
              include: {
                user: true,
              },
            },
          },
        },
      },
      orderBy: [
        { executionDate: "desc" },
        { mowingDate: "desc" },
        { createdAt: "desc" },
      ],
    });

    const myCompletedOrders = allCompletedOrders.filter((order) => {
      const dayTeam = order.operationDayTeam;

      if (!dayTeam) return false;

      const isPilot = dayTeam.pilotId === currentUser.id;
      const isSearcher = dayTeam.members.some(
        (member) => member.userId === currentUser.id
      );

      return isPilot || isSearcher;
    });

    const myFields = myCompletedOrders
      .filter((order) => !!order.field?.areaGeoJson)
      .map((order) => ({
        orderId: order.id,
        orderCode: order.orderCode,
        title: order.title,
        status: order.status,
        executionDate: order.executionDate,
        mowingDate: order.mowingDate,
        field: {
          id: order.field.id,
          name: order.field.name,
          displayName: order.field.displayName,
          areaGeoJson: order.field.areaGeoJson,
          locationLatitude: order.field.locationLatitude,
          locationLongitude: order.field.locationLongitude,
        },
        owner: {
          firstName: order.owner.firstName,
          lastName: order.owner.lastName,
        },
      }));

    const myOrders = myCompletedOrders.map((order) => {
      const counts = getWildCounts(order);

      return {
        id: order.id,
        orderCode: order.orderCode,
        title: order.title,
        executionDate: order.executionDate,
        mowingDate: order.mowingDate,
        fieldName: order.field?.displayName || order.field?.name || order.title,
        ownerName: `${order.owner.firstName} ${order.owner.lastName}`.trim(),

        rehkitzeGesichert: counts.rehkitzeGesichert,
        rehkitzeAbgesprungen: counts.rehkitzeAbgesprungen,
        sonstigesWildGesichert: counts.sonstigesWildGesichert,
        sonstigesWildAbgesprungen: counts.sonstigesWildAbgesprungen,
        maulwurfhuegelFehlstelle: counts.maulwurfhuegelFehlstelle,

        areaSqm: getAreaSqm(order),
        durationMinutes: getDurationMinutes(order),
      };
    });

    return NextResponse.json({
      user: {
        id: currentUser.id,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        role: currentUser.role,
        isAdmin: currentUser.isAdmin,
      },
      mine: sumOrders(myCompletedOrders),
      total: sumOrders(allCompletedOrders),
      myOrders,
      myFields,
    });
  } catch (error: any) {
    console.error("Persönliche Statistik Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Persönliche Statistik konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}