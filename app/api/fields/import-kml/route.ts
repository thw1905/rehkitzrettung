import { NextRequest, NextResponse } from "next/server";
import { DOMParser } from "xmldom";
import { kml as toGeoJSON } from "@tmcw/togeojson";
import JSZip from "jszip";
import centroid from "@turf/centroid";
import area from "@turf/area";
import bbox from "@turf/bbox";
import { db } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin";

type ExistingFieldLite = {
  id: string;
  areaGeoJson: any;
};

type UploadPayload = {
  xmlText: string;
  takeoffPoint: { lat: number; lng: number } | null;
  documentName: string | null;
  firstWaypointPoint: { lat: number; lng: number } | null;
};

type FileImportResult = {
  fileName: string;
  importedCount: number;
  skippedCount: number;
  duplicateCount: number;
  meetingPointImported: boolean;
  error?: string;
};

function getFeatureName(
  feature: any,
  fallbackIndex: number,
  originalFileName: string
) {
  const properties = feature?.properties || {};

  const candidates = [
    properties.name,
    properties.Name,
    properties.title,
    properties.Title,
    properties.bezeichnung,
    properties.Bezeichnung,
    properties.label,
    properties.Label,
    properties.description,
    properties.Description,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const cleanFileName = originalFileName
    .replace(/\.(kml|kmz)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (cleanFileName.length > 0) {
    return cleanFileName;
  }

  return `Importiertes Feld ${fallbackIndex + 1}`;
}

function getFeatureCenter(feature: any) {
  try {
    const center = centroid(feature);
    const [lng, lat] = center.geometry.coordinates;
    return { lat, lng };
  } catch {
    return null;
  }
}

function getFeatureArea(feature: any) {
  try {
    return area(feature);
  } catch {
    return null;
  }
}

function getFeatureBbox(feature: any) {
  try {
    return bbox(feature);
  } catch {
    return null;
  }
}

function isLikelyDuplicate(params: {
  importedFeature: any;
  existingField: ExistingFieldLite;
}) {
  const importedCenter = getFeatureCenter(params.importedFeature);
  const existingCenter = getFeatureCenter(params.existingField.areaGeoJson);

  const importedArea = getFeatureArea(params.importedFeature);
  const existingArea = getFeatureArea(params.existingField.areaGeoJson);

  const importedBbox = getFeatureBbox(params.importedFeature);
  const existingBbox = getFeatureBbox(params.existingField.areaGeoJson);

  if (!importedCenter || !existingCenter || !importedArea || !existingArea) {
    return false;
  }

  const latDiff = Math.abs(importedCenter.lat - existingCenter.lat);
  const lngDiff = Math.abs(importedCenter.lng - existingCenter.lng);
  const areaDiffPercent =
    Math.abs(importedArea - existingArea) / Math.max(importedArea, existingArea);

  const bboxSimilar =
    importedBbox &&
    existingBbox &&
    importedBbox.length === 4 &&
    existingBbox.length === 4 &&
    Math.abs(importedBbox[0] - existingBbox[0]) < 0.0002 &&
    Math.abs(importedBbox[1] - existingBbox[1]) < 0.0002 &&
    Math.abs(importedBbox[2] - existingBbox[2]) < 0.0002 &&
    Math.abs(importedBbox[3] - existingBbox[3]) < 0.0002;

  return (
    latDiff < 0.00015 &&
    lngDiff < 0.00015 &&
    areaDiffPercent < 0.05 &&
    !!bboxSimilar
  );
}

function extractTakeoffPointFromAnyXml(xmlText: string) {
  const matches = [
    ...xmlText.matchAll(
      /<wpml:takeOffRefPoint>\s*([0-9.\-]+)\s*,\s*([0-9.\-]+)(?:\s*,\s*([0-9.\-]+))?\s*<\/wpml:takeOffRefPoint>/gi
    ),
  ];

  if (matches.length === 0) return null;

  const first = matches[0];
  const lat = Number(first[1]);
  const lng = Number(first[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function extractDocumentNameFromXml(xmlText: string) {
  const match = xmlText.match(/<Document>[\s\S]*?<name>\s*([^<]+)\s*<\/name>/i);
  return match?.[1]?.trim() || null;
}

function extractFirstWaypointPointFromXml(xmlText: string) {
  const placemarkMatches = [
    ...xmlText.matchAll(/<Placemark[\s\S]*?<\/Placemark>/gi),
  ];

  for (const placemarkMatch of placemarkMatches) {
    const placemark = placemarkMatch[0];

    const nameMatch = placemark.match(/<name>\s*([^<]+)\s*<\/name>/i);
    const name = nameMatch?.[1]?.trim().toLowerCase() || "";

    if (name !== "p1") continue;

    const coordinatesMatch = placemark.match(
      /<coordinates>\s*([0-9.\-]+)\s*,\s*([0-9.\-]+)(?:\s*,\s*([0-9.\-]+))?\s*<\/coordinates>/i
    );

    if (!coordinatesMatch) continue;

    const lng = Number(coordinatesMatch[1]);
    const lat = Number(coordinatesMatch[2]);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return null;
}

async function extractImportPayloadFromUpload(file: File): Promise<UploadPayload> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".kml")) {
    const xmlText = await file.text();

    return {
  xmlText,
  takeoffPoint: extractTakeoffPointFromAnyXml(xmlText),
  documentName: extractDocumentNameFromXml(xmlText),
  firstWaypointPoint: extractFirstWaypointPointFromXml(xmlText),
};
  }

  if (fileName.endsWith(".kmz")) {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const allEntries = Object.values(zip.files).filter((entry) => !entry.dir);

    const kmlEntry =
      allEntries.find((entry) =>
        entry.name.toLowerCase().endsWith("template.kml")
      ) ||
      allEntries.find((entry) => entry.name.toLowerCase().endsWith(".kml"));

    if (!kmlEntry) {
      throw new Error("In der KMZ-Datei wurde keine KML-Datei gefunden.");
    }

    const xmlText = await kmlEntry.async("text");

    let takeoffPoint: { lat: number; lng: number } | null = null;

    for (const entry of allEntries) {
      const lower = entry.name.toLowerCase();

      if (
        lower.endsWith(".kml") ||
        lower.endsWith(".wpml") ||
        lower.endsWith(".xml")
      ) {
        const text = await entry.async("text");
        const found = extractTakeoffPointFromAnyXml(text);

        if (found) {
          takeoffPoint = found;
          break;
        }
      }
    }

    return {
  xmlText,
  takeoffPoint,
  documentName: extractDocumentNameFromXml(xmlText),
  firstWaypointPoint: extractFirstWaypointPointFromXml(xmlText),
};
  }

  throw new Error("Nur KML- oder KMZ-Dateien sind erlaubt.");
}

async function importSingleFile(
  file: File,
  existingFields: ExistingFieldLite[]
): Promise<FileImportResult> {
  const { xmlText, takeoffPoint, documentName, firstWaypointPoint } =
  await extractImportPayloadFromUpload(file);

const meetingPoint = takeoffPoint || firstWaypointPoint;

  const kmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");
  const geojson = toGeoJSON(kmlDoc);

  let importedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;

  for (let index = 0; index < geojson.features.length; index++) {
    const feature = geojson.features[index];

    if (
      !feature.geometry ||
      (feature.geometry.type !== "Polygon" &&
        feature.geometry.type !== "MultiPolygon")
    ) {
      skippedCount++;
      continue;
    }

    const duplicate = existingFields.find((existingField) =>
      isLikelyDuplicate({
        importedFeature: feature,
        existingField,
      })
    );

    if (duplicate) {
      duplicateCount++;
      continue;
    }

    const rawFeatureName = getFeatureName(feature, index, file.name);

const fieldName =
  rawFeatureName.toLowerCase() === "area" && documentName
    ? documentName
    : rawFeatureName;

    const createdField = await db.field.create({
      data: {
        name: fieldName,
        displayName: fieldName,
        areaGeoJson: feature as any,
        notes: `Importiert aus ${file.name.toLowerCase().endsWith(".kmz") ? "KMZ" : "KML"}`,
        locationLatitude: meetingPoint?.lat ?? null,
locationLongitude: meetingPoint?.lng ?? null,
locationNote: takeoffPoint
  ? "Automatisch aus DJI Takeoff Point übernommen"
  : firstWaypointPoint
    ? "Automatisch aus erstem DJI-Wegpunkt übernommen"
    : null,
      },
    });

    existingFields.push({
      id: createdField.id,
      areaGeoJson: feature as any,
    });

    importedCount++;
  }

  return {
    fileName: file.name,
    importedCount,
    skippedCount,
    duplicateCount,
    meetingPointImported: !!meetingPoint,
  };
}

export async function POST(req: NextRequest) {
  const authCheck = await requireAdminApi();

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.message },
      { status: authCheck.status }
    );
  }

  try {
    const formData = await req.formData();
    const files = formData
      .getAll("files")
      .filter((file): file is File => file instanceof File);

    if (files.length === 0) {
      const singleFile = formData.get("file");

      if (singleFile instanceof File) {
        files.push(singleFile);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Keine KML- oder KMZ-Datei hochgeladen." },
        { status: 400 }
      );
    }

    const existingFields: ExistingFieldLite[] = await db.field.findMany({
      select: {
        id: true,
        areaGeoJson: true,
      },
    });

    const results: FileImportResult[] = [];

    for (const file of files) {
      try {
        const result = await importSingleFile(file, existingFields);
        results.push(result);
      } catch (error: any) {
        console.error(`Importfehler bei Datei ${file.name}:`, error);

        results.push({
          fileName: file.name,
          importedCount: 0,
          skippedCount: 0,
          duplicateCount: 0,
          meetingPointImported: false,
          error: error?.message || "Datei konnte nicht verarbeitet werden.",
        });
      }
    }

    const importedCount = results.reduce(
      (sum, item) => sum + item.importedCount,
      0
    );
    const skippedCount = results.reduce(
      (sum, item) => sum + item.skippedCount,
      0
    );
    const duplicateCount = results.reduce(
      (sum, item) => sum + item.duplicateCount,
      0
    );

    return NextResponse.json({
      success: true,
      fileCount: files.length,
      importedCount,
      skippedCount,
      duplicateCount,
      files: results,
      message: `${importedCount} Felder aus ${files.length} Datei(en) importiert.`,
    });
  } catch (error: any) {
    console.error("KML/KMZ Mehrfachimport Fehler:", error);

    return NextResponse.json(
      {
        error: error?.message || "Dateien konnten nicht verarbeitet werden.",
      },
      { status: 500 }
    );
  }
}