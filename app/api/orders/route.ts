import { NextRequest, NextResponse } from "next/server";
import { area, booleanIntersects, featureCollection, intersect } from "@turf/turf";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

const MIN_OVERLAP_SQM = 500;
const MIN_OVERLAP_PERCENT = 1;

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

function getFeatureAreaSqm(feature: any) {
  try {
    return area(feature);
  } catch {
    return 0;
  }
}

function getOverlapForRevier(params: {
  fieldGeoJson: any;
  revierGeoJson: any;
}) {
  const { fieldGeoJson, revierGeoJson } = params;

  try {
    if (!fieldGeoJson || !revierGeoJson) {
      return null;
    }

    if (!booleanIntersects(fieldGeoJson, revierGeoJson)) {
      return null;
    }

    const fieldAreaSqm = getFeatureAreaSqm(fieldGeoJson);

    if (fieldAreaSqm <= 0) {
      return null;
    }

    const intersection = intersect(
      featureCollection([fieldGeoJson, revierGeoJson])
    );

    if (!intersection) {
      return null;
    }

    const overlapSqm = getFeatureAreaSqm(intersection);
    const overlapPercent = (overlapSqm / fieldAreaSqm) * 100;

    const isRelevant =
      overlapSqm >= MIN_OVERLAP_SQM ||
      overlapPercent >= MIN_OVERLAP_PERCENT;

    if (!isRelevant) {
      return null;
    }

    return {
      overlapSqm,
      overlapPercent,
    };
  } catch (error) {
    console.error("Revier-Überschneidung konnte nicht berechnet werden:", error);
    return null;
  }
}

async function findMatchingReviere(fieldGeoJson: any) {
  const reviere = await db.revier.findMany({
    select: {
      id: true,
      areaGeoJson: true,
    },
  });

  const matches: {
    revierId: string;
    overlapSqm: number;
    overlapPercent: number;
  }[] = [];

  for (const revier of reviere) {
    const overlap = getOverlapForRevier({
      fieldGeoJson,
      revierGeoJson: revier.areaGeoJson,
    });

    if (!overlap) continue;

    matches.push({
      revierId: revier.id,
      overlapSqm: overlap.overlapSqm,
      overlapPercent: overlap.overlapPercent,
    });
  }

  matches.sort((a, b) => b.overlapSqm - a.overlapSqm);

  return matches;
}

const orderInclude = {
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
          createdAt: "asc" as const,
        },
      },
    },
  },
  pinpoints: {
    orderBy: {
      sequenceNumber: "asc" as const,
    },
  },
  reviere: {
    include: {
      revier: {
        include: {
          paechter: {
            include: {
              pachter: true,
            },
            orderBy: {
              createdAt: "asc" as const,
            },
          },
        },
      },
    },
    orderBy: {
      overlapSqm: "desc" as const,
    },
  },
};

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
        { sortOrder: "asc" },
        { mowingDate: "asc" },
        { createdAt: "desc" },
      ],
      include: orderInclude,
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

    const field = await db.field.findUnique({
      where: {
        id: String(body.fieldId),
      },
      select: {
        id: true,
        areaGeoJson: true,
      },
    });

    if (!field) {
      return NextResponse.json(
        { error: "Fläche wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const { year, sequence, orderCode } = await getNextOrderNumberParts();

    const mowingDate = body.mowingDate ? new Date(body.mowingDate) : null;
    const operationDay = await getOrCreateOperationDayFromMowingDate(mowingDate);

    const matchingReviere = await findMatchingReviere(field.areaGeoJson);

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

        reviere: {
          create: matchingReviere.map((match) => ({
            revierId: match.revierId,
            overlapSqm: match.overlapSqm,
            overlapPercent: match.overlapPercent,
          })),
        },
      },
      include: orderInclude,
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