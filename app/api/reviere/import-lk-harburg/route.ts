export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

const WFS_URL =
  "https://gis.itk-harburg.de/arcgis/services/WMS/LKHarburg_Jagdbezirke/MapServer/WFSServer?service=WFS&version=2.0.0&request=GetFeature&typeNames=LKHarburg_Jagdbezirke%3AJagdbezirk&outputFormat=GEOJSON";

function normalizeString(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function findProperty(properties: Record<string, any>, possibleNames: string[]) {
  for (const name of possibleNames) {
    if (properties[name] !== undefined && properties[name] !== null) {
      return properties[name];
    }
  }

  const lowerMap = new Map<string, any>();

  for (const [key, value] of Object.entries(properties)) {
    lowerMap.set(key.toLowerCase(), value);
  }

  for (const name of possibleNames) {
    const value = lowerMap.get(name.toLowerCase());

    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
}

function getExternalId(feature: any, index: number) {
  const properties = feature?.properties || {};

  const value = findProperty(properties, [
    "GmlID",
    "gmlid",
    "GMLID",
    "OBJECTID",
    "objectid",
    "ObjectId",
    "FID",
    "fid",
    "id",
    "ID",
    "globalid",
    "GlobalID",
  ]);

  const normalized = normalizeString(value);

  return normalized || `lk-harburg-jagdbezirk-${index + 1}`;
}

function getRevierNummer(feature: any) {
  const properties = feature?.properties || {};

  const value = findProperty(properties, [
    "ART_NR",
    "art_nr",
    "Art_Nr",
    "nummer",
    "Nummer",
    "NUMMER",
    "nr",
    "Nr",
    "NR",
    "reviernummer",
    "Reviernummer",
    "jagdbezirksnummer",
    "Jagdbezirksnummer",
  ]);

  const normalized = normalizeString(value);

  return normalized || null;
}

function isPolygonFeature(feature: any) {
  const type = feature?.geometry?.type;

  return type === "Polygon" || type === "MultiPolygon";
}

export async function POST() {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const res = await fetch(WFS_URL, {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`WFS konnte nicht geladen werden: HTTP ${res.status}`);
    }

    const geojson = await res.json();

    if (!geojson || geojson.type !== "FeatureCollection") {
      throw new Error("WFS-Antwort ist kein gültiges GeoJSON.");
    }

    const features = Array.isArray(geojson.features)
      ? geojson.features
      : [];

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (let index = 0; index < features.length; index++) {
      const feature = features[index];

      if (!isPolygonFeature(feature)) {
        skipped++;
        continue;
      }

      const externalId = getExternalId(feature, index);
      const nummer = getRevierNummer(feature);
      const defaultName = nummer || `Revier ${index + 1}`;

      const existing = await db.revier.findUnique({
        where: {
          externalId,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (existing) {
        await db.revier.update({
          where: {
            id: existing.id,
          },
          data: {
            nummer,
            areaGeoJson: feature,
          },
        });

        updated++;
      } else {
        await db.revier.create({
          data: {
            externalId,
            name: defaultName,
            nummer,
            areaGeoJson: feature,
          },
        });

        imported++;
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      totalFeatures: features.length,
      message: `${imported} Reviere importiert, ${updated} aktualisiert, ${skipped} übersprungen.`,
    });
  } catch (error: any) {
    console.error("Revier-Import Fehler:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Reviere konnten nicht importiert werden.",
      },
      { status: 500 }
    );
  }
}