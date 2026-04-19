import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDateOnlyToUtc(dateInput: string | Date) {
  const date =
    typeof dateInput === "string" ? new Date(dateInput) : new Date(dateInput);

  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );
}

async function getOrCreateOperationDayFromMowingDate(mowingDate: Date | null) {
  if (!mowingDate) {
    return null;
  }

  const normalizedDate = parseDateOnlyToUtc(mowingDate);

  const existing = await db.operationDay.findUnique({
    where: {
      date: normalizedDate,
    },
  });

  if (existing) {
    return existing;
  }

  return db.operationDay.create({
    data: {
      date: normalizedDate,
      status: "PLANUNG",
    },
  });
}

async function getNextOrderNumberParts() {
  const now = new Date();
  const year = now.getFullYear();

  const lastOrder = await db.order.findFirst({
    where: { orderYear: year },
    orderBy: { orderSequence: "desc" },
    select: { orderSequence: true },
  });

  const nextSequence = (lastOrder?.orderSequence || 0) + 1;

  return {
    year,
    sequence: nextSequence,
    orderCode: `${year}-${String(nextSequence).padStart(3, "0")}`,
  };
}

export async function GET() {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  try {
    const orders = await db.order.findMany({
      where: {
        operationDayTeam: {
          is: {
            OR: [
              {
                pilotId: currentUser.id,
              },
              {
                members: {
                  some: {
                    userId: currentUser.id,
                  },
                },
              },
            ],
          },
        },
      },
      orderBy: [
        { status: "asc" },
        { mowingDate: "asc" },
        { createdAt: "desc" },
      ],
      include: {
        owner: true,
        field: true,
        operationDay: true,
        operationDayTeam: {
          include: {
            team: true,
            pilot: true,
            members: {
              include: {
                user: true,
              },
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        },
        pinpoints: {
          orderBy: {
            sequenceNumber: "asc",
          },
        },
      },
    });

    const normalizedOrders = orders.map((order) => ({
      ...order,
      team: order.operationDayTeam?.team || null,
    }));

    return NextResponse.json(normalizedOrders);
  } catch (error: any) {
    console.error("Fehler beim Laden der Aufträge:", error);

    return NextResponse.json(
      { error: error?.message || "Aufträge konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  if (!currentUser.isAdmin) {
    return NextResponse.json(
      { error: "Nur Admins dürfen Aufträge anlegen." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    if (!body.ownerId) {
      return NextResponse.json(
        { error: "Ansprechpartner fehlt." },
        { status: 400 }
      );
    }

    if (!body.fieldId) {
      return NextResponse.json(
        { error: "Fläche fehlt." },
        { status: 400 }
      );
    }

    const { year, sequence, orderCode } = await getNextOrderNumberParts();

    const mowingDate = body.mowingDate ? new Date(body.mowingDate) : null;
    const operationDay = await getOrCreateOperationDayFromMowingDate(mowingDate);

    const order = await db.order.create({
      data: {
        title: orderCode,
        orderCode,
        orderYear: year,
        orderSequence: sequence,
        status: body.status || "OFFEN",
        notes: body.notes || null,
        mowingDate,
        executionDate: body.status === "ERLEDIGT" ? getTodayStart() : null,

        rehkitzeGesichert: Number(body.rehkitzeGesichert || 0),
        rehkitzeAbgesprungen: Number(body.rehkitzeAbgesprungen || 0),
        sonstigesWildGesichert: Number(body.sonstigesWildGesichert || 0),
        sonstigesWildAbgesprungen: Number(body.sonstigesWildAbgesprungen || 0),
        maulwurfhuegelFehlstelle: Number(body.maulwurfhuegelFehlstelle || 0),

        ownerId: body.ownerId,
        fieldId: body.fieldId,
        operationDayId: operationDay?.id || null,
        operationDayTeamId: body.operationDayTeamId || null,
      },
      include: {
        owner: true,
        field: true,
        operationDay: true,
        operationDayTeam: {
          include: {
            team: true,
            pilot: true,
            members: {
              include: {
                user: true,
              },
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        },
        pinpoints: {
          orderBy: {
            sequenceNumber: "asc",
          },
        },
      },
    });

    const normalizedOrder = {
      ...order,
      team: order.operationDayTeam?.team || null,
    };

    return NextResponse.json(normalizedOrder);
  } catch (error: any) {
    console.error("Fehler beim Anlegen des Auftrags:", error);

    return NextResponse.json(
      { error: error?.message || "Auftrag konnte nicht angelegt werden." },
      { status: 500 }
    );
  }
}