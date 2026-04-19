import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function normalizeOptionalString(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;

  const n = Number(value);

  if (!Number.isFinite(n)) {
    throw new Error("Ungültiger Zahlenwert.");
  }

  return n;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    if (!currentUser.isAdmin) {
      return NextResponse.json(
        { error: "Nur Admins dürfen Flächen bearbeiten." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();

    const existingField = await db.field.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });

    if (!existingField) {
      return NextResponse.json(
        { error: "Fläche nicht gefunden." },
        { status: 404 }
      );
    }

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "Flächenname fehlt." },
        { status: 400 }
      );
    }

    if (!body.displayName?.trim()) {
      return NextResponse.json(
        { error: "Anzeigename fehlt." },
        { status: 400 }
      );
    }

    if (!body.areaGeoJson) {
      return NextResponse.json(
        { error: "Fläche wurde nicht gezeichnet." },
        { status: 400 }
      );
    }

    const ownerId = normalizeOptionalString(body.ownerId);
    const notes = normalizeOptionalString(body.notes);
    const locationNote = normalizeOptionalString(body.locationNote);
    const locationLatitude = normalizeOptionalNumber(body.locationLatitude);
    const locationLongitude = normalizeOptionalNumber(body.locationLongitude);

    if ((locationLatitude === null) !== (locationLongitude === null)) {
      return NextResponse.json(
        { error: "Standortpunkt ist unvollständig." },
        { status: 400 }
      );
    }

    if (ownerId) {
      const ownerExists = await db.owner.findUnique({
        where: { id: ownerId },
        select: { id: true },
      });

      if (!ownerExists) {
        return NextResponse.json(
          { error: "Der ausgewählte Ansprechpartner wurde nicht gefunden." },
          { status: 400 }
        );
      }
    }

    const field = await db.field.update({
      where: { id },
      data: {
        name: body.name.trim(),
        displayName: body.displayName.trim(),
        notes,
        areaGeoJson: body.areaGeoJson,
        ownerId,
        locationLatitude,
        locationLongitude,
        locationNote,
      },
      include: {
        owner: true,
        orders: {
          include: {
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
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    const normalizedField = {
      ...field,
      orders: field.orders.map((order) => ({
        ...order,
        team: order.operationDayTeam?.team || null,
      })),
    };

    return NextResponse.json(normalizedField);
  } catch (error: any) {
    console.error("Fehler beim Aktualisieren der Fläche:", error);

    return NextResponse.json(
      { error: error?.message || "Fläche konnte nicht aktualisiert werden." },
      { status: 500 }
    );
  }
}