export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { area } from "@turf/turf";
import { db } from "@/lib/db";
import { getCurrentUserWithTeams } from "@/lib/current-user";

function safeAreaSqm(feature: unknown) {
  try {
    return area(feature as any);
  } catch {
    return 0;
  }
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

    const ownerId = req.nextUrl.searchParams.get("ownerId")?.trim() || "";

    if (!ownerId) {
      return NextResponse.json(
        { error: "Landwirt fehlt." },
        { status: 400 }
      );
    }

    const fields = await db.field.findMany({
      where: {
        ownerId,
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        locationNote: true,
        notes: true,
        areaGeoJson: true,
      },
      orderBy: [
        {
          displayName: "asc",
        },
        {
          name: "asc",
        },
      ],
    });

    return NextResponse.json({
      fields: fields.map((field) => {
        const areaSqm = safeAreaSqm(field.areaGeoJson);

        return {
          id: field.id,
          name: field.name,
          displayName: field.displayName,
          locationNote: field.locationNote,
          notes: field.notes,
          areaSqm,
          areaHa: areaSqm / 10000,
        };
      }),
    });
  } catch (error: any) {
    console.error("Flächen zum Landwirt laden Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Flächen zum Landwirt konnten nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}