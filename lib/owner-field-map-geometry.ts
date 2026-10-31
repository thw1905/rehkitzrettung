/** Gemeinsame, reine Geometriehilfen fuer Karte und PDF (kein Leaflet/DOM). */
export type OwnerAreaFeature =
  | GeoJSON.Feature<GeoJSON.Polygon>
  | GeoJSON.Feature<GeoJSON.MultiPolygon>;

export type Coordinate = [number, number]; // [longitude, latitude]

export function ownerFieldRings(feature: OwnerAreaFeature | null | undefined): Coordinate[][] {
  if (!feature?.geometry) return [];
  const geometry = feature.geometry;
  const sources = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return sources.flatMap((poly) => {
    const exterior = poly?.[0];
    if (!Array.isArray(exterior)) return [];
    const ring = exterior
      .filter((p): p is number[] => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map((p) => [p[0], p[1]] as Coordinate);
    return ring.length >= 3 ? [ring] : [];
  });
}

function isInside(point: Coordinate, ring: Coordinate[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function area(ring: Coordinate[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

/** Findet eine plausible Labelposition IM groessten Teilpolygon, auch bei konkaven Feldern. */
export function ownerFieldLabelPosition(feature: OwnerAreaFeature | null | undefined): Coordinate | null {
  const rings = ownerFieldRings(feature);
  if (!rings.length) return null;
  const ring = [...rings].sort((a, b) => area(b) - area(a))[0];
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const mid: Coordinate = [(minX + maxX) / 2, (minY + maxY) / 2];
  if (isInside(mid, ring)) return mid;
  // Bei verwinkelten Polygonen mit horizontalen Scanlinien einen innenliegenden Punkt ermitteln.
  let best: { point: Coordinate; width: number } | null = null;
  for (let step = 1; step <= 19; step++) {
    const y = minY + ((maxY - minY) * step) / 20;
    const intersections: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        intersections.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = intersections[i], right = intersections[i + 1];
      const point: Coordinate = [(left + right) / 2, y];
      if (isInside(point, ring) && (!best || right - left > best.width)) {
        best = { point, width: right - left };
      }
    }
  }
  if (best) return best.point;
  return ring[0];
}
