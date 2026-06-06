export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { area } from "@turf/turf";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

const ALLOWED_STATUS = new Set([
  "OFFEN",
  "IN_BEARBEITUNG",
  "ERLEDIGT",
  "ABGELEHNT",
]);

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

function safeAreaSqm(feature: unknown) {
  try {
    return area(feature as any);
  } catch {
    return 0;
  }
}

function normalizeMowingRequest(request: any) {
  const fields = (request.fields || []).map((item: any) => {
    const fieldAreaSqm = safeAreaSqm(item.field?.areaGeoJson);

    return {
      id: item.id,
      fieldId: item.fieldId,
      field: item.field
        ? {
            id: item.field.id,
            name: item.field.name,
            displayName: item.field.displayName,
            notes: item.field.notes,
            locationNote: item.field.locationNote,
            areaSqm: fieldAreaSqm,
            areaHa: fieldAreaSqm / 10000,
          }
        : null,
    };
  });

  const totalAreaSqm = fields.reduce(
    (sum: number, item: any) => sum + (item.field?.areaSqm || 0),
    0
  );

  return {
    ...request,
    fields,
    totalAreaSqm,
    totalAreaHa: totalAreaSqm / 10000,
  };
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "OFFEN";
    const dateParam = searchParams.get("date") || "";

    const where: any = {};

    if (status !== "ALLE") {
      where.status = status;
    }

    if (dateParam) {
      const selectedDate = parseDateOnlyToUtc(dateParam);
      const nextDate = new Date(selectedDate);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);

      where.mowingDate = {
        gte: selectedDate,
        lt: nextDate,
      };
    }

    const requests = await db.mowingRequest.findMany({
      where,
      include: {
        owner: true,
        fields: {
          include: {
            field: {
              select: {
                id: true,
                name: true,
                displayName: true,
                notes: true,
                locationNote: true,
                areaGeoJson: true,
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
      orderBy: [
        { createdAt: "desc" },
        { mowingDate: "asc" },
      ],
    });

    return NextResponse.json({
      requests: requests.map(normalizeMowingRequest),
    });
  } catch (error: any) {
    console.error("Mähanfragen laden Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Mähanfragen konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const requestId = String(body.id || "").trim();
    const nextStatus = String(body.status || "").trim();

    if (!requestId) {
      return NextResponse.json(
        { error: "Mähanfrage fehlt." },
        { status: 400 }
      );
    }

    if (!ALLOWED_STATUS.has(nextStatus)) {
      return NextResponse.json(
        { error: "Ungültiger Status." },
        { status: 400 }
      );
    }

    const updated = await db.mowingRequest.update({
      where: {
        id: requestId,
      },
      data: {
        status: nextStatus,
      },
    });

    return NextResponse.json({
      success: true,
      request: updated,
    });
  } catch (error: any) {
    console.error("Mähanfrage aktualisieren Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Mähanfrage konnte nicht aktualisiert werden.",
      },
      { status: 500 }
    );
  }
}