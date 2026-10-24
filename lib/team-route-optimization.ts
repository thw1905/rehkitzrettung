/**
 * Routen-Näherung mit Luftlinienentfernung (Haversine). Kein Straßenrouting!
 * Fixiert den gewählten ersten Auftrag. Optimiert nur den verbleibenden offenen Pfad
 * zunächst per Next-Neighbor, danach mit 2-opt. Kein Rückweg zum Startpunkt.
 */
export type RouteStop = { id: string; lat: number | null; lon: number | null };

function valid(s: RouteStop): s is RouteStop & {lat: number; lon: number} {
  return typeof s.lat === "number" && Number.isFinite(s.lat) && s.lat >= -90 && s.lat <= 90 &&
         typeof s.lon === "number" && Number.isFinite(s.lon) && s.lon >= -180 && s.lon <= 180;
}

export function airDistanceKm(a: RouteStop, b: RouteStop): number {
  if (!valid(a) || !valid(b)) return Number.POSITIVE_INFINITY;
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat)*rad;
  const dlon = (b.lon - a.lon)*rad;
  const h = Math.sin(dlat / 2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0,1-h)));
}

export function optimizeRouteFixedFirst(stops: RouteStop[]): {
  ids: string[]; distanceKm: number | null; missingCoordinates: string[];
} {
  if (!stops.length) return {ids: [],distanceKm:0,missingCoordinates:[]};
  const [start, ...rest] = stops;
  if (!valid(start)) return {ids: stops.map(s=>s.id),distanceKm:null,missingCoordinates:stops.filter(s=>!valid(s)).map(s=>s.id)};
  const missingCoordinates = rest.filter(s=>!valid(s)).map(s=>s.id);
  const remaining = rest.filter(valid);
  const path: RouteStop[] = [start];
  while (remaining.length) {
    const previous = path[path.length - 1];
    let bestIndex = 0;
    for (let i=1;i<remaining.length;i++) {
      if (airDistanceKm(previous,remaining[i]) < airDistanceKm(previous,remaining[bestIndex])-1e-9) bestIndex = i;
    }
    path.push(remaining.splice(bestIndex,1)[0]);
  }
  // 2-opt: erster Auftrag bleibt verankert, ändert nur die Reihenfolge danach.
  for (let pass=0;pass<30;pass++) {
    let improved = false;
    for(let i=1;i<path.length-1;i++) {
      for(let j=i+1;j<path.length;j++) {
        const before = airDistanceKm(path[i-1],path[i]) + (j+1<path.length ? airDistanceKm(path[j],path[j+1]):0);
        const after = airDistanceKm(path[i-1],path[j]) + (j+1<path.length ? airDistanceKm(path[i],path[j+1]):0);
        if(after+1e-7 < before) {
          path.splice(i,j-i+1,...path.slice(i,j+1).reverse());
          improved = true;
        }
      }
    }
    if(!improved) break;
  }
  let distanceKm = 0;
  for(let i=1;i<path.length;i++) distanceKm += airDistanceKm(path[i-1],path[i]);
  return { ids: [...path.map(s=>s.id),...missingCoordinates], distanceKm, missingCoordinates };
}
