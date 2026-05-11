export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

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

    const fieldIds:string[] = Array.isArray(body.fieldIds)
      ? body.fieldIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    const ownerId = String(body.ownerId || "").trim();
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
        { error: "Ansprechpartner fehlt." },
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
        { error: "Ansprechpartner wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const mowingDate = parseDateOnlyToUtc(mowingDateString);
    const operationDay = await getOrCreateOperationDay(mowingDate);

    const fields = await db.field.findMany({
      where: {
        id: {
          in: fieldIds,
        },
      },
      select: {
        id: true,
        name: true,
        displayName: true,
      },
    });

    const foundFieldIds = new Set(fields.map((field) => field.id));
    const missingFieldIds = fieldIds.filter((id: string) => !foundFieldIds.has(id));

    const createdOrders = [];

    for (const field of fields) {
      const order = await db.order.create({
        data: {
          title: field.displayName || field.name,
          ownerId,
          fieldId: field.id,
          mowingDate,
          operationDayId: operationDay.id,
          status: "OFFEN",
          notes,
        },
        include: {
          owner: true,
          field: true,
        },
      });

      createdOrders.push(order);
    }

    return NextResponse.json({
      success: true,
      createdCount: createdOrders.length,
      missingFieldCount: missingFieldIds.length,
      createdOrders,
      missingFieldIds,
      message: `${createdOrders.length} Aufträge erstellt.`,
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