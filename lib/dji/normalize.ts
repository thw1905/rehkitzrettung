/** DJI Cloud API (Map Elements) sends GeoJSON coordinates as [longitude, latitude]. */
export type ParsedDjiPoint = {
  elementId: string;
  name: string;
  longitude: number;
  latitude: number;
};

export function parseDjiMapPoint(value: unknown): ParsedDjiPoint | null {
  if (!value || typeof value !== "object") return null;
  const element = value as Record<string, unknown>;
  const id = element.id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return null;
  if (!element.resource || typeof element.resource !== "object") return null;
  const resource = element.resource as Record<string, unknown>;
  // DJI resource.type 0 represents a map pin; 1/2 are line/polygon.
  if (resource.type !== 0) return null;
  if (!resource.content || typeof resource.content !== "object") return null;
  const content = resource.content as Record<string, unknown>;
  const geometry = content.geometry;
  if (!geometry || typeof geometry !== "object") return null;
  const geo = geometry as Record<string, unknown>;
  if (geo.type !== "Point" || !Array.isArray(geo.coordinates) || geo.coordinates.length < 2) return null;
  const [longitude, latitude] = geo.coordinates;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  const name = typeof element.name === "string" ? element.name.trim().slice(0, 120) : "";
  return { elementId: id, name: name || "DJI PinPoint", longitude, latitude };
}
