"use strict";
// DJI_FLIGHT_AREA_V11: GPS-Daten nur waehrend eines Fluges im RAM.
// Pro Auftrag/Flug wird nur aggregierte Flugzeit gespeichert, keine GPS-Spur.
const MAX_GAP_MS = 10000;
const MAX_SPEED_MPS = 45;
const AIR = new Set([3,4,5,6,7,8,9,10,11,12]);

function pointValid(lat, lon) {
  return typeof lat === "number" && typeof lon === "number" &&
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
}
function geometry(value) {
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { return []; } }
  if (!value || typeof value !== "object") return [];
  if (value.type === "Feature") return geometry(value.geometry);
  if (value.type === "FeatureCollection") return (value.features || []).flatMap(geometry);
  if (value.type === "Polygon") return [value.coordinates];
  if (value.type === "MultiPolygon") return value.coordinates || [];
  return [];
}
function onEdge(x, y, ax, ay, bx, by) {
  const cross = (x-ax)*(by-ay)-(y-ay)*(bx-ax);
  const eps = 1e-9;
  if (Math.abs(cross) > eps) return false;
  return x >= Math.min(ax,bx)-eps && x <= Math.max(ax,bx)+eps &&
    y >= Math.min(ay,by)-eps && y <= Math.max(ay,by)+eps;
}
function inRing(lon, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i], b=ring[j];
    if (!Array.isArray(a)||!Array.isArray(b)) continue;
    const xi=Number(a[0]),yi=Number(a[1]),xj=Number(b[0]),yj=Number(b[1]);
    if (![xi,yi,xj,yj].every(Number.isFinite)) continue;
    if (onEdge(lon,lat,xi,yi,xj,yj)) return true;
    if ((yi > lat) !== (yj > lat) && lon < (xj-xi)*(lat-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
function inPolygon(lon,lat,poly) {
  if (!Array.isArray(poly) || !poly.length || !inRing(lon,lat,poly[0])) return false;
  for (const hole of poly.slice(1)) if (inRing(lon,lat,hole)) return false;
  return true;
}
function matchesField(lon,lat,fieldGeoJson) {
  return pointValid(lat,lon) && geometry(fieldGeoJson).some(poly=>inPolygon(lon,lat,poly));
}
function haversine(a,b) {
  const r=Math.PI/180,R=6371000;
  const dLat=(b.latitude-a.latitude)*r, dLon=(b.longitude-a.longitude)*r;
  const x=Math.sin(dLat/2)**2 + Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dLon/2)**2;
  return R*2*Math.asin(Math.min(1,Math.sqrt(x)));
}
function classify(lon,lat,orders) {
  let matched=null;
  for (const o of orders) {
    if (!o.polys.some(poly=>inPolygon(lon,lat,poly))) continue;
    if (matched !== null && matched !== o.id) return {bucket:"AMBIGUOUS",orderId:null};
    matched=o.id;
  }
  return matched ? {bucket:"FIELD",orderId:matched} : {bucket:"OUTSIDE",orderId:null};
}
// Abschnitte grob nach 1-2 Sekunden bzw. maximal 25 m unterteilen.
// Unplausible Spruenge und Telemetrie-Luecken bleiben UNKNOWN.
function assignFlight(flight, samples, orders) {
  const total = Math.max(0,flight.flightSeconds|0);
  const durations=new Map();
  function add(bucket,orderId,seconds) {
    const key=orderId ? `FIELD:${orderId}` : bucket;
    const old=durations.get(key);
    durations.set(key,{bucket,orderId,seconds:(old?.seconds||0)+seconds});
  }
  const usable = samples.filter(s=>s.at>=flight.startedAt.getTime() && s.at<=flight.endedAt.getTime())
    .sort((a,b)=>a.at-b.at);
  const prepared=orders.map(o=>({id:o.id,polys:geometry(o.areaGeoJson)})).filter(o=>o.polys.length>0);
  if (prepared.length === 0) return [{bucket:"UNKNOWN",orderId:null,seconds:total}];
  for(let i=1;i<usable.length;i++) {
    const a=usable[i-1], b=usable[i];
    const dt=(b.at-a.at)/1000;
    if (!(dt>0)) continue;
    if (dt*1000>MAX_GAP_MS ||
      !pointValid(a.latitude,a.longitude)||!pointValid(b.latitude,b.longitude)) continue;
    const distance=haversine(a,b);
    if (distance/dt > MAX_SPEED_MPS) continue;
    const n=Math.min(80,Math.max(1,Math.ceil(dt/2),Math.ceil(distance/25)));
    for(let step=0;step<n;step++) {
      const t=(step+.5)/n;
      const lat=a.latitude+(b.latitude-a.latitude)*t;
      const lon=a.longitude+(b.longitude-a.longitude)*t;
      const {bucket,orderId}=classify(lon,lat,prepared);
      add(bucket,orderId,dt/n);
    }
  }
  const entries=[...durations.values()].map(x=>({...x,seconds:Math.round(x.seconds)}))
    .filter(x=>x.seconds>0);
  let assigned=entries.reduce((sum,x)=>sum+x.seconds,0);
  if(assigned>total) {
    let excess=assigned-total;
    for(const item of entries.sort((a,b)=>b.seconds-a.seconds)) {
      const cut=Math.min(excess,item.seconds);
      item.seconds-=cut; excess-=cut;
      if(excess===0) break;
    }
    assigned=total;
  }
  const unknown=total-assigned;
  if(unknown>0) entries.push({bucket:"UNKNOWN",orderId:null,seconds:unknown});
  return entries.filter(e=>e.seconds>0).sort((a,b)=>b.seconds-a.seconds);
}
class FlightTrace {
  constructor(){this.byAircraft=new Map();}
  clear(){this.byAircraft.clear();}
  record(sample) {
    const sn=sample.aircraftSerial;
    let trace=this.byAircraft.get(sn);
    if (!trace || trace.batterySerial!==sample.batterySerial ||
       sample.at<trace.lastAt || sample.at-trace.lastAt>30000) {
      trace={batterySerial:sample.batterySerial,lastAt:sample.at,samples:[]};
      this.byAircraft.set(sn,trace);
    }
    trace.lastAt=sample.at;
    if (Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude)) {
      trace.samples.push({at:sample.at,latitude:sample.latitude,longitude:sample.longitude, modeCode: sample.modeCode});
    }
    if (trace.samples.length>9000) trace.samples.splice(0,trace.samples.length-9000);
  }
  consume(flight) {
    const trace=this.byAircraft.get(flight.aircraftSerial);
    if(!trace||trace.batterySerial!==flight.batterySerial)return [];
    const samples=trace.samples.filter(s=>s.at>=flight.startedAt.getTime() && s.at<=flight.endedAt.getTime());
    trace.samples=[];
    return samples;
  }
}
function test() {
  const square=x=>({type:"Polygon",coordinates:[[[x,0],[x+.001,0],[x+.001,.001],[x,.001],[x,0]]]});
  const areas=[{id:"a",areaGeoJson:square(0)},{id:"b",areaGeoJson:square(.001)}];
  const flight={startedAt:new Date(0),endedAt:new Date(20000),flightSeconds:20};
  const samples=[0,2,4,6,8,10,12,14,16,18,20].map(n=>({at:n*1000,latitude:.0005,longitude:.0003+.0014*n/20}));
  const rows=assignFlight(flight,samples,areas);
  if(rows.reduce((s,r)=>s+r.seconds,0)!==20 || !rows.some(r=>r.orderId==="a") || !rows.some(r=>r.orderId==="b"))throw Error("Zwei-Flaechen-Test fehlgeschlagen");
  if(!matchesField(.0005,.0005,areas[0].areaGeoJson) || matchesField(.0015,.0005,areas[0].areaGeoJson))throw Error("GeoJSON-Test fehlgeschlagen");
  const hole={type:"Polygon",coordinates:[square(0).coordinates[0],[[.0004,.0004],[.0006,.0004],[.0006,.0006],[.0004,.0006],[.0004,.0004]]]};
  if(matchesField(.0005,.0005,hole))throw Error("Loch-Test fehlgeschlagen");
  const missing=assignFlight(flight,[{at:0,latitude:0,longitude:0}],areas);
  if(missing.length!==1 || missing[0].bucket!=="UNKNOWN" || missing[0].seconds!==20)throw Error("GPS-Luecken-Test fehlgeschlagen");
  return true;
}
module.exports={assignFlight,FlightTrace,matchesField,test};
