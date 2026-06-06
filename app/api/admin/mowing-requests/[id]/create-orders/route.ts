export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { area, booleanIntersects, featureCollection, intersect } from "@turf/turf";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

const MIN_OVERLAP_SQM = 500;
const MIN_OVERLAP_PERCENT = 1;

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

function parseDateOnlyToUtc(dateInput: Date | string) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;

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

async function getOrCreateOperationDay(tx: TxClient, mowingDate: Date) {
  const normalizedDate = parseDateOnlyToUtc(mowingDate);

  const existing = await tx.operationDay.findUnique({
    where: {
      date: normalizedDate,
    },
  });

  if (existing) return existing;

  try {
    return await tx.operationDay.create({
      data: {
        date: normalizedDate,
        status: "PLANUNG",
      },
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      const createdByParallelRequest = await tx.operationDay.findUnique({
        where: {
          date: normalizedDate,
        },
      });

      if (createdByParallelRequest) return createdByParallelRequest;
    }

    throw error;
  }
}

async function getNextOrderNumberParts(tx: TxClient) {
  const now = new Date();
  const year = now.getFullYear();

  const lastOrder = await tx.order.findFirst({
    where: {
      orderYear: year,
    },
    orderBy: {
      orderSequence: "desc",
    },
    select: {
      orderSequence: true,
    },
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
    if (!fieldGeoJson || !revierGeoJson) return null;

    if (!booleanIntersects(fieldGeoJson as any, revierGeoJson as any)) {
      return null;
    }

    const fieldAreaSqm = getFeatureAreaSqm(fieldGeoJson);

    if (fieldAreaSqm <= 0) return null;

    const intersection = intersect(
      featureCollection([fieldGeoJson as any, revierGeoJson as any]) as any
    );

    if (!intersection) return null;

    const overlapSqm = getFeatureAreaSqm(intersection);
    const overlapPercent = (overlapSqm / fieldAreaSqm) * 100;

    const isRelevant =
      overlapSqm >= MIN_OVERLAP_SQM || overlapPercent >= MIN_OVERLAP_PERCENT;

    if (!isRelevant) return null;

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

function buildOrderNote(request: {
  timeText: string | null;
  note: string | null;
}) {
  const parts: string[] = ["Aus Landwirt-Mähanfrage erzeugt."];

  if (request.timeText?.trim()) {
    parts.push(`Uhrzeit/Angabe: ${request.timeText.trim()}`);
  }

  if (request.note?.trim()) {
    parts.push(`Notiz: ${request.note.trim()}`);
  }

  return parts.join("\n");
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const mowingRequest = await db.mowingRequest.findUnique({
      where: {
        id,
      },
      include: {
        owner: true,
        fields: {
          include: {
            field: {
              include: {
                owner: true,
              },
            },
          },
          orderBy: {
            field: {
              displayName: "asc",
            },
          },
        },
      },
    });

    if (!mowingRequest) {
      return NextResponse.json(
        { error: "Mähanfrage wurde nicht gefunden." },
        { status: 404 }
      );
    }

    if (mowingRequest.fields.length === 0) {
      return NextResponse.json(
        { error: "Diese Mähanfrage enthält keine Flächen." },
        { status: 400 }
      );
    }

    const existingOrders = await db.order.findMany({
      where: {
        ownerId: mowingRequest.ownerId,
        mowingDate: parseDateOnlyToUtc(mowingRequest.mowingDate),
        fieldId: {
          in: mowingRequest.fields.map((item) => item.fieldId),
        },
      },
      select: {
        id: true,
        fieldId: true,
        orderCode: true,
      },
    });

    if (existingOrders.length > 0) {
      return NextResponse.json(
        {
          error:
            "Für mindestens eine Fläche dieser Anfrage existiert bereits ein Auftrag mit demselben Besitzer und Mähdatum.",
          existingOrders,
        },
        { status: 409 }
      );
    }

    const revierMatchesByFieldId = new Map<
      string,
      { revierId: string; overlapSqm: number; overlapPercent: number }[]
    >();

    for (const requestField of mowingRequest.fields) {
      const matches = await findMatchingReviere(requestField.field.areaGeoJson);
      revierMatchesByFieldId.set(requestField.fieldId, matches);
    }

    const createdOrders = await db.$transaction(async (tx) => {
      const operationDay = await getOrCreateOperationDay(
        tx,
        mowingRequest.mowingDate
      );

      const created: any[] = [];
      const orderNote = buildOrderNote(mowingRequest);
      const mowingDate = parseDateOnlyToUtc(mowingRequest.mowingDate);

      for (const requestField of mowingRequest.fields) {
        const { year, sequence, orderCode } = await getNextOrderNumberParts(tx);
        const matchingReviere = revierMatchesByFieldId.get(requestField.fieldId) || [];

        const order = await tx.order.create({
          data: {
            title: orderCode,
            orderCode,
            orderYear: year,
            orderSequence: sequence,
            status: "OFFEN",
            notes: orderNote,
            mowingDate,
            ownerId: mowingRequest.ownerId,
            fieldId: requestField.fieldId,
            operationDayId: operationDay.id,
            reviere: {
              create: matchingReviere.map((match) => ({
                revierId: match.revierId,
                overlapSqm: match.overlapSqm,
                overlapPercent: match.overlapPercent,
              })),
            },
          },
          include: {
            owner: true,
            field: true,
            reviere: {
              include: {
                revier: true,
              },
            },
          },
        });

        created.push(order);
      }

      await tx.mowingRequest.update({
        where: {
          id: mowingRequest.id,
        },
        data: {
          status: "ERLEDIGT",
        },
      });

      return created;
    });

    return NextResponse.json({
      success: true,
      createdCount: createdOrders.length,
      createdOrders,
      message: `${createdOrders.length} Auftrag/Aufträge wurden erzeugt.`,
    });
  } catch (error: any) {
    console.error("Aufträge aus Mähanfrage erzeugen Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Aufträge konnten nicht aus der Mähanfrage erzeugt werden.",
      },
      { status: 500 }
    );
  }
}