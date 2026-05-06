import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { geocodeAddress } from "@/lib/geocoding";

function normalizeString(value: unknown) {
  return String(value || "").trim();
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      street: true,
      zip: true,
      city: true,
      phone: true,
      email: true,
      role: true,
      isAdmin: true,
      isApproved: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Nutzer nicht gefunden." }, { status: 404 });
  }

  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  try {
    const body = await req.json();

    const firstName = normalizeString(body.firstName);
    const lastName = normalizeString(body.lastName);
    const street = normalizeString(body.street);
    const zip = normalizeString(body.zip);
    const city = normalizeString(body.city);
    const phone = normalizeString(body.phone);
    const email = normalizeString(body.email).toLowerCase();

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: "Vorname, Nachname und E-Mail müssen ausgefüllt sein." },
        { status: 400 }
      );
    }

    const currentUser = await db.user.findUnique({
      where: { email: session.user.email },
    });

    if (!currentUser) {
      return NextResponse.json({ error: "Nutzer nicht gefunden." }, { status: 404 });
    }

    const emailExists = await db.user.findFirst({
      where: {
        email,
        NOT: {
          id: currentUser.id,
        },
      },
    });

    if (emailExists) {
      return NextResponse.json(
        { error: "Diese E-Mail-Adresse wird bereits verwendet." },
        { status: 400 }
      );
    }

    let homeLatitude: number | null = currentUser.homeLatitude;
    let homeLongitude: number | null = currentUser.homeLongitude;

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
      where: { id: currentUser.id },
      data: {
        firstName,
        lastName,
        street,
        zip,
        city,
        phone,
        email,
        homeLatitude,
        homeLongitude,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        street: true,
        zip: true,
        city: true,
        phone: true,
        email: true,
        role: true,
        isAdmin: true,
        isApproved: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Profil speichern Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Profil konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}