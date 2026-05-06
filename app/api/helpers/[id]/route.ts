import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { geocodeAddress } from "@/lib/geocoding";

function normalizeOptionalString(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizePriority(value: unknown) {
  const n = Number(value);

  if (!Number.isFinite(n)) return 0;

  const normalized = Math.floor(n);

  if (normalized < 0) return 0;
  if (normalized > 3) return 3;

  return normalized;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  if (!currentUser.isAdmin) {
    return NextResponse.json(
      { error: "Nur Admins dürfen Helfer bearbeiten." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const body = await req.json();

    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const street = normalizeOptionalString(body.street);
    const zip = normalizeOptionalString(body.zip);
    const city = normalizeOptionalString(body.city);
    const phone = normalizeOptionalString(body.phone);
    const email = String(body.email || "").trim().toLowerCase();

    let homeLatitude: number | null = null;
    let homeLongitude: number | null = null;

    if (street && zip && city) {
      const geo = await geocodeAddress({
        street,
        zip,
        city,
        country: "Deutschland",
      });

      homeLatitude = geo?.lat ?? null;
      homeLongitude = geo?.lng ?? null;
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        firstName,
        lastName,
        street,
        zip,
        city,
        phone,
        email,
        role: body.role,
        isAdmin: Boolean(body.isAdmin),
        isApproved: Boolean(body.isApproved),

        autoAssignPriority: normalizePriority(body.autoAssignPriority),
        isPrimaryPilot: Boolean(body.isPrimaryPilot),

        homeLatitude,
        homeLongitude,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Fehler beim Aktualisieren des Helfers:", error);

    return NextResponse.json(
      { error: error?.message || "Speichern fehlgeschlagen." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUserWithTeams();

  if (!currentUser) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  if (!currentUser.isAdmin) {
    return NextResponse.json(
      { error: "Nur Admins dürfen Helfer löschen." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;

    if (id === currentUser.id) {
      return NextResponse.json(
        { error: "Du kannst dich nicht selbst löschen." },
        { status: 400 }
      );
    }

    await db.webPushSubscription.deleteMany({ where: { userId: id } });
    await db.pushDevice.deleteMany({ where: { userId: id } });
    await db.availability.deleteMany({ where: { userId: id } });
    await db.operationDayTeamMember.deleteMany({ where: { userId: id } });

    await db.operationDayTeam.updateMany({
      where: { pilotId: id },
      data: { pilotId: null },
    });

    await db.user.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Fehler beim Löschen des Helfers:", error);

    return NextResponse.json(
      { error: error?.message || "Helfer konnte nicht gelöscht werden." },
      { status: 500 }
    );
  }
}