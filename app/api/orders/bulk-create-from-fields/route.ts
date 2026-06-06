export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { area, booleanIntersects, featureCollection, intersect } from "@turf/turf";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

const MIN_OVERLAP_SQM = 500;
const MIN_OVERLAP_PERCENT = 1;

function parseDateOnlyToUtc(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    throw new Error("Ungültiges Datum.");
  }

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

async function getOrCreateOperationDay(date: Date) {
  const existing = await db.operationDay.findUnique({
    where: { date },
  });

  if (existing) return existing;

  return db.operationDay.create({
    data: {
      date,
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
      featureCollection([fieldGeoJson as any, revierGeoJson as any]) as any
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

export async function POST(req: NextRequest) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const body = await req.json();

    const fieldIds: string[] = Array.isArray(body.fieldIds)
      ? body.fieldIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    const ownerId = String(body.ownerId || "").trim();
    const contactOwnerId =
      body.contactOwnerId && String(body.contactOwnerId).trim()
        ? String(body.contactOwnerId).trim()
        : null;

    const mowingDateString = String(body.mowingDate || "").trim();
    const notes = body.notes ? String(body.notes).trim() : null;

    if (fieldIds.length === 0) {
      return NextResponse.json(
        { error: "Keine Flächen ausgewählt." },
        { status: 400 }
      );
    }

    if (!ownerId) {
      return NextResponse.json(
        { error: "Landwirt fehlt." },
        { status: 400 }
      );
    }

    if (!mowingDateString) {
      return NextResponse.json(
        { error: "Mähdatum fehlt." },
        { status: 400 }
      );
    }

    const owner = await db.owner.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Landwirt wurde nicht gefunden." },
        { status: 404 }
      );
    }

    if (contactOwnerId) {
      const contactOwner = await db.owner.findUnique({
        where: { id: contactOwnerId },
        select: { id: true },
      });

      if (!contactOwner) {
        return NextResponse.json(
          { error: "Ansprechpartner wurde nicht gefunden." },
          { status: 404 }
        );
      }
    }

    const mowingDate = parseDateOnlyToUtc(mowingDateString);
    const operationDay = await getOrCreateOperationDay(mowingDate);

    const uniqueFieldIds = Array.from(new Set(fieldIds));

    const fields = await db.field.findMany({
      where: {
        id: {
          in: uniqueFieldIds,
        },
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        areaGeoJson: true,
      },
    });

    const foundFieldIds = new Set(fields.map((field) => field.id));
    const missingFieldIds = uniqueFieldIds.filter(
      (id: string) => !foundFieldIds.has(id)
    );

    const createdOrders: any[] = [];
    let createdOrderReviereCount = 0;

    for (const field of fields) {
      const matchingReviere = await findMatchingReviere(field.areaGeoJson);
      const { year, sequence, orderCode } = await getNextOrderNumberParts();

      const order = await db.order.create({
        data: {
          title: orderCode,
          orderCode,
          orderYear: year,
          orderSequence: sequence,

          ownerId,
          contactOwnerId,
          fieldId: field.id,

          mowingDate,
          operationDayId: operationDay.id,
          status: "OFFEN",
          notes,

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
          contactOwner: true,
          field: true,
          reviere: {
            include: {
              revier: {
                include: {
                  paechter: {
                    include: {
                      pachter: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              overlapSqm: "desc",
            },
          },
        },
      });

      createdOrderReviereCount += matchingReviere.length;
      createdOrders.push(order);
    }

    return NextResponse.json({
      success: true,
      createdCount: createdOrders.length,
      missingFieldCount: missingFieldIds.length,
      createdOrderReviereCount,
      createdOrders,
      missingFieldIds,
      message: `${createdOrders.length} Aufträge erstellt. ${createdOrderReviereCount} Revier-Zuordnungen erkannt.`,
    });
  } catch (error: any) {
    console.error("Bulk-Auftragserstellung Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Aufträge konnten nicht automatisch erstellt werden.",
      },
      { status: 500 }
    );
  }
}