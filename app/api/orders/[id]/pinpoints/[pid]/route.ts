import { NextRequest, NextResponse } from "next/server";
import { PinpointStatus, OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function parseNonNegativeInt(value: unknown, fallback?: number) {
  if (value === undefined) return fallback;

  const n = Number(value);

  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Ungültiger Zahlenwert.");
  }

  return Math.floor(n);
}

function parsePinpointStatus(value: unknown): PinpointStatus | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error("Ungültiger Status.");
  }

  const normalized = value.trim().toUpperCase() as PinpointStatus;

  if (!Object.values(PinpointStatus).includes(normalized)) {
    throw new Error("Ungültiger PinPoint-Status.");
  }

  return normalized;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; pid: string }> }
) {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id, pid } = await context.params;

  const order = await db.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      operationDayTeamId: true,
      operationDayTeam: {
        select: {
          id: true,
          pilotId: true,
          members: {
            select: {
              userId: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json(
      { error: "Auftrag nicht gefunden." },
      { status: 404 }
    );
  }

  const pinpoint = await db.orderPinpoint.findUnique({
    where: { id: pid },
    select: {
      id: true,
      orderId: true,
      status: true,
      reachedAt: true,
      note: true,
      rehkitzeGesichert: true,
      rehkitzeAbgesprungen: true,
      sonstigesWildGesichert: true,
      sonstigesWildAbgesprungen: true,
      maulwurfhuegelFehlstelle: true,
    },
  });

  if (!pinpoint || pinpoint.orderId !== id) {
    return NextResponse.json(
      { error: "PinPoint nicht gefunden." },
      { status: 404 }
    );
  }

  const userBelongsToThisOrder =
    !!order.operationDayTeam &&
    (order.operationDayTeam.pilotId === currentUser.id ||
      order.operationDayTeam.members.some(
        (member) => member.userId === currentUser.id
      ));

  if (!currentUser.isAdmin && !userBelongsToThisOrder) {
    return NextResponse.json(
      { error: "Keine Berechtigung für diesen PinPoint." },
      { status: 403 }
    );
  }

  if (order.status === OrderStatus.ERLEDIGT) {
    return NextResponse.json(
      { error: "PinPoints erledigter Aufträge dürfen nicht mehr verändert werden." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    const nextStatus = parsePinpointStatus(body.status);

    const rehkitzeGesichert = parseNonNegativeInt(
      body.rehkitzeGesichert,
      undefined
    );
    const rehkitzeAbgesprungen = parseNonNegativeInt(
      body.rehkitzeAbgesprungen,
      undefined
    );
    const sonstigesWildGesichert = parseNonNegativeInt(
      body.sonstigesWildGesichert,
      undefined
    );
    const sonstigesWildAbgesprungen = parseNonNegativeInt(
      body.sonstigesWildAbgesprungen,
      undefined
    );
    const maulwurfhuegelFehlstelle = parseNonNegativeInt(
      body.maulwurfhuegelFehlstelle,
      undefined
    );

    const updateData: any = {};

    if (nextStatus !== undefined) {
      updateData.status = nextStatus;
    }

    if (body.note !== undefined) {
      updateData.note =
        body.note === null ? null : String(body.note).trim();
    }

    if (rehkitzeGesichert !== undefined) {
      updateData.rehkitzeGesichert = rehkitzeGesichert;
    }

    if (rehkitzeAbgesprungen !== undefined) {
      updateData.rehkitzeAbgesprungen = rehkitzeAbgesprungen;
    }

    if (sonstigesWildGesichert !== undefined) {
      updateData.sonstigesWildGesichert = sonstigesWildGesichert;
    }

    if (sonstigesWildAbgesprungen !== undefined) {
      updateData.sonstigesWildAbgesprungen = sonstigesWildAbgesprungen;
    }

    if (maulwurfhuegelFehlstelle !== undefined) {
      updateData.maulwurfhuegelFehlstelle = maulwurfhuegelFehlstelle;
    }

    if (
      (nextStatus === PinpointStatus.ERREICHT ||
        nextStatus === PinpointStatus.ERLEDIGT) &&
      !pinpoint.reachedAt
    ) {
      updateData.reachedAt = new Date();
    }

    const updated = await db.orderPinpoint.update({
      where: { id: pid },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Fehler beim Aktualisieren des PinPoints:", error);

    return NextResponse.json(
      { error: error?.message || "PinPoint konnte nicht aktualisiert werden." },
      { status: 400 }
    );
  }
}