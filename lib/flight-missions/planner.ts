// REHKITZ_DJI_FLUGPLANUNG_V3_4
// REHKITZ_FLUGMISSION_V1 – DJI-Flugplanung; keine Aenderung bestehender DJI-Bindings.
// FLUGMISSION_PLAN_V1 – rein geometrische Vorplanung. Keine Freigabe fuer autonomen Flug.
export type LonLat = [number, number];
export type MissionOptions = { altitude: number; speed: number; spacing: number; direction: number; margin: number;
  /** Automatically choose the angle using a time estimate; manual direction otherwise. */
  autoDirection?: boolean;
  /** Treat first search waypoint as proposed start (not the physical DJI home point). */
  autoStartAtFirst?: boolean;
  /** Request gentle turns at intermediate waypoints in M4T WPML. */
  smoothTurns?: boolean;
  /** Nominal perpendicular camera footprint width; derived server-side from camera profile. */
  coverageWidthM?: number;
};
export type FlightLine = { start: LonLat; end: LonLat };
export type FlightPlan = {
  waypoints: LonLat[];
  lines: FlightLine[];
  transfers: FlightLine[];
  totalMeters: number;
  searchMeters: number;
  estimatedMinutes: number;
  warnings: string[];
  /** Resolved search direction in degrees, 0–179 for automatic. */
  direction?:number;
  optimization?:{anglesEvaluated:number;estimatedSeconds:number};
  /** Every polygon point is inside a nominal straight-line footprint in this flat-ground model. */
  coverageComplete?: boolean;
};

