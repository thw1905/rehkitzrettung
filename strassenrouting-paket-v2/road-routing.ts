/**
 * Rehkitzrettung – Straßenrouten-Optimierung (Servercode für Next.js).
 *
 * Nutzt OpenRouteService/HeiGIT Matrix-API für Fahrzeiten zwischen Treffpunkten.
 * Der erste übergebene Auftrag bleibt IMMER auf Position 1.
 * Keine Prisma-Abhängigkeit: ID und GPS-Koordinaten vor dem Aufruf aus den
 * vorhandenen Tabellen ermitteln.
 *
 * WICHTIG: Nur auf dem Server verwenden! API-Key nicht an Clients weitergeben.
 */

export type RouteStop = {
  id: string;
  latitude: number;
  longitude: number;
};

export type RouteLeg = {
  fromId: string;
  toId: string;
  distanceKm: number;
  durationMinutes: number | null;
};

export type OptimizedRoadRoute = {
  orderedIds: string[];
  mode: "strasse" | "luftlinie";
  totalDistanceKm: number;
  totalDurationMinutes: number | null;
  legs: RouteLeg[];
  warning: string | null;
};

type CostMatrix = {
  distances: number[][]; // Meter
  durations: number[][] | null; // Sekunden, null nur bei Fallback
  mode: "strasse" | "luftlinie";
  warning: string | null;
};

const MATRIX_URL =
  "https://api.heigit.org/openrouteservice/v2/matrix/driving-car";
const MAX_POINTS = 25;
const EXACT_SOLVER_MAX_POINTS = 14;

function isValidStop(stop: RouteStop): boolean {
  return (
    typeof stop.id === "string" &&
    stop.id.trim().length > 0 &&
    Number.isFinite(stop.latitude) &&
    Number.isFinite(stop.longitude) &&
    Math.abs(stop.latitude) <= 90 &&
    Math.abs(stop.longitude) <= 180
  );
}

function haversineMeters(a: RouteStop, b: RouteStop): number {
  const r = 6_371_000;
  const toRad = Math.PI / 180;
  const lat1 = a.latitude * toRad;
  const lat2 = b.latitude * toRad;
  const dLat = (b.latitude - a.latitude) * toRad;
  const dLon = (b.longitude - a.longitude) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function fallbackMatrix(stops: RouteStop[], reason: string): CostMatrix {
  const distances = stops.map((a) =>
    stops.map((b) => haversineMeters(a, b)),
  );
  return {
    distances,
    durations: null,
    mode: "luftlinie",
    warning: `Straßenrouting nicht verfügbar (${reason}). Reihenfolge wurde per Luftlinie berechnet; Kilometer sind keine Straßenkilometer.`,
  };
}

function validMatrix(raw: unknown, n: number): number[][] | null {
  if (!Array.isArray(raw) || raw.length !== n) return null;
  const result: number[][] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length !== n) return null;
    const numbers: number[] = [];
    for (const x of row) {
      if (typeof x !== "number" || !Number.isFinite(x) || x < 0) {
        return null;
      }
      numbers.push(x);
    }
    result.push(numbers);
  }
  return result;
}

async function getCostMatrix(stops: RouteStop[]): Promise<CostMatrix> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY?.trim();
  if (!apiKey) return fallbackMatrix(stops, "API-Schlüssel fehlt");
  if (stops.length > MAX_POINTS) {
    return fallbackMatrix(
      stops,
      `mehr als ${MAX_POINTS} Aufträge – API-Anfrage bewusst begrenzt`,
    );
  }

  try {
    const response = await fetch(MATRIX_URL, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        // HeiGIT benötigt [Längengrad, Breitengrad], NICHT [lat, lon].
        locations: stops.map((p) => [p.longitude, p.latitude]),
        metrics: ["duration", "distance"],
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Routingdienst HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      durations?: unknown;
      distances?: unknown;
    };
    const durations = validMatrix(json.durations, stops.length);
    const distances = validMatrix(json.distances, stops.length);
    if (!durations || !distances) {
      throw new Error("keine vollständig befahrbare Straßenmatrix");
    }
    return { durations, distances, mode: "strasse", warning: null };
  } catch (error) {
    const description =
      error instanceof Error ? error.message : "unbekannter API-Fehler";
    return fallbackMatrix(stops, description);
  }
}

function pathCost(path: number[], costs: number[][]): number {
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    sum += costs[path[i - 1]][path[i]];
  }
  return sum;
}

