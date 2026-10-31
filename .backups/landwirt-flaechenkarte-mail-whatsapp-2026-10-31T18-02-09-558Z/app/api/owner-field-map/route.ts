export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { area } from "@turf/turf";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function getOwnerLabel(owner: {
  firstName?: string | null;
  lastName?: string | null;
}) {
  const name = [owner.firstName || "", owner.lastName || ""]
    .join(" ")
    .trim();

  return name || "Unbekannter Besitzer";
}

function safeAreaSqm(feature: any) {
  try {
    return area(feature);
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUserWithTeams();

    if (!currentUser) {
      return NextResponse.json(
        { error: "Nicht angemeldet." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get("ownerId") || "";

    const ownersRaw = await db.owner.findMany({
      include: {
        fields: {
          select: {
            id: true,
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const owners = ownersRaw.map((owner) => ({
      id: owner.id,
      firstName: owner.firstName,
      lastName: owner.lastName,
      street: owner.street,
      zip: owner.zip,
      city: owner.city,
      phone: owner.phone,
      email: owner.email,
      label: getOwnerLabel(owner),
      fieldCount: owner.fields.length,
    }));

    const selectedOwner = ownerId
      ? await db.owner.findUnique({
          where: {
            id: ownerId,
          },
        })
      : null;

    const fieldsRaw = ownerId
      ? await db.field.findMany({
          where: {
            ownerId,
          },
          include: {
            owner: true,
          },
          orderBy: [
            {
              displayName: "asc",
            },
            {
              name: "asc",
            },
          ],
        })
      : [];

    const fields = fieldsRaw.map((field) => {
      const areaSqm = safeAreaSqm(field.areaGeoJson);

      return {
        id: field.id,
        name: field.name,
        displayName: field.displayName,
        areaGeoJson: field.areaGeoJson,
        areaSqm,
        areaHa: areaSqm / 10000,
        locationLatitude: field.locationLatitude,
        locationLongitude: field.locationLongitude,
        locationNote: field.locationNote,
        notes: field.notes,
        owner: field.owner,
      };
    });

    return NextResponse.json({
      owners,
      selectedOwner: selectedOwner
        ? {
            id: selectedOwner.id,
            firstName: selectedOwner.firstName,
            lastName: selectedOwner.lastName,
            street: selectedOwner.street,
            zip: selectedOwner.zip,
            city: selectedOwner.city,
            phone: selectedOwner.phone,
            email: selectedOwner.email,
            label: getOwnerLabel(selectedOwner),
          }
        : null,
      fields,
    });
  } catch (error: any) {
    console.error("Besitzer-Flächenkarte Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Besitzer-Flächenkarte konnte nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}