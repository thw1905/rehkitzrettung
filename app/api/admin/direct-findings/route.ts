export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithTeams();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Nur für Administratoren." }, { status: 403 });

  try {
    const q = String(req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
    const orders = await db.order.findMany({
      where: {
        status: OrderStatus.ERLEDIGT,
        ...(q ? {
          OR: [
            { orderCode: { contains: q } },
            { title: { contains: q } },
            { owner: { is: { firstName: { contains: q } } } },
            { owner: { is: { lastName: { contains: q } } } },
            { field: { is: { displayName: { contains: q } } } },
            { field: { is: { name: { contains: q } } } },
          ],
        } : {}),
      },
      orderBy: [{ endTime: "desc" }, { updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        orderCode: true,
        title: true,
        endTime: true,
        mowingDate: true,
        rehkitzeGesichert: true,
        rehkitzeAbgesprungen: true,
        sonstigesWildGesichert: true,
        sonstigesWildAbgesprungen: true,
        maulwurfhuegelFehlstelle: true,
        owner: { select: { firstName: true, lastName: true } },
        field: { select: { name: true, displayName: true } },
        operationDay: { select: { status: true } },
        operationDayTeam: {
          select: {
            pilot: { select: { firstName: true, lastName: true } },
            operationDay: { select: { status: true } },
            team: { select: { name: true } },
          },
        },
      },
    });

    return NextResponse.json({
      orders: orders.map((order) => ({
        id: order.id,
        label: order.orderCode || order.title,
        fieldLabel: order.field.displayName || order.field.name,
        ownerName: `${order.owner.firstName} ${order.owner.lastName}`.trim(),
        pilotName: order.operationDayTeam?.pilot
          ? `${order.operationDayTeam.pilot.firstName} ${order.operationDayTeam.pilot.lastName}`.trim()
          : "-",
        teamName: order.operationDayTeam?.team.name || "-",
        endTime: order.endTime,
        mowingDate: order.mowingDate,
        operationDayStatus: order.operationDay?.status || order.operationDayTeam?.operationDay.status || "-",
        directTotal: order.rehkitzeGesichert + order.rehkitzeAbgesprungen +
          order.sonstigesWildGesichert + order.sonstigesWildAbgesprungen + order.maulwurfhuegelFehlstelle,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin Direktfunde Liste:", error);
    return NextResponse.json({ error: "Aufträge konnten nicht geladen werden." }, { status: 500 });
  }
}
