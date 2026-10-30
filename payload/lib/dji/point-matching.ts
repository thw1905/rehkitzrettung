/** GeoJSON point-in-polygon with holes/multipolygons; WGS84 [longitude, latitude]. */
type Point = [number, number];
type Polygon = Point[][];

type Geometry = { type?: string; coordinates?: unknown };

function isPosition(v: unknown): v is Point {
  return Array.isArray(v) && v.length >= 2 && typeof v[0] === "number" &&
    typeof v[1] === "number" && Number.isFinite(v[0]) && Number.isFinite(v[1]);
}
function isRing(v: unknown): v is Point[] {
  return Array.isArray(v) && v.length >= 4 && v.every(isPosition);
}
function onLine(p: Point, a: Point, b: Point): boolean {
  const [x, y] = p; const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  if (Math.abs(cross) > 1e-10) return false;
  return x >= Math.min(a[0], b[0]) - 1e-10 && x <= Math.max(a[0], b[0]) + 1e-10 &&
    y >= Math.min(a[1], b[1]) - 1e-10 && y <= Math.max(a[1], b[1]) + 1e-10;
}
function withinRing(p: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (onLine(p, a, b)) return true;
    const crossing = (a[1] > p[1]) !== (b[1] > p[1]) &&
      p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0];
    if (crossing) inside = !inside;
  }
  return inside;
}
function withinPolygon(p: Point, polygon: Polygon): boolean {
  if (!polygon.length || !isRing(polygon[0]) || !withinRing(p, polygon[0])) return false;
  // A point strictly in a hole is outside; a boundary is treated conservatively as outside.
  return polygon.slice(1).every((ring) => !isRing(ring) || !withinRing(p, ring));
}
export function pointInArea(lng: number, lat: number, geojson: unknown): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (!geojson || typeof geojson !== "object") return false;
  const obj = geojson as { type?: string; geometry?: Geometry; features?: unknown[]; coordinates?: unknown };
  if (obj.type === "FeatureCollection") return Array.isArray(obj.features) && obj.features.some((f) => pointInArea(lng, lat, f));
  const geo: Geometry = obj.type === "Feature" ? obj.geometry || {} : obj;
  const p: Point = [lng, lat];
  if (geo.type === "Polygon" && Array.isArray(geo.coordinates) && geo.coordinates.every(isRing)) {
    return withinPolygon(p, geo.coordinates as Polygon);
  }
  if (geo.type === "MultiPolygon" && Array.isArray(geo.coordinates)) {
    return geo.coordinates.some((poly) => Array.isArray(poly) && poly.every(isRing) && withinPolygon(p, poly as Polygon));
  }
  return false;
}
