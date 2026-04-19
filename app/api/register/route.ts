import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { geocodeAddress } from "@/lib/geocoding";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      firstName,
      lastName,
      street,
      zip,
      city,
      phone,
      email,
      password,
      registrationCode,
    } = body;

    if (
      !firstName?.trim() ||
      !lastName?.trim() ||
      !street?.trim() ||
      !zip?.trim() ||
      !city?.trim() ||
      !phone?.trim() ||
      !email?.trim() ||
      !password?.trim() ||
      !registrationCode?.trim()
    ) {
      return NextResponse.json(
        { error: "Bitte alle Felder ausfüllen." },
        { status: 400 }
      );
    }

    const envCode = (process.env.REGISTRATION_CODE || "").trim();
    const userCode = registrationCode.trim();

    if (!envCode) {
      return NextResponse.json(
        { error: "Registrierungscode ist auf dem Server nicht gesetzt." },
        { status: 500 }
      );
    }

    if (userCode !== envCode) {
      return NextResponse.json(
        { error: "Registrierungscode ist falsch." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Diese E-Mail-Adresse ist bereits registriert." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const geo = await geocodeAddress({
      street: street.trim(),
      zip: zip.trim(),
      city: city.trim(),
      country: "Deutschland",
    });

    await db.user.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        street: street.trim(),
        zip: zip.trim(),
        city: city.trim(),
        phone: phone.trim(),
        email: normalizedEmail,
        passwordHash,
        role: "SUCHER",
        isAdmin: false,
        isApproved: false,
        homeLatitude: geo?.lat ?? null,
        homeLongitude: geo?.lng ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Registrierung gespeichert. Ein Admin muss dich noch freigeben.",
      geocoded: !!geo,
    });
  } catch (error) {
    console.error("Fehler bei Registrierung:", error);
    return NextResponse.json(
      { error: "Registrierung fehlgeschlagen." },
      { status: 500 }
    );
  }
}