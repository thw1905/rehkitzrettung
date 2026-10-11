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

const MOWING_REQUEST_INCLUDE = {
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
} as const;

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

function normalizeFieldIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const ids = value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }

      if (item && typeof item === "object") {
        const maybeObject = item as {
          id?: unknown;
          fieldId?: unknown;
        };

        return String(maybeObject.fieldId || maybeObject.id || "").trim();
      }

      return "";
    })
    .filter(Boolean);

  return Array.from(new Set(ids));
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

function normalizeFieldOption(field: any) {
  const fieldAreaSqm = safeAreaSqm(field.areaGeoJson);

  return {
    id: field.id,
    ownerId: field.ownerId,
    name: field.name,
    displayName: field.displayName,
    notes: field.notes,
    locationNote: field.locationNote,
    areaSqm: fieldAreaSqm,
    areaHa: fieldAreaSqm / 10000,
    owner: field.owner
      ? {
          id: field.owner.id,
          firstName: field.owner.firstName,
          lastName: field.owner.lastName,
          phone: field.owner.phone,
          email: field.owner.email,
        }
      : null,
  };
}

function buildSummary(requests: any[]) {
  const normalizedRequests = requests.map(normalizeMowingRequest);

  const totalFields = normalizedRequests.reduce(
    (sum, request) => sum + request.fields.length,
    0
  );

  const totalAreaHa = normalizedRequests.reduce(
    (sum, request) => sum + (request.totalAreaHa || 0),
    0
  );

  return {
    requests: normalizedRequests,
    summary: {
      totalRequests: normalizedRequests.length,
      totalFields,
      totalAreaHa,
    },
  };
}

function getPersonName(user: any) {
  if (!user) return "-";

  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();

  return name || "-";
}

function buildAdminCreatedNote(params: {
  note: string;
  timeText: string;
  adminName: string;
}) {
  const parts: string[] = ["Telefonisch/Admin erfasst."];

  parts.push(`Erfasst am: ${new Date().toLocaleString("de-DE")}`);

  if (params.adminName && params.adminName !== "-") {
    parts.push(`Erfasst von: ${params.adminName}`);
  }

  if (params.timeText.trim()) {
    parts.push(`Uhrzeit/Angabe: ${params.timeText.trim()}`);
  }

  if (params.note.trim()) {
    parts.push("");
    parts.push(params.note.trim());
  }

  return parts.join("\n");
}

async function loadFieldOptions() {
  const fields = await db.field.findMany({
    where: {
      ownerId: {
        not: null,
      },
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      displayName: true,
      notes: true,
      locationNote: true,
      areaGeoJson: true,
      owner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
    },
    orderBy: [
      {
        owner: {
          lastName: "asc",
        },
      },
      {
        owner: {
          firstName: "asc",
        },
      },
      {
        displayName: "asc",
      },
      {
        name: "asc",
      },
    ],
  });

  return fields.map(normalizeFieldOption);
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

    const [requests, fieldOptions] = await Promise.all([
      db.mowingRequest.findMany({
        where,
        include: MOWING_REQUEST_INCLUDE,
        orderBy: [{ createdAt: "desc" }, { mowingDate: "asc" }],
      }),
      loadFieldOptions(),
    ]);

    return NextResponse.json({
      ...buildSummary(requests),
      fieldOptions,
    });
  } catch (error: any) {
    console.error("Mähanfragen laden Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Mähanfragen konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser || !currentUser.isAdmin) {
      return NextResponse.json(
        { error: "Keine Berechtigung." },
        { status: 403 }
      );
    }

    const body: any = await req.json().catch(() => ({}));

    const ownerId = String(body.ownerId || "").trim();
    const mowingDateText = String(body.mowingDate || "").trim();
    const timeText = String(body.timeText || "").trim();
    const note = String(body.note || "").trim();

    const fieldIds = normalizeFieldIds(body.fieldIds ?? body.fields);

    if (!ownerId) {
      return NextResponse.json(
        { error: "Bitte einen Landwirt auswählen." },
        { status: 400 }
      );
    }

    if (!mowingDateText) {
      return NextResponse.json(
        { error: "Bitte ein Mähdatum auswählen." },
        { status: 400 }
      );
    }

    if (fieldIds.length === 0) {
      return NextResponse.json(
        { error: "Bitte mindestens eine Fläche auswählen." },
        { status: 400 }
      );
    }

    const mowingDate = parseDateOnlyToUtc(mowingDateText);

    const owner = await db.owner.findUnique({
      where: {
        id: ownerId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: "Der ausgewählte Landwirt wurde nicht gefunden." },
        { status: 404 }
      );
    }

    const existingFields = await db.field.findMany({
      where: {
        id: {
          in: fieldIds,
        },
        ownerId,
      },
      select: {
        id: true,
      },
    });

    if (existingFields.length !== fieldIds.length) {
      return NextResponse.json(
        {
          error:
            "Mindestens eine ausgewählte Fläche wurde nicht gefunden oder gehört nicht zu diesem Landwirt.",
        },
        { status: 400 }
      );
    }

    const finalNote = buildAdminCreatedNote({
      note,
      timeText,
      adminName: getPersonName(currentUser),
    });

    const created = await db.mowingRequest.create({
      data: {
        ownerId,
        mowingDate,
        timeText: timeText || null,
        note: finalNote,
        status: "OFFEN",
        fields: {
          create: fieldIds.map((fieldId) => ({
            fieldId,
          })),
        },
      },
      include: MOWING_REQUEST_INCLUDE,
    });

    return NextResponse.json({
      success: true,
      request: normalizeMowingRequest(created),
      message: "Telefonische Mähanfrage wurde erstellt.",
    });
  } catch (error: any) {
    console.error("Telefonische Mähanfrage erstellen Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Telefonische Mähanfrage konnte nicht erstellt werden.",
      },
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
      include: MOWING_REQUEST_INCLUDE,
    });

    return NextResponse.json({
      success: true,
      request: normalizeMowingRequest(updated),
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
