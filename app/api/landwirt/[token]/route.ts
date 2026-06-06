export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { area } from "@turf/turf";
import { db } from "@/lib/db";
import { sendWebPushToUser } from "@/lib/web-push";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

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

function getOwnerLabel(owner: {
  firstName?: string | null;
  lastName?: string | null;
}) {
  const label = [owner.firstName || "", owner.lastName || ""]
    .join(" ")
    .trim();

  return label || "Landwirt";
}

function normalizeOptionalString(value: unknown) {
  if (value === undefined || value === null) return null;

  const text = String(value).trim();

  return text.length > 0 ? text : null;
}

function formatDateForNotification(date: Date) {
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function getActiveOwnerByToken(token: string) {
  const trimmedToken = token.trim();

  if (!trimmedToken) {
    return null;
  }

  const accessToken = await db.ownerAccessToken.findUnique({
    where: {
      token: trimmedToken,
    },
    include: {
      owner: {
        include: {
          fields: {
            orderBy: [
              { displayName: "asc" },
              { name: "asc" },
              { createdAt: "asc" },
            ],
          },
        },
      },
    },
  });

  if (!accessToken || !accessToken.isActive) {
    return null;
  }

  return accessToken.owner;
}

function getFieldLabel(field: {
  displayName?: string | null;
  name?: string | null;
}) {
  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} (${name})`;
  if (displayName) return displayName;
  if (name) return name;

  return "Unbekannte Fläche";
}

async function notifyAdminsAboutMowingRequest(params: {
  ownerName: string;
  mowingDate: Date;
  fieldCount: number;
  fieldLabels: string[];
}) {
  const admins = await db.user.findMany({
    where: {
      isAdmin: true,
      isApproved: true,
    },
    select: {
      id: true,
    },
  });

  if (admins.length === 0) {
    return;
  }

  const dateText = formatDateForNotification(params.mowingDate);

  const shortFieldText =
    params.fieldLabels.length > 0
      ? params.fieldLabels.slice(0, 8).join(", ")
      : `${params.fieldCount} Fläche(n)`;

  const moreText =
    params.fieldLabels.length > 8
      ? ` und ${params.fieldLabels.length - 8} weitere`
      : "";

  const title = `Neue Mähanfrage von ${params.ownerName}`;
  const body = `${params.fieldCount} Fläche(n) für den ${dateText} gemeldet: ${shortFieldText}${moreText}`;
  const url = "/admin/mowing-requests";

  await db.notificationMessage.create({
    data: {
      title,
      body,
      type: "MOWING_REQUEST",
      date: params.mowingDate,
      url,
      recipients: {
        create: admins.map((admin) => ({
          userId: admin.id,
        })),
      },
    },
  });

  for (const admin of admins) {
    try {
      await sendWebPushToUser(admin.id, {
        title,
        body,
        url,
      });
    } catch (error) {
      console.error("Push für Mähanfrage konnte nicht gesendet werden:", error);
    }
  }
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const owner = await getActiveOwnerByToken(token);

    if (!owner) {
      return NextResponse.json(
        { error: "Dieser Landwirt-Link ist ungültig oder nicht mehr aktiv." },
        { status: 404 }
      );
    }

    const fields = owner.fields.map((field) => {
      const areaSqm = safeAreaSqm(field.areaGeoJson);

      return {
        id: field.id,
        name: field.name,
        displayName: field.displayName,
        notes: field.notes,
        areaGeoJson: field.areaGeoJson,
        areaSqm,
        areaHa: areaSqm / 10000,
        locationLatitude: field.locationLatitude,
        locationLongitude: field.locationLongitude,
        locationNote: field.locationNote,
      };
    });

    return NextResponse.json({
      owner: {
        id: owner.id,
        firstName: owner.firstName,
        lastName: owner.lastName,
        street: owner.street,
        zip: owner.zip,
        city: owner.city,
        phone: owner.phone,
        email: owner.email,
        label: getOwnerLabel(owner),
      },
      fields,
    });
  } catch (error: any) {
    console.error("Landwirt-Seite laden Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Landwirt-Seite konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const owner = await getActiveOwnerByToken(token);

    if (!owner) {
      return NextResponse.json(
        { error: "Dieser Landwirt-Link ist ungültig oder nicht mehr aktiv." },
        { status: 404 }
      );
    }

    const body = await req.json();

    const fieldIds: string[] = Array.isArray(body.fieldIds)
      ? body.fieldIds.map((id: unknown) => String(id)).filter(Boolean)
      : [];

    const mowingDateText = String(body.mowingDate || "").trim();
    const timeText = normalizeOptionalString(body.timeText);
    const note = normalizeOptionalString(body.note);

    if (fieldIds.length === 0) {
      return NextResponse.json(
        { error: "Bitte mindestens eine Fläche auswählen." },
        { status: 400 }
      );
    }

    if (!mowingDateText) {
      return NextResponse.json(
        { error: "Bitte ein Mähdatum auswählen." },
        { status: 400 }
      );
    }

    const mowingDate = parseDateOnlyToUtc(mowingDateText);

    const ownerFieldIds = new Set(owner.fields.map((field) => field.id));
    const invalidFieldIds = fieldIds.filter(
      (fieldId) => !ownerFieldIds.has(fieldId)
    );

    if (invalidFieldIds.length > 0) {
      return NextResponse.json(
        {
          error:
            "Eine oder mehrere ausgewählte Flächen gehören nicht zu diesem Besitzer.",
        },
        { status: 400 }
      );
    }

    const uniqueFieldIds = Array.from(new Set(fieldIds));

    const request = await db.mowingRequest.create({
      data: {
        ownerId: owner.id,
        mowingDate,
        timeText,
        note,
        status: "OFFEN",
        fields: {
          create: uniqueFieldIds.map((fieldId) => ({
            fieldId,
          })),
        },
      },
      include: {
        owner: true,
        fields: {
          include: {
            field: true,
          },
        },
      },
    });

    const ownerName = getOwnerLabel(owner);
    const selectedFieldLabels = request.fields.map((item) =>
      getFieldLabel(item.field)
    );

    await notifyAdminsAboutMowingRequest({
      ownerName,
      mowingDate,
      fieldCount: request.fields.length,
      fieldLabels: selectedFieldLabels,
    });

    return NextResponse.json({
      success: true,
      requestId: request.id,
      message: "Ihre Mähanfrage wurde übermittelt.",
      request: {
        id: request.id,
        mowingDate: request.mowingDate,
        timeText: request.timeText,
        note: request.note,
        status: request.status,
        fields: request.fields.map((item) => ({
          id: item.field.id,
          displayName: item.field.displayName,
          name: item.field.name,
        })),
      },
    });
  } catch (error: any) {
    console.error("Mähanfrage speichern Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Mähanfrage konnte nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}