type XY = {x:number;y:number};
const finite = (v:unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateOptions(o: MissionOptions): MissionOptions {
  if (!o || !finite(o.altitude) || o.altitude < 10 || o.altitude > 120) throw new Error("Hoehe muss zwischen 10 und 120 m liegen.");
  if (!finite(o.speed) || o.speed < 1 || o.speed > 12) throw new Error("Geschwindigkeit muss zwischen 1 und 12 m/s liegen.");
  if (!finite(o.spacing) || o.spacing < 1.5 || o.spacing > 220) throw new Error("Bahnabstand muss zwischen 1,5 und 220 m liegen.");
  if (!finite(o.margin) || o.margin < 0 || o.margin > 50) throw new Error("Randabstand muss zwischen 0 und 50 m liegen.");
  if (!finite(o.direction) || o.direction < 0 || o.direction >= 360) throw new Error("Richtung muss zwischen 0 und 359 Grad liegen.");
  if(!finite(o.coverageWidthM) || o.coverageWidthM<2 || o.coverageWidthM>400)throw new Error("Kamerabildbreite fehlt oder ist ungültig.");
  if(o.spacing>o.coverageWidthM*0.98)throw new Error("Bahnabstand zu groß für die Kameraabdeckung. Bitte verringern.");
  for(const key of ["autoDirection","autoStartAtFirst","smoothTurns"] as const)
    if(o[key]!==undefined && typeof o[key]!=="boolean")throw new Error("Ungültige Flugplan-Option: "+key);
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
function createFlightPlanAtAngle(input: unknown, rawOptions: MissionOptions, startPoint?: LonLat | null): FlightPlan {
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
  // V3.5.1: Abdeckungsorientierte Scanlinien.
  // Eine Kamera-Linie deckt einen rechteckigen Korridor mit nominaler Breite W ab.
  // Für jede Linie wird die ganze Polygongeometrie im Streifen [y-W/2,y+W/2]
  // projiziert. Somit kann keine Spitze hinter einer schrägen Polygonkante
  // verschwinden, wie bei einem Schnitt nur in der Linienmitte.
  // Innenlöcher sind bewusst nicht erlaubt: eine gerade Linie darüber könnte
  // einen explizit ausgeschlossenen Bereich überfliegen.
  if(polygons.some(poly=>poly.length!==1))
   throw new Error("Flächen mit Aussparungen brauchen eine getrennte Flugplanung; Abdeckung nicht bestätigt.");
  const width=opts.coverageWidthM!;
  const clearance=0.10; // rein geometrische Rechenreserve, keine Flugtoleranz
  const half=Math.max(0.1,width/2-clearance);
  const span=maxY-minY;
  // Jede Höhe der gesamten Fläche muss in mindestens einem Kamera-Band liegen.
  const ys:number[]=[];
  const begin=minY+Math.min(span/2,opts.spacing/2);
  if(span<1e-5)throw new Error("Fläche hat keine messbare Breite.");
  for(let y=begin,n=0;y<=maxY+1e-7;y+=opts.spacing,n++){
   if(n>1000)throw new Error("Zu viele Flugbahnen.");
   ys.push(y);
  }
  if(maxY-ys[ys.length-1]>half){
   const last=Math.max(ys[ys.length-1]+0.01,maxY-Math.min(opts.spacing/2,half));
   if(last>maxY+1e-5)throw new Error("Abdeckung am nördlichen Flächenrand unvollständig.");
   ys.push(last);
  }
  // In einem schmalen Streifen kann die y-Projektion der Außenkontur weiter
  // reichen als ihr Schnitt mit der Mittelachse. Um alle Ecken abzudecken,
  // ermitteln wir die extremen x-Werte jeder Polygonkante im ganzen Band.
  function extentsWithinBand(ring:XY[],low:number,high:number):{left:number;right:number}|null{
   let left=Infinity,right=-Infinity;
   const add=(x:number)=>{left=Math.min(left,x);right=Math.max(right,x);};
   for(let i=0;i<ring.length-1;i++){
    const a=ring[i],b=ring[i+1];
    const bottom=Math.max(low,Math.min(a.y,b.y));
    const top=Math.min(high,Math.max(a.y,b.y));
    if(bottom>top+1e-8)continue;
    if(Math.abs(a.y-b.y)<1e-10){
     if(a.y>=low-1e-8&&a.y<=high+1e-8){add(a.x);add(b.x);}
    }else{
     add(a.x+(bottom-a.y)*(b.x-a.x)/(b.y-a.y));
     add(a.x+(top-a.y)*(b.x-a.x)/(b.y-a.y));
    }
   }
   return Number.isFinite(left)&&Number.isFinite(right)?{left,right}:null;
  }
  const rows: Array<Array<{a:XY;b:XY}>>=[];
  for(const y of ys){
   const parts:{a:XY;b:XY}[]=[];
   for(const poly of rings){
    const ex=extentsWithinBand(poly[0],y-half,y+half);
    if(!ex)continue;
    // Kurven-WPML kann vor dem Bahnende mit dem Abbiegen beginnen.
    // Die geraden Bildstreifen werden daher nominell über den Polygonrand
    // verlängert; die tatsächliche Kurvenflugbahn bleibt gesondert zu prüfen.
    const endReserve=opts.smoothTurns ? Math.min(3,Math.max(0.75,width*0.06)) : 0.75;
    parts.push({a:{x:ex.left-endReserve,y},b:{x:ex.right+endReserve,y}});
   }
   parts.sort((a,b)=>a.a.x-b.a.x);
   if(parts.length) rows.push(parts);
  }
  if(rows.length===0)throw new Error("Für diese Fläche konnte keine abdeckende Route erzeugt werden.");
  // Geometrische Vollständigkeit prüfen: Jeder y-Abschnitt ist vom Kameraband
  // einer Zeile bedeckt. Die x-Grenzen jeder Zeile sind oben konservativ aus
  // der gesamten Polygonkontur innerhalb desselben Bandes berechnet.
  let coveredTo=minY;
  for(const row of rows){
   const y=row[0].a.y;
   if(y-half>coveredTo+1e-5)throw new Error("Kameraabdeckung hat eine Lücke zwischen den Suchbahnen.");
   coveredTo=Math.max(coveredTo,y+half);
  }
  if(coveredTo<maxY-1e-5)throw new Error("Kameraabdeckung am Flächenende unvollständig.");
  function candidate(rowsReversed:boolean,firstReverse:boolean){
    const sequence=rowsReversed?[...rows].reverse():rows;
    const ordered:XY[]=[];
    const lines:FlightLine[]=[];
    let reverse=firstReverse;
    for(const originalParts of sequence){
      const parts=reverse?[...originalParts].reverse():originalParts;
      for(const part of parts){
        const a=reverse?part.b:part.a,b=reverse?part.a:part.b;
        ordered.push(a,b);lines.push({start:back(a),end:back(b)});
      }
      reverse=!reverse;
      if(ordered.length>900)throw new Error("Mehr als 900 Wegpunkte; Bahnabstand vergroessern oder Flaeche aufteilen.");
    }
    const transfers:FlightLine[]=[];
    let searchMeters=0,totalMeters=0;
    for(let i=0;i<ordered.length-1;i++){
      const len=distance(ordered[i],ordered[i+1]);totalMeters+=len;
      if(i%2===0)searchMeters+=len;
      else transfers.push({start:back(ordered[i]),end:back(ordered[i+1])});
    }
    const waypointCoords=ordered.map(back);
    const startOk=startPoint && Array.isArray(startPoint) && startPoint.length===2 &&
      startPoint.every(v=>finite(v)) && Math.abs(startPoint[0])<=180 && Math.abs(startPoint[1])<=85;
    const startXY=startOk && !opts.autoStartAtFirst?rotate(startPoint):null;
    const approachMeters=startXY?distance(startXY,ordered[0]):0;
    const returnMeters=startXY?distance(ordered[ordered.length-1],startXY):0;
    const homeReturn=startXY?returnMeters:distance(ordered[ordered.length-1],ordered[0]);
    const allMeters=totalMeters+approachMeters+homeReturn;
    // 3 seconds per transition is a planning assumption, not a DJI flight simulation.
    const turns=Math.max(0,lines.length-1);
    const estimateSec=allMeters/opts.speed+turns*3;
    return {waypoints:waypointCoords,lines,transfers,totalMeters,searchMeters,
      estimatedMinutes:estimateSec/60,estimateSec,
      costMeters:allMeters};
  }
  const hasStart=startPoint && Array.isArray(startPoint) && startPoint.length===2 &&
    startPoint.every(v=>finite(v)) && Math.abs(startPoint[0])<=180 && Math.abs(startPoint[1])<=85;
  const useStart=hasStart && !opts.autoStartAtFirst;
  const candidates=useStart?[candidate(false,false),candidate(false,true),candidate(true,false),candidate(true,true)]:
    [candidate(false,false),candidate(false,true),candidate(true,false),candidate(true,true)];
  // Gleichstand: stabile erste Variante. Dadurch bleiben Ergebnisse reproduzierbar.
  const best=candidates.reduce((a,b)=>b.estimateSec<a.estimateSec-0.001?b:a);
  const warnings = [
    "Geodaten sind kein Hindernis- oder Flugfreigabenachweis.",
    "Hoehenreferenz und Flugroute vor Flug in Pilot 2 pruefen.",
    "Verbindungsetappen koennen ausserhalb der Flaeche liegen.",
    "Kameraabdeckung ist ein geometrisches Modell.",
  ];
  if(polygons.length>1 || polygons.some(p=>p.length>1)) warnings.push("Die Fläche hat mehrere Teile oder Innenringe. Ueberflugstrecken unbedingt kontrollieren.");
  return {waypoints:best.waypoints,lines:best.lines,transfers:best.transfers,totalMeters:best.totalMeters,searchMeters:best.searchMeters,estimatedMinutes:best.estimatedMinutes,warnings,direction:opts.direction,coverageComplete:true};
}

/** Search 0–179° using coarse directions plus refinements of the best three.
 * Only routes passing the conservative nominal-footprint geometry are scored.
 * This is the shortest estimated time among evaluated angles, not a global optimum.
 */
export function createFlightPlan(input:unknown,rawOptions:MissionOptions,startPoint?:LonLat|null):FlightPlan{
 const opts=validateOptions(rawOptions);
 if(!opts.autoDirection)return createFlightPlanAtAngle(input,opts,startPoint);
 const scores:Array<{angle:number;plan:FlightPlan;seconds:number}>=[];
 const seen=new Set<number>();
 let firstError:unknown=null;
 const evalAngle=(deg:number)=>{
  const angle=((Math.round(deg)%180)+180)%180;
  if(seen.has(angle))return;
  seen.add(angle);
  try{
   const plan=createFlightPlanAtAngle(input,{...opts,direction:angle,autoDirection:false},startPoint);
   const seconds=plan.estimatedMinutes*60;
   if(Number.isFinite(seconds))scores.push({angle,plan,seconds});
  }catch(e){if(!firstError)firstError=e;}
 };
 for(let a=0;a<180;a+=5)evalAngle(a);
 const top=[...scores].sort((a,b)=>a.seconds-b.seconds).slice(0,4);
 for(const item of top)for(let a=item.angle-4;a<=item.angle+4;a++)evalAngle(a);
 if(scores.length===0)throw firstError??new Error('Keine passende Flugrichtung gefunden.');
 const best=scores.sort((a,b)=>a.seconds-b.seconds||a.angle-b.angle)[0];
 return {...best.plan,optimization:{anglesEvaluated:seen.size,estimatedSeconds:best.seconds}};
}
