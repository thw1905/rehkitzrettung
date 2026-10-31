// REHKITZ_FLUGMISSION_V1 – DJI-Flugplanung; keine Aenderung bestehender DJI-Bindings.
// FLUGMISSION_PLAN_V1 – rein geometrische Vorplanung. Keine Freigabe fuer autonomen Flug.
export type LonLat = [number, number];
export type MissionOptions = { altitude: number; speed: number; spacing: number; direction: number; margin: number };
export type FlightLine = { start: LonLat; end: LonLat };
export type FlightPlan = {
  waypoints: LonLat[];
  lines: FlightLine[];
  transfers: FlightLine[];
  totalMeters: number;
  searchMeters: number;
  estimatedMinutes: number;
  warnings: string[];
};

type XY = {x:number;y:number};
const finite = (v:unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateOptions(o: MissionOptions): MissionOptions {
  if (!o || !finite(o.altitude) || o.altitude < 10 || o.altitude > 120) throw new Error("Hoehe muss zwischen 10 und 120 m liegen.");
  if (!finite(o.speed) || o.speed < 1 || o.speed > 12) throw new Error("Geschwindigkeit muss zwischen 1 und 12 m/s liegen.");
  if (!finite(o.spacing) || o.spacing < 1.5 || o.spacing > 220) throw new Error("Bahnabstand muss zwischen 1,5 und 220 m liegen.");
  if (!finite(o.margin) || o.margin < 0 || o.margin > 50) throw new Error("Randabstand muss zwischen 0 und 50 m liegen.");
  if (!finite(o.direction) || o.direction < 0 || o.direction >= 360) throw new Error("Richtung muss zwischen 0 und 359 Grad liegen.");
  return o;
}
function parsePolygons(input: unknown): LonLat[][][] {
  const value = input as {type?:unknown;geometry?:unknown;coordinates?:unknown}|null;
  const g = value?.type === "Feature" ? (value.geometry as {type?:unknown;coordinates?:unknown}|null) : value;
  if (!g || (g.type!=="Polygon" && g.type!=="MultiPolygon")) throw new Error("Die Flaeche enthaelt kein gueltiges Polygon.");
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  if (!Array.isArray(polygons) || polygons.length === 0 || polygons.length > 20) throw new Error("Ungueltige Polygon-Daten.");
  return polygons.map((polygon) => {
    if (!Array.isArray(polygon) || polygon.length < 1 || polygon.length > 30) throw new Error("Ungueltige Polygonringe.");
    return polygon.map((ring) => {
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > 4000) throw new Error("Polygonring ungueltig oder zu komplex.");
      const points: LonLat[] = ring.map((p) => {
        if (!Array.isArray(p) || p.length < 2 || !finite(p[0]) || !finite(p[1]) || Math.abs(p[0])>180 || Math.abs(p[1])>85)
          throw new Error("Ungueltige Koordinaten.");
        return [p[0],p[1]];
      });
      if (Math.abs(points[0][0] - points[points.length - 1][0]) > 1e-8 || Math.abs(points[0][1]-points[points.length-1][1])>1e-8) points.push(points[0]);
      return points;
    });
  });
}
const distance = (a: XY,b:XY) => Math.hypot(a.x-b.x,a.y-b.y);
export function createFlightPlan(input: unknown, rawOptions: MissionOptions): FlightPlan {
  const opts = validateOptions(rawOptions);
  const polygons = parsePolygons(input);
  const all = polygons.flat(2);
  const lon0 = all.reduce((s,p)=>s+p[0],0)/all.length;
  const lat0 = all.reduce((s,p)=>s+p[1],0)/all.length;
  const mx = 111320 * Math.cos(lat0*Math.PI/180);
  const my = 111132;
  if (mx < 10000) throw new Error("Nur Flaechen in gemaessigten Breiten werden unterstuetzt.");
  const angle = opts.direction*Math.PI/180, c=Math.cos(angle),s=Math.sin(angle);
  const rotate=(p:LonLat):XY=>{const x=(p[0]-lon0)*mx,y=(p[1]-lat0)*my;return {x:x*c+y*s,y:-x*s+y*c};};
  const back=(p:XY):LonLat=>{const x=p.x*c-p.y*s,y=p.x*s+p.y*c;return [lon0+x/mx,lat0+y/my];};
  const rings = polygons.map(poly=>poly.map(r=>r.map(rotate)));
  const allp=rings.flat(2);
  const minY=Math.min(...allp.map(p=>p.y)),maxY=Math.max(...allp.map(p=>p.y));
  if (!Number.isFinite(minY) || maxY-minY > 12000) throw new Error("Flaeche ist fuer diese Vorplanung zu gross.");
  const minX=Math.min(...allp.map(p=>p.x)),maxX=Math.max(...allp.map(p=>p.x));
  if(maxX-minX>12000) throw new Error("Flaeche ist fuer diese Vorplanung zu gross.");
  // Gerade/Polygon-Schnitt pro Ring (Even/Odd): Aussparungen werden nicht abgesucht.
  function intersects(ring: XY[],y:number):number[]{
    const xs:number[]=[];
    for(let i=0;i<ring.length-1;i++){
      const a=ring[i],b=ring[i+1];
      if((a.y<=y && b.y>y)||(b.y<=y && a.y>y)) xs.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));
    }
    return xs;
  }
  const lines:FlightLine[]=[];const ordered:XY[]=[];
  let reverse=false;
  for(let y=minY+Math.min(opts.spacing/2,(maxY-minY)/2),n=0;y<maxY-1e-7;y+=opts.spacing,n++){
    if(n>1000) throw new Error("Zu viele Flugbahnen.");
    const parts:{a:XY;b:XY}[]=[];
    for(const poly of rings){
      const xs=poly.flatMap(r=>intersects(r,y)).sort((a,b)=>a-b);
      if(xs.length%2!==0) throw new Error("Polygongeometrie kann nicht zugeordnet werden.");
      for(let j=0;j+1<xs.length;j+=2){
        const a=xs[j]+opts.margin,b=xs[j+1]-opts.margin;
        if(b-a>=Math.max(3,opts.spacing*.18)) parts.push({a:{x:a,y},b:{x:b,y}});
      }
    }
    parts.sort((a,b)=>a.a.x-b.a.x);
    if(reverse) parts.reverse();
    for(const part of parts){
      const a=reverse?part.b:part.a,b=reverse?part.a:part.b;
      ordered.push(a,b);lines.push({start:back(a),end:back(b)});
    }
    if(parts.length) reverse=!reverse;
    if(ordered.length>900) throw new Error("Mehr als 900 Wegpunkte; Bahnabstand vergrößern oder Fläche aufteilen.");
  }
  if(!lines.length || ordered.length<2) throw new Error("Flaeche zu schmal fuer diese Bahnabstaende/Randabstaende.");
  const transfers:FlightLine[]=[];
  let searchMeters=0,totalMeters=0;
  for(let i=0;i<ordered.length-1;i++){
    const len=distance(ordered[i],ordered[i+1]);totalMeters+=len;
    if(i%2===0) searchMeters+=len;
    else transfers.push({start:back(ordered[i]),end:back(ordered[i+1])});
  }
  const warnings = [
    "Nur Vorplanung: Hindernisse, Leitungen, Hoehenprofil, Flugverbotszonen und tatsaechliche Waermebildabdeckung sind nicht automatisch geprueft.",
    "Die Flughöhe ist relativ zum Startpunkt, nicht automatisch relativ zum Gelände. Pilot muss Mission in Pilot 2 pruefen.",
    "Verbindungsetappen zwischen Suchbahnen koennen ausserhalb der Flaeche liegen (rot gestrichelt dargestellt).",
    "Bildwinkelberechnung setzt Kamera senkrecht nach unten, unbeschnittenen Bildausschnitt und konstante Hoehe ueber Grund voraus. Diese Bedingungen sind NICHT durch den Export sichergestellt.",
  ];
  if(polygons.length>1 || polygons.some(p=>p.length>1)) warnings.push("Die Fläche hat mehrere Teile oder Innenringe. Ueberflugstrecken unbedingt kontrollieren.");
  return {waypoints:ordered.map(back),lines,transfers,totalMeters,searchMeters,estimatedMinutes:totalMeters/opts.speed/60,warnings};
}
