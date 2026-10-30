"use strict";
// DJI_FLIGHT_AREA_V11_INSTALLER: backup + atomic narrow patches, no DB migration.
const fs=require("node:fs"), path=require("node:path");
const root=process.cwd();
const dry=process.argv.includes("--check");
const oldSchema="prisma/schema.prisma", oldParser="lib/dji/flight-history-v10.cjs", oldWorker="scripts/dji-akku-fluege-v10.cjs";
const files={"area": "\"use strict\";\n// DJI_FLIGHT_AREA_V11: GPS-Daten nur waehrend eines Fluges im RAM.\n// Pro Auftrag/Flug wird nur aggregierte Flugzeit gespeichert, keine GPS-Spur.\nconst MAX_GAP_MS = 10000;\nconst MAX_SPEED_MPS = 45;\nconst AIR = new Set([3,4,5,6,7,8,9,10,11,12]);\n\nfunction pointValid(lat, lon) {\n  return typeof lat === \"number\" && typeof lon === \"number\" &&\n    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 &&\n    Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);\n}\nfunction geometry(value) {\n  if (typeof value === \"string\") { try { value = JSON.parse(value); } catch { return []; } }\n  if (!value || typeof value !== \"object\") return [];\n  if (value.type === \"Feature\") return geometry(value.geometry);\n  if (value.type === \"FeatureCollection\") return (value.features || []).flatMap(geometry);\n  if (value.type === \"Polygon\") return [value.coordinates];\n  if (value.type === \"MultiPolygon\") return value.coordinates || [];\n  return [];\n}\nfunction onEdge(x, y, ax, ay, bx, by) {\n  const cross = (x-ax)*(by-ay)-(y-ay)*(bx-ax);\n  const eps = 1e-9;\n  if (Math.abs(cross) > eps) return false;\n  return x >= Math.min(ax,bx)-eps && x <= Math.max(ax,bx)+eps &&\n    y >= Math.min(ay,by)-eps && y <= Math.max(ay,by)+eps;\n}\nfunction inRing(lon, lat, ring) {\n  if (!Array.isArray(ring) || ring.length < 3) return false;\n  let inside = false;\n  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {\n    const a=ring[i], b=ring[j];\n    if (!Array.isArray(a)||!Array.isArray(b)) continue;\n    const xi=Number(a[0]),yi=Number(a[1]),xj=Number(b[0]),yj=Number(b[1]);\n    if (![xi,yi,xj,yj].every(Number.isFinite)) continue;\n    if (onEdge(lon,lat,xi,yi,xj,yj)) return true;\n    if ((yi > lat) !== (yj > lat) && lon < (xj-xi)*(lat-yi)/(yj-yi)+xi) inside=!inside;\n  }\n  return inside;\n}\nfunction inPolygon(lon,lat,poly) {\n  if (!Array.isArray(poly) || !poly.length || !inRing(lon,lat,poly[0])) return false;\n  for (const hole of poly.slice(1)) if (inRing(lon,lat,hole)) return false;\n  return true;\n}\nfunction matchesField(lon,lat,fieldGeoJson) {\n  return pointValid(lat,lon) && geometry(fieldGeoJson).some(poly=>inPolygon(lon,lat,poly));\n}\nfunction haversine(a,b) {\n  const r=Math.PI/180,R=6371000;\n  const dLat=(b.latitude-a.latitude)*r, dLon=(b.longitude-a.longitude)*r;\n  const x=Math.sin(dLat/2)**2 + Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dLon/2)**2;\n  return R*2*Math.asin(Math.min(1,Math.sqrt(x)));\n}\nfunction classify(lon,lat,orders) {\n  let matched=null;\n  for (const o of orders) {\n    if (!o.polys.some(poly=>inPolygon(lon,lat,poly))) continue;\n    if (matched !== null && matched !== o.id) return {bucket:\"AMBIGUOUS\",orderId:null};\n    matched=o.id;\n  }\n  return matched ? {bucket:\"FIELD\",orderId:matched} : {bucket:\"OUTSIDE\",orderId:null};\n}\n// Abschnitte grob nach 1-2 Sekunden bzw. maximal 25 m unterteilen.\n// Unplausible Spruenge und Telemetrie-Luecken bleiben UNKNOWN.\nfunction assignFlight(flight, samples, orders) {\n  const total = Math.max(0,flight.flightSeconds|0);\n  const durations=new Map();\n  function add(bucket,orderId,seconds) {\n    const key=orderId ? `FIELD:${orderId}` : bucket;\n    const old=durations.get(key);\n    durations.set(key,{bucket,orderId,seconds:(old?.seconds||0)+seconds});\n  }\n  const usable = samples.filter(s=>s.at>=flight.startedAt.getTime() && s.at<=flight.endedAt.getTime())\n    .sort((a,b)=>a.at-b.at);\n  const prepared=orders.map(o=>({id:o.id,polys:geometry(o.areaGeoJson)})).filter(o=>o.polys.length>0);\n  if (prepared.length === 0) return [{bucket:\"UNKNOWN\",orderId:null,seconds:total}];\n  for(let i=1;i<usable.length;i++) {\n    const a=usable[i-1], b=usable[i];\n    const dt=(b.at-a.at)/1000;\n    if (!(dt>0)) continue;\n    if (dt*1000>MAX_GAP_MS ||\n      !pointValid(a.latitude,a.longitude)||!pointValid(b.latitude,b.longitude)) continue;\n    const distance=haversine(a,b);\n    if (distance/dt > MAX_SPEED_MPS) continue;\n    const n=Math.min(80,Math.max(1,Math.ceil(dt/2),Math.ceil(distance/25)));\n    for(let step=0;step<n;step++) {\n      const t=(step+.5)/n;\n      const lat=a.latitude+(b.latitude-a.latitude)*t;\n      const lon=a.longitude+(b.longitude-a.longitude)*t;\n      const {bucket,orderId}=classify(lon,lat,prepared);\n      add(bucket,orderId,dt/n);\n    }\n  }\n  const entries=[...durations.values()].map(x=>({...x,seconds:Math.round(x.seconds)}))\n    .filter(x=>x.seconds>0);\n  let assigned=entries.reduce((sum,x)=>sum+x.seconds,0);\n  if(assigned>total) {\n    let excess=assigned-total;\n    for(const item of entries.sort((a,b)=>b.seconds-a.seconds)) {\n      const cut=Math.min(excess,item.seconds);\n      item.seconds-=cut; excess-=cut;\n      if(excess===0) break;\n    }\n    assigned=total;\n  }\n  const unknown=total-assigned;\n  if(unknown>0) entries.push({bucket:\"UNKNOWN\",orderId:null,seconds:unknown});\n  return entries.filter(e=>e.seconds>0).sort((a,b)=>b.seconds-a.seconds);\n}\nclass FlightTrace {\n  constructor(){this.byAircraft=new Map();}\n  clear(){this.byAircraft.clear();}\n  record(sample) {\n    const sn=sample.aircraftSerial;\n    let trace=this.byAircraft.get(sn);\n    if (!trace || trace.batterySerial!==sample.batterySerial ||\n       sample.at<trace.lastAt || sample.at-trace.lastAt>30000) {\n      trace={batterySerial:sample.batterySerial,lastAt:sample.at,samples:[]};\n      this.byAircraft.set(sn,trace);\n    }\n    trace.lastAt=sample.at;\n    if (Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude)) {\n      trace.samples.push({at:sample.at,latitude:sample.latitude,longitude:sample.longitude, modeCode: sample.modeCode});\n    }\n    if (trace.samples.length>9000) trace.samples.splice(0,trace.samples.length-9000);\n  }\n  consume(flight) {\n    const trace=this.byAircraft.get(flight.aircraftSerial);\n    if(!trace||trace.batterySerial!==flight.batterySerial)return [];\n    const samples=trace.samples.filter(s=>s.at>=flight.startedAt.getTime() && s.at<=flight.endedAt.getTime());\n    trace.samples=[];\n    return samples;\n  }\n}\nfunction test() {\n  const square=x=>({type:\"Polygon\",coordinates:[[[x,0],[x+.001,0],[x+.001,.001],[x,.001],[x,0]]]});\n  const areas=[{id:\"a\",areaGeoJson:square(0)},{id:\"b\",areaGeoJson:square(.001)}];\n  const flight={startedAt:new Date(0),endedAt:new Date(20000),flightSeconds:20};\n  const samples=[0,2,4,6,8,10,12,14,16,18,20].map(n=>({at:n*1000,latitude:.0005,longitude:.0003+.0014*n/20}));\n  const rows=assignFlight(flight,samples,areas);\n  if(rows.reduce((s,r)=>s+r.seconds,0)!==20 || !rows.some(r=>r.orderId===\"a\") || !rows.some(r=>r.orderId===\"b\"))throw Error(\"Zwei-Flaechen-Test fehlgeschlagen\");\n  if(!matchesField(.0005,.0005,areas[0].areaGeoJson) || matchesField(.0015,.0005,areas[0].areaGeoJson))throw Error(\"GeoJSON-Test fehlgeschlagen\");\n  const hole={type:\"Polygon\",coordinates:[square(0).coordinates[0],[[.0004,.0004],[.0006,.0004],[.0006,.0006],[.0004,.0006],[.0004,.0004]]]};\n  if(matchesField(.0005,.0005,hole))throw Error(\"Loch-Test fehlgeschlagen\");\n  const missing=assignFlight(flight,[{at:0,latitude:0,longitude:0}],areas);\n  if(missing.length!==1 || missing[0].bucket!==\"UNKNOWN\" || missing[0].seconds!==20)throw Error(\"GPS-Luecken-Test fehlgeschlagen\");\n  return true;\n}\nmodule.exports={assignFlight,FlightTrace,matchesField,test};\n", "page": "// DJI_FLIGHT_AREA_V11: aggregierte GPS-Flugzeiten je Feld/Auftrag (nur Admin).\nimport Link from \"next/link\";\nimport { redirect } from \"next/navigation\";\nimport { getCurrentUserWithTeams } from \"@/lib/current-user\";\nimport { db } from \"@/lib/db\";\n\nexport const dynamic = \"force-dynamic\";\nexport const metadata = { title: \"DJI Flugzeiten je Flaeche – Rehkitzrettung\" };\nconst berlin = new Intl.DateTimeFormat(\"de-DE\", {timeZone:\"Europe/Berlin\",dateStyle:\"short\",timeStyle:\"short\"});\nfunction duration(s: number) { return `${Math.floor(s/60)} Min. ${String(s%60).padStart(2,\"0\")} Sek.`; }\nfunction label(bucket: string) {\n  return bucket === \"OUTSIDE\" ? \"Außerhalb der Flächen\" :\n    bucket === \"AMBIGUOUS\" ? \"Mehrere Flächen – ungeklärt\" :\n    bucket === \"UNKNOWN\" ? \"GPS fehlt / nicht zuordenbar\" : \"Fläche\";\n}\nexport default async function DjiFlightAreaPage() {\n  const user = await getCurrentUserWithTeams();\n  if (!user?.isApproved || !user.isAdmin) redirect(\"/\");\n  const entries = await db.djiFlightAreaTime.findMany({orderBy:{createdAt:\"desc\"},take:500});\n  const flightIds = [...new Set(entries.map(e => e.flightUsageId))];\n  const orderIds = [...new Set(entries.map(e => e.orderId).filter((id):id is string=>!!id))];\n  const [flights,orders] = await Promise.all([\n    db.djiBatteryUsage.findMany({where:{id:{in:flightIds}},select:{id:true,aircraftId:true,batteryId:true,startedAt:true,flightSeconds:true}}),\n    db.order.findMany({where:{id:{in:orderIds}},select:{id:true,orderCode:true,title:true}}),\n  ]);\n  const aircraftIds = [...new Set(flights.map(f=>f.aircraftId))];\n  const aircraft = await db.djiAircraft.findMany({where:{id:{in:aircraftIds}},select:{id:true,label:true}});\n  const byFlight = new Map(flights.map(f=>[f.id,f]));\n  const byOrder = new Map(orders.map(o=>[o.id,o]));\n  const byAircraft = new Map(aircraft.map(a=>[a.id,a.label]));\n  const totals = new Map<string,{name:string,seconds:number}>();\n  for(const e of entries) {\n    const o=e.orderId ? byOrder.get(e.orderId) : null;\n    const name=o ? `${o.orderCode || o.title || \"Auftrag\"}` : label(e.bucket);\n    const key=e.orderId || `BUCKET:${e.bucket}`;\n    const old=totals.get(key);\n    totals.set(key,{name,seconds:(old?.seconds||0)+e.seconds});\n  }\n  return (\n    <main className=\"mx-auto max-w-5xl space-y-6 px-4 py-6\">\n      <header className=\"rounded-xl bg-slate-900 px-5 py-4 text-white\">\n        <h1 className=\"text-2xl font-bold\">DJI-Flugzeiten je Fläche</h1>\n        <p className=\"mt-2 text-sm text-slate-200\">GPS-basierte Näherungswerte. Unklare Positionen bleiben ungeklärt, nicht einem Auftrag zugeschlagen.</p>\n        <div className=\"mt-3 flex flex-wrap gap-2\">\n          <Link href=\"/admin/dji-akku-historie\" className=\"rounded border border-slate-300 px-3 py-1.5 text-sm\">Akkuhistorie</Link>\n          <Link href=\"/admin/dji-akkus\" className=\"rounded border border-slate-300 px-3 py-1.5 text-sm\">Akkuverwaltung</Link>\n        </div>\n      </header>\n      <section className=\"rounded-xl border bg-white p-4\">\n        <h2 className=\"mb-3 text-lg font-semibold\">Summen aus den letzten {flightIds.length} Flügen</h2>\n        {totals.size===0 ? <p className=\"text-slate-600\">Noch keine GPS-Flugzeiten erfasst. Erst Flüge nach Aktivierung von V11 erscheinen hier.</p> :\n          <table className=\"w-full text-left text-sm\"><thead><tr className=\"border-b\"><th className=\"py-2\">Fläche / Zuordnung</th><th className=\"py-2 text-right\">Flugzeit</th></tr></thead>\n          <tbody>{[...totals.values()].sort((a,b)=>b.seconds-a.seconds).map((t,i)=><tr key={i} className=\"border-b last:border-b-0\"><td className=\"py-2\">{t.name}</td><td className=\"py-2 text-right tabular-nums\">{duration(t.seconds)}</td></tr>)}</tbody></table>\n        }\n      </section>\n      {entries.length>0 && <section className=\"rounded-xl border bg-white p-4\">\n        <h2 className=\"mb-3 text-lg font-semibold\">Einzelzuordnungen</h2>\n        <div className=\"overflow-x-auto\"><table className=\"w-full text-left text-sm\"><thead><tr className=\"border-b\"><th className=\"py-2 pr-3\">Flugbeginn</th><th className=\"pr-3\">Drohne</th><th className=\"pr-3\">Auftrag / Bereich</th><th className=\"text-right\">Zeit</th></tr></thead>\n        <tbody>{entries.map(e=>{\n          const f=byFlight.get(e.flightUsageId);\n          const o=e.orderId?byOrder.get(e.orderId):null;\n          return <tr key={e.id} className=\"border-b last:border-b-0\"><td className=\"py-2 pr-3 whitespace-nowrap\">{f?berlin.format(f.startedAt):\"Unbekannt\"}</td><td className=\"pr-3\">{f?(byAircraft.get(f.aircraftId)||\"Drohne\"):\"–\"}</td><td className=\"pr-3\">{o?(o.orderCode||o.title||\"Auftrag\"):label(e.bucket)}</td><td className=\"text-right whitespace-nowrap tabular-nums\">{duration(e.seconds)}</td></tr>;\n        })}</tbody></table></div>\n      </section>}\n      <p className=\"text-xs text-slate-500\">Nur administrativ sichtbar. Die Auftrags- und Tages-Timer werden nicht geändert. Bei fehlendem GPS, ungewöhnlichen Positionssprüngen und mehrdeutigen Flächen bleibt die Zeit ungeklärt.</p>\n    </main>\n  );\n}\n", "schema": "// DJI_FLIGHT_AREA_V11: aggregierte Flugzeit; KEINE GPS-Rohpositionen werden gespeichert.\nmodel DjiFlightAreaTime {\n  id            String   @id @default(cuid())\n  flightUsageId String\n  orderId       String?\n  bucket        String\n  seconds       Int\n  createdAt     DateTime @default(now())\n\n  @@unique([flightUsageId, bucket, orderId])\n  @@index([orderId, createdAt])\n}\n", "sql": "-- DJI_FLIGHT_AREA_V11: ausschliesslich eine NEUE Tabelle und zwei Indizes.\nCREATE TABLE \"DjiFlightAreaTime\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"flightUsageId\" TEXT NOT NULL,\n    \"orderId\" TEXT,\n    \"bucket\" TEXT NOT NULL,\n    \"seconds\" INTEGER NOT NULL,\n    \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\nCREATE UNIQUE INDEX \"DjiFlightAreaTime_flightUsageId_bucket_orderId_key\" ON \"DjiFlightAreaTime\"(\"flightUsageId\", \"bucket\", \"orderId\");\nCREATE INDEX \"DjiFlightAreaTime_orderId_createdAt_idx\" ON \"DjiFlightAreaTime\"(\"orderId\", \"createdAt\");\n"};
const newer={
  "lib/dji/flight-area-v11.cjs":files.area,
  "app/admin/dji-flugzeiten/page.tsx":files.page,
  "prisma/dji-flight-area-v11.sql":files.sql,
};
function read(f){return fs.readFileSync(path.join(root,f),"utf8");}
function once(t,a,b,filename){
  const count=t.split(a).length-1;
  if(count!==1) throw Error(`Codeabschnitt nicht eindeutig in ${filename}: ${a.slice(0,55)} (${count})`);
  return t.replace(a,b);
}
function patchedParser(t){
  return once(t,'    percent: battery.capacityPercent,\n    at: receivedAt,',
    '    percent: battery.capacityPercent,\n    // DJI OSD: Positionsdaten der Drohne, niemals home_latitude/home_longitude.\n    latitude: typeof payload?.data?.latitude === "number" ? payload.data.latitude : null,\n    longitude: typeof payload?.data?.longitude === "number" ? payload.data.longitude : null,\n    at: receivedAt,',oldParser);
}
function patchedWorker(t){
  t=once(t,'const { FlightDetector, parseFlightSample, selfTest } = require("../lib/dji/flight-history-v10.cjs");',
    'const { FlightDetector, parseFlightSample, selfTest } = require("../lib/dji/flight-history-v10.cjs");\nconst { FlightTrace, assignFlight, test: areaSelfTest } = require("../lib/dji/flight-area-v11.cjs");',oldWorker);
  t=once(t,'  try { selfTest(); console.log("V10 SELBSTTEST OK:',
    '  try { selfTest(); areaSelfTest(); console.log("V10 SELBSTTEST OK:',oldWorker);
  t=once(t,'  const detector = new FlightDetector();',
    '  const detector = new FlightDetector();\n  const areaTrace = new FlightTrace();',oldWorker);
  t=once(t,'    detector.clear();',
    '    detector.clear();\n    areaTrace.clear();',oldWorker);
  t=once(t,'client.on("close",()=>{detector.clear();if(!stopping)',
    'client.on("close",()=>{detector.clear();areaTrace.clear();if(!stopping)',oldWorker);
  t=once(t,'    const flight = detector.consume(sample);\n    if(!flight)return;',
    '    const flight = detector.consume(sample);\n    areaTrace.record(sample);\n    if(!flight)return;\n    const samples = areaTrace.consume(flight);',oldWorker);
  t=once(t,'        await saveFlight(db,flight);',
    '        const usageId = await saveFlight(db,flight);\n        if (usageId) await saveAreaTimes(db,flight,usageId,samples);',oldWorker);
  t=once(t,'  if(prior)return;',
    '  if(prior)return prior.id;',oldWorker);
  t=once(t,'  await db.djiBatteryUsage.create({data:{',
    '  const inserted = await db.djiBatteryUsage.create({data:{',oldWorker);
  t=once(t,'  console.log(`DJI FLUG ERFASST: ${aircraft.label} Akku ${battery.labelNumber??"?"}, ca. ${flight.flightSeconds} s.`);',
    '  console.log(`DJI FLUG ERFASST: ${aircraft.label} Akku ${battery.labelNumber??"?"}, ca. ${flight.flightSeconds} s.`);\n  return inserted.id;',oldWorker);
  return t + `
// DJI_FLIGHT_AREA_V11: Ein Flug darf auf mehrere Auftraege verteilt werden.
// Ist an einem GPS-Punkt kein eindeutiger Treffer moeglich, wird NICHT geraten.
function berlinDay(date) {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const get=t=>parts.find(p=>p.type===t)?.value;
  return \`\${get("year")}-\${get("month")}-\${get("day")}\`;
}
async function saveAreaTimes(db,flight,usageId,samples) {
  if (await db.djiFlightAreaTime.count({where:{flightUsageId:usageId}})) return;
  // Nur am Flugtag in der Teamplanung enthaltene Auftraege; kein fremder Altbestand.
  const day = new Date(\`\${berlinDay(flight.startedAt)}T00:00:00.000Z\`);
  const candidates = await db.order.findMany({
    where: {operationDayTeam: {is: {operationDay: {is: {date: day}}}}},
    select: {id:true,field:{select:{areaGeoJson:true}}},
  });
  const orders=candidates.filter(c=>c.field?.areaGeoJson).map(c=>({id:c.id,areaGeoJson:c.field.areaGeoJson}));
  const times=assignFlight(flight,samples,orders);
  if(!times.length)return;
  // Ein Abbruch fuehrt nicht zu duplizierten Flugzeit-Zeilen.
  await db.djiFlightAreaTime.createMany({data:times.map(row=>({
    flightUsageId:usageId,orderId:row.orderId,bucket:row.bucket,seconds:row.seconds,
  }))});
  const attributed=times.filter(t=>t.bucket==="FIELD").reduce((sum,t)=>sum+t.seconds,0);
  console.log(\`DJI GPS V11: \${flight.flightSeconds}s Flug, \${attributed}s eindeutig Flaechen zugeordnet.\`);
}
`;
}
function verify(){
  for (const f of ["package.json",oldSchema,oldParser,oldWorker]) if(!fs.existsSync(path.join(root,f))) throw Error("Projektdatei fehlt: "+f);
  const schema=read(oldSchema), worker=read(oldWorker), parser=read(oldParser);
  if(!schema.includes("model DjiBatteryUsage {")||!worker.includes("DJI_FLIGHT_HISTORY_V10")||!parser.includes("DJI_FLIGHT_HISTORY_V10")) throw Error("V10-Akku-Flughistorie oder Prisma-Akkumodell fehlt.");
  const installed=schema.includes("model DjiFlightAreaTime {")||worker.includes("DJI_FLIGHT_AREA_V11");
  const present=Object.keys(newer).filter(f=>fs.existsSync(path.join(root,f)));
  if(installed || present.length) {
    if(schema.includes("model DjiFlightAreaTime {") && worker.includes("DJI_FLIGHT_AREA_V11") && present.length===3 &&
       Object.entries(newer).every(([f,c])=>read(f)===c)) return {already:true};
    throw Error("V11 bereits teilweise/abweichend installiert: erst Dateistand pruefen. Keine Aenderung.");
  }
  return {already:false,changed:{
    [oldSchema]:schema.replace(/\s*$/, "\n")+"\n"+files.schema,
    [oldParser]:patchedParser(parser.replace(/\r\n/g,"\n")),
    [oldWorker]:patchedWorker(worker.replace(/\r\n/g,"\n")),
    ...newer,
  }};
}
try{
  const state=verify();
  if(state.already){console.log("V11 bereits installiert. Keine Aenderung.");process.exit(0);}
  if(dry){
    console.log("VORPRUEFUNG OK: V11 GPS-Flugzeitzuordnung, neue Adminseite und EINE zusatzliche Prisma-Tabelle.");
    console.log("Keine Datenbankmigration, kein PM2-Neustart, keine Aenderung an PinPoints oder DJI-Akkuerkennung.");
    process.exit(0);
  }
  const backup=path.join(root,".backups","dji-flugzeiten-v11-"+new Date().toISOString().replace(/[:.]/g,"-"));
  fs.mkdirSync(backup,{recursive:true});
  const originals=new Map(),created=[];
  try{
    for(const f of Object.keys(state.changed)){
      const target=path.join(root,f);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      if(fs.existsSync(target)){
        const orig=fs.readFileSync(target);
        originals.set(f,orig);
        const dst=path.join(backup,f);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,orig,{flag:"wx"});
      }else created.push(f);
    }
    for(const [f,c] of Object.entries(state.changed)){
      const dst=path.join(root,f), tmp=dst+".v11tmp";
      if(fs.existsSync(tmp))throw Error("Temp-Datei vorhanden: "+tmp);
      fs.writeFileSync(tmp,c,{flag:"wx",encoding:"utf8"});
      fs.renameSync(tmp,dst);
    }
  }catch(err){
    for(const [f,orig] of originals)try{fs.writeFileSync(path.join(root,f),orig)}catch{}
    for(const f of created)try{fs.unlinkSync(path.join(root,f))}catch{}
    for(const f of Object.keys(state.changed))try{fs.unlinkSync(path.join(root,f)+".v11tmp")}catch{}
    throw err;
  }
  console.log("V11 installiert. Sicherungen:",backup);
  console.log("ACHTUNG: Datenbank-Tabelle noch nicht angelegt. SQL: prisma/dji-flight-area-v11.sql");
  console.log("Erst DB-Sicherung + SQL, dann Prisma generate und PM2-Neustart.");
}catch(err){console.error("ABBRUCH:",err.message);process.exitCode=1;}