/** Offene Route (keine Rückfahrt), festes erstes Ziel, exakte Optimierung. */
function exactPath(costs: number[][]): number[] {
  const n = costs.length;
  if (n <= 1) return [0];
  const m = n - 1;
  const states = 1 << m;
  const dp = Array.from({ length: states }, () =>
    new Float64Array(m).fill(Infinity),
  );
  const prev = Array.from({ length: states }, () =>
    new Int16Array(m).fill(-1),
  );
  for (let i = 0; i < m; i++) dp[1 << i][i] = costs[0][i + 1];

  for (let mask = 1; mask < states; mask++) {
    for (let last = 0; last < m; last++) {
      if ((mask & (1 << last)) === 0) continue;
      const oldCost = dp[mask][last];
      if (!Number.isFinite(oldCost)) continue;
      for (let next = 0; next < m; next++) {
        if (mask & (1 << next)) continue;
        const nextMask = mask | (1 << next);
        const nextCost = oldCost + costs[last + 1][next + 1];
        if (nextCost < dp[nextMask][next]) {
          dp[nextMask][next] = nextCost;
          prev[nextMask][next] = last;
        }
      }
    }
  }

  const full = states - 1;
  let bestEnd = 0;
  for (let i = 1; i < m; i++) {
    if (dp[full][i] < dp[full][bestEnd]) bestEnd = i;
  }

  const reversePath: number[] = [];
  let mask = full;
  let end = bestEnd;
  while (end !== -1) {
    reversePath.push(end + 1);
    const oldEnd = end;
    end = prev[mask][oldEnd];
    mask ^= 1 << oldEnd;
  }
  return [0, ...reversePath.reverse()];
}

/** Große Touren: greedy + wiederholte Richtungs-2-opt-Suche. */
function heuristicPath(costs: number[][]): number[] {
  const n = costs.length;
  const unused = new Set(Array.from({ length: n - 1 }, (_, i) => i + 1));
  let current = 0;
  const route = [0];
  while (unused.size > 0) {
    let best = -1;
    for (const candidate of unused) {
      if (best < 0 || costs[current][candidate] < costs[current][best]) {
        best = candidate;
      }
    }
    route.push(best);
    unused.delete(best);
    current = best;
  }

  let bestCost = pathCost(route, costs);
  let improved = true;
  let passes = 0;
  while (improved && passes++ < 30) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const candidate = [
          ...route.slice(0, i),
          ...route.slice(i, j + 1).reverse(),
          ...route.slice(j + 1),
        ];
        const candidateCost = pathCost(candidate, costs);
        if (candidateCost + 1e-7 < bestCost) {
          route.splice(0, route.length, ...candidate);
          bestCost = candidateCost;
          improved = true;
        }
      }
    }
  }
  return route;
}

/**
 * Optimiert die Auftragsreihenfolge, OHNE den ersten Auftrag zu verschieben.
 * Beim Setzen eines neuen Startauftrags diesen zuerst in `stops` setzen.
 *
 * Dauer ohne Umwege/Standzeiten, nur die Fahrt zwischen den Aufträgen.
 * Rückfahrt zum Teamtreffpunkt ist nicht enthalten.
 */
export async function optimizeTeamRoadRoute(
  stops: RouteStop[],
): Promise<OptimizedRoadRoute> {
  if (!Array.isArray(stops) || stops.some((s) => !isValidStop(s))) {
    throw new Error("Aufträge benötigen gültige Treffpunkt-Koordinaten und IDs.");
  }
  if (new Set(stops.map((s) => s.id)).size !== stops.length) {
    throw new Error("Auftrags-IDs müssen eindeutig sein.");
  }
  if (stops.length === 0) {
    return {
      orderedIds: [],
      mode: "strasse",
      legs: [],
      totalDistanceKm: 0,
      totalDurationMinutes: 0,
      warning: null,
    };
  }
  if (stops.length === 1) {
    return {
      orderedIds: [stops[0].id],
      mode: "strasse",
      legs: [],
      totalDistanceKm: 0,
      totalDurationMinutes: 0,
      warning: null,
    };
  }

  const matrix = await getCostMatrix(stops);
  const costs = matrix.durations ?? matrix.distances;
  const order =
    stops.length <= EXACT_SOLVER_MAX_POINTS
      ? exactPath(costs)
      : heuristicPath(costs);
  const legs: RouteLeg[] = [];
  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;
  for (let i = 1; i < order.length; i++) {
    const prev = order[i - 1];
    const next = order[i];
    const meters = matrix.distances[prev][next];
    const seconds = matrix.durations?.[prev][next] ?? null;
    totalDistanceMeters += meters;
    if (seconds !== null) totalDurationSeconds += seconds;
    legs.push({
      fromId: stops[prev].id,
      toId: stops[next].id,
      distanceKm: Math.round((meters / 1000) * 10) / 10,
      durationMinutes:
        seconds === null ? null : Math.round((seconds / 60) * 10) / 10,
    });
  }

  return {
    orderedIds: order.map((i) => stops[i].id),
    mode: matrix.mode,
    legs,
    totalDistanceKm: Math.round((totalDistanceMeters / 1000) * 10) / 10,
    totalDurationMinutes:
      matrix.durations === null
        ? null
        : Math.round((totalDurationSeconds / 60) * 10) / 10,
    warning: matrix.warning,
  };
}
