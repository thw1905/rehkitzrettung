import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LatLng = {
  lat: number;
  lng: number;
};

type PowerLine = {
  id: string;
  type: "power-line";
  osmType: "way";
  osmId: number;
  name: string | null;
  power: string | null;
  voltage: string | null;
  operator: string | null;
  positions: [number, number][];
};

type PowerPoint = {
  id: string;
  type: "power-tower" | "power-pole";
  osmType: "node";
  osmId: number;
  name: string | null;
  power: string | null;
  voltage: string | null;
  operator: string | null;
  position: [number, number];
};

type CachedResult = {
  expiresAt: number;
  data: {
    powerLines: PowerLine[];
    powerPoints: PowerPoint[];
    count: number;
    bbox: {
      south: number;
      west: number;
      north: number;
      east: number;
    };
    fromCache?: boolean;
    warning?: string;
  };
};

const SEARCH_PADDING_METERS = 300;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 10 * 1000;
const OVERPASS_TIMEOUT_MS = 15000;

const cache = new Map<string, CachedResult>();

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCoordinate(coord: unknown): LatLng | null {
  if (!Array.isArray(coord) || coord.length < 2) return null;

  const lng = Number(coord[0]);
  const lat = Number(coord[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

function getPolygonCoordinates(areaGeoJson: any): LatLng[] {
  const geometry = areaGeoJson?.geometry;

  if (!geometry || geometry.type !== "Polygon") {
    return [];
  }

  const ring = geometry.coordinates?.[0];

  if (!Array.isArray(ring)) {
    return [];
  }

  return ring
    .map(normalizeCoordinate)
    .filter((coord): coord is LatLng => coord !== null);
}

function metersToLatitudeDegrees(meters: number) {
  return meters / 111_320;
}

function metersToLongitudeDegrees(meters: number, latitude: number) {
  const latitudeRad = (latitude * Math.PI) / 180;
  const metersPerDegree = 111_320 * Math.cos(latitudeRad);

  if (!Number.isFinite(metersPerDegree) || Math.abs(metersPerDegree) < 1) {
    return metersToLatitudeDegrees(meters);
  }

  return meters / metersPerDegree;
}

function getBoundingBox(points: LatLng[], paddingMeters = SEARCH_PADDING_METERS) {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;

  for (const point of points) {
    south = Math.min(south, point.lat);
    west = Math.min(west, point.lng);
    north = Math.max(north, point.lat);
    east = Math.max(east, point.lng);
  }

  if (
    !Number.isFinite(south) ||
    !Number.isFinite(west) ||
    !Number.isFinite(north) ||
    !Number.isFinite(east)
  ) {
    return null;
  }

  const centerLatitude = (south + north) / 2;
  const latPadding = metersToLatitudeDegrees(paddingMeters);
  const lngPadding = metersToLongitudeDegrees(paddingMeters, centerLatitude);

  return {
    south: Math.max(-90, south - latPadding),
    west: Math.max(-180, west - lngPadding),
    north: Math.min(90, north + latPadding),
    east: Math.min(180, east + lngPadding),
  };
}

function getCacheKey(bbox: {
  south: number;
  west: number;
  north: number;
  east: number;
}) {
  return [
    bbox.south.toFixed(5),
    bbox.west.toFixed(5),
    bbox.north.toFixed(5),
    bbox.east.toFixed(5),
    SEARCH_PADDING_METERS,
  ].join(":");
}

function buildOverpassQuery(bbox: {
  south: number;
  west: number;
  north: number;
  east: number;
}) {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  return `
[out:json][timeout:12];
(
  way["power"="line"](${box});
  way["power"="minor_line"](${box});
  node["power"="tower"](${box});
  node["power"="pole"](${box});
  node["power"="portal"](${box});
);
out tags geom;
`;
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "Rehkitzrettung/1.0 power-line-hazard-check",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOverpass(query: string) {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    try {
      const url = `${endpoint}?data=${encodeURIComponent(query)}`;

      const response = await fetchWithTimeout(url, OVERPASS_TIMEOUT_MS);
      const responseText = await response.text();

      if (!response.ok) {
        console.error(
          `Overpass Fehlerantwort von ${endpoint}:`,
          responseText.slice(0, 1200)
        );
        lastError = new Error(
          `Overpass-Abfrage fehlgeschlagen (${response.status}) bei ${endpoint}.`
        );
        continue;
      }

      try {
        return JSON.parse(responseText);
      } catch {
        console.error(
          `Overpass lieferte kein JSON von ${endpoint}:`,
          responseText.slice(0, 1200)
        );
        lastError = new Error("Overpass lieferte keine gültige JSON-Antwort.");
      }
    } catch (error: any) {
      if (error?.name === "AbortError") {
        console.warn(`Overpass-Zeitlimit nach ${OVERPASS_TIMEOUT_MS} ms bei ${endpoint}.`);
      } else {
        console.warn(`Overpass-Endpunkt nicht erreichbar: ${endpoint}`, error);
      }

      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error("Overpass-Abfrage fehlgeschlagen.");
}

function normalizePowerHazards(overpassJson: any): {
  powerLines: PowerLine[];
  powerPoints: PowerPoint[];
} {
  const elements = Array.isArray(overpassJson?.elements)
    ? overpassJson.elements
    : [];

  const powerLines = elements
    .filter((element: any) => element?.type === "way" && Array.isArray(element.geometry))
    .map((element: any): PowerLine | null => {
      const positions = element.geometry
        .map((point: any) => {
          const lat = Number(point?.lat);
          const lng = Number(point?.lon);

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          return [lat, lng] as [number, number];
        })
        .filter(Boolean) as [number, number][];

      if (positions.length < 2 || !isFiniteNumber(element.id)) {
        return null;
      }

      const tags = element.tags || {};

      return {
        id: `way-${element.id}`,
        type: "power-line",
        osmType: "way",
        osmId: element.id,
        name: typeof tags.name === "string" ? tags.name : null,
        power: typeof tags.power === "string" ? tags.power : null,
        voltage: typeof tags.voltage === "string" ? tags.voltage : null,
        operator: typeof tags.operator === "string" ? tags.operator : null,
        positions,
      };
    })
    .filter((line: PowerLine | null): line is PowerLine => line !== null);

  const powerPoints = elements
    .filter((element: any) => element?.type === "node")
    .map((element: any): PowerPoint | null => {
      const lat = Number(element?.lat);
      const lng = Number(element?.lon);
      const tags = element.tags || {};
      const power = typeof tags.power === "string" ? tags.power : null;

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        !isFiniteNumber(element.id) ||
        (power !== "tower" && power !== "pole" && power !== "portal")
      ) {
        return null;
      }

      return {
        id: `node-${element.id}`,
        type: power === "pole" ? "power-pole" : "power-tower",
        osmType: "node",
        osmId: element.id,
        name: typeof tags.name === "string" ? tags.name : null,
        power,
        voltage: typeof tags.voltage === "string" ? tags.voltage : null,
        operator: typeof tags.operator === "string" ? tags.operator : null,
        position: [lat, lng],
      };
    })
    .filter((point: PowerPoint | null): point is PowerPoint => point !== null);

  return {
    powerLines,
    powerPoints,
  };
}

function cleanupCache() {
  const now = Date.now();

  for (const [key, value] of cache.entries()) {
    if (value.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    cleanupCache();

    const body = await req.json();
    const areaGeoJson = body?.areaGeoJson;

    const points = getPolygonCoordinates(areaGeoJson);

    if (points.length < 3) {
      return NextResponse.json(
        { error: "Flächen-Geometrie fehlt oder ist ungültig." },
        { status: 400 }
      );
    }

    const bbox = getBoundingBox(points, SEARCH_PADDING_METERS);

    if (!bbox) {
      return NextResponse.json(
        { error: "Kartenbereich konnte nicht berechnet werden." },
        { status: 400 }
      );
    }

    const cacheKey = getCacheKey(bbox);
    const cached = cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({
        ...cached.data,
        fromCache: true,
      });
    }

    const query = buildOverpassQuery(bbox);

    try {
      const overpassJson = await fetchOverpass(query);
      const { powerLines, powerPoints } = normalizePowerHazards(overpassJson);

      const data = {
        powerLines,
        powerPoints,
        count: powerLines.length + powerPoints.length,
        bbox,
        fromCache: false,
      };

      cache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data,
      });

      return NextResponse.json(data);
    } catch (error: any) {
      console.warn("Overpass konnte nicht geladen werden, Karte bleibt nutzbar:", error);

      const fallbackData = {
        powerLines: [],
        powerPoints: [],
        count: 0,
        bbox,
        fromCache: false,
        warning:
          "Stromleitungsdaten konnten gerade nicht geladen werden. Bitte vor Ort prüfen.",
      };

      cache.set(cacheKey, {
        expiresAt: Date.now() + ERROR_CACHE_TTL_MS,
        data: fallbackData,
      });

      return NextResponse.json(fallbackData);
    }
  } catch (error: any) {
    console.error("Fehler beim Laden der Stromleitungen:", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Stromleitungen konnten nicht geladen werden.",
      },
      { status: 500 }
    );
  }
}