export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  area,
  booleanIntersects,
  featureCollection,
  intersect,
} from "@turf/turf";
import { getCurrentUserWithTeams } from "@/lib/current-user";
import { db } from "@/lib/db";

const MIN_OVERLAP_SQM = 1;

type GeoJsonAreaFeature =
  | GeoJSON.Feature<GeoJSON.Polygon>
  | GeoJSON.Feature<GeoJSON.MultiPolygon>;

function getRevierLabel(revier: {
  nummer?: string | null;
  name?: string | null;
}) {
  const nummer = (revier.nummer || "").trim();
  const name = (revier.name || "").trim();

  if (nummer && name) return `${nummer} · ${name}`;
  if (nummer) return nummer;
  if (name) return name;
  return "Unbekanntes Revier";
}

function isAreaFeature(value: any): value is GeoJsonAreaFeature {
  return (
    value &&
    value.type === "Feature" &&
    value.geometry &&
    (value.geometry.type === "Polygon" || value.geometry.type === "MultiPolygon") &&
    Array.isArray(value.geometry.coordinates)
  );
}

function safeAreaSqm(feature: any) {
  try {
    if (!isAreaFeature(feature)) return 0;

    const sqm = area(feature as any);
    return Number.isFinite(sqm) && sqm > 0 ? sqm : 0;
  } catch {
    return 0;
  }
}

function calculateOverlap(params: {
  revierGeoJson: any;
  fieldGeoJson: any;
}) {
  const { revierGeoJson, fieldGeoJson } = params;

  try {
    if (!isAreaFeature(revierGeoJson) || !isAreaFeature(fieldGeoJson)) {
      return null;
    }

    const fieldAreaSqm = safeAreaSqm(fieldGeoJson);

    if (fieldAreaSqm <= 0) {
      return null;
    }

    if (!booleanIntersects(revierGeoJson as any, fieldGeoJson as any)) {
  return null;
}

const intersection = intersect(
  featureCollection([revierGeoJson as any, fieldGeoJson as any]) as any
);

    if (!intersection) {
      return null;
    }

    const overlapSqm = safeAreaSqm(intersection);

    if (overlapSqm < MIN_OVERLAP_SQM) {
      return null;
    }

    return {
      overlapSqm,
      overlapPercent: (overlapSqm / fieldAreaSqm) * 100,
    };
  } catch (error) {
    console.error("Revier-Flächen-Überschneidung Fehler:", error);
    return null;
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

    const revierId = req.nextUrl.searchParams.get("revierId");

    const reviere = await db.revier.findMany({
      include: {
        paechter: {
          include: {
            pachter: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: [{ nummer: "asc" }, { name: "asc" }],
    });

    const normalizedReviere = reviere.map((revier) => ({
      id: revier.id,
      externalId: revier.externalId,
      name: revier.name,
      nummer: revier.nummer,
      label: getRevierLabel(revier),
      areaGeoJson: revier.areaGeoJson,
      paechter: revier.paechter.map((assignment) => ({
        id: assignment.id,
        pachter: assignment.pachter,
      })),
    }));

    if (!revierId) {
      return NextResponse.json({
        reviere: normalizedReviere,
        selectedRevier: null,
        fields: [],
      });
    }

    const selectedRevier = reviere.find((revier) => revier.id === revierId);

    if (!selectedRevier) {
      return NextResponse.json(
        { error: "Revier nicht gefunden." },
        { status: 404 }
      );
    }

    const fields = await db.field.findMany({
      include: {
        owner: true,
      },
      orderBy: [{ displayName: "asc" }, { name: "asc" }],
    });

    const matchingFields = fields
      .map((field) => {
        const overlap = calculateOverlap({
          revierGeoJson: selectedRevier.areaGeoJson,
          fieldGeoJson: field.areaGeoJson,
        });

        if (!overlap) return null;

        const areaSqm = safeAreaSqm(field.areaGeoJson);

        return {
          id: field.id,
          name: field.name,
          displayName: field.displayName,
          areaGeoJson: field.areaGeoJson,
          areaSqm,
          areaHa: areaSqm / 10000,
          overlapSqm: overlap.overlapSqm,
          overlapHa: overlap.overlapSqm / 10000,
          overlapPercent: overlap.overlapPercent,
          locationLatitude: field.locationLatitude,
          locationLongitude: field.locationLongitude,
          locationNote: field.locationNote,
          notes: field.notes,
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
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.overlapSqm - a.overlapSqm);

    const selectedRevierResponse = {
      id: selectedRevier.id,
      externalId: selectedRevier.externalId,
      name: selectedRevier.name,
      nummer: selectedRevier.nummer,
      label: getRevierLabel(selectedRevier),
      areaGeoJson: selectedRevier.areaGeoJson,
      paechter: selectedRevier.paechter.map((assignment) => ({
        id: assignment.id,
        pachter: assignment.pachter,
      })),
    };

    return NextResponse.json({
      reviere: normalizedReviere,
      selectedRevier: selectedRevierResponse,
      fields: matchingFields,
    });
  } catch (error: any) {
    console.error("Revierkarte laden Fehler:", error);

    return NextResponse.json(
      { error: error?.message || "Revierkarte konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}