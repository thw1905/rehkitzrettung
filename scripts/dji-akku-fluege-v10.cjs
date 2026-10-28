"use strict";
// DJI_FLIGHT_HISTORY_V10: separater, lesender MQTT-Empfaenger fuer bestaetigte Flugabschnitte.
// Kein neuer MQTT-Listener, keine Aenderung an DJI Map/PinPoints oder bestehendem V5-Worker.
const path = require("node:path");
const { FlightDetector, parseFlightSample, selfTest } = require("../lib/dji/flight-history-v10.cjs");
const { FlightTrace, assignFlight, test: areaSelfTest } = require("../lib/dji/flight-area-v11.cjs");

if (process.argv.includes("--self-test")) {
  try { selfTest(); areaSelfTest(); console.log("V10 SELBSTTEST OK: zwei Flugabschnitte; Neustart/Luecke erzeugen keinen Phantomflug. Keine DB-Aenderung."); }
  catch (error) { console.error(error); process.exitCode = 1; }
} else {
  void start().catch((error) => { console.error("V10 Startfehler:",error.message); process.exitCode = 1; });
}

async function start() {
  process.chdir(path.resolve(__dirname,".."));
  if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
  require("@next/env").loadEnvConfig(process.cwd(), false);
  const pw = process.env.DJI_MQTT_PASSWORD;
  if (!pw) throw Error("DJI_MQTT_PASSWORD fehlt.");
  const dryRun = process.argv.includes("--dry-run");
  const mqtt = require("mqtt");
  const db = dryRun ? null : new (require("@prisma/client").PrismaClient)();
  const detector = new FlightDetector();
  const areaTrace = new FlightTrace();
  let queue = Promise.resolve();
  let stopping = false;
  const client = mqtt.connect("mqtt://127.0.0.1:1883", {
    username: "dji_telemetry", password: pw,
    clientId: `rehkitz-akku-fluege-v10-${process.pid}`, clean: true,
    reconnectPeriod:3000, connectTimeout:10000, keepalive:45,
  });
  const stop = () => {
    if(stopping) return;
    stopping = true;
    client.end(true);
    void queue.finally(async () => { if(db) await db.$disconnect(); process.exit(0); });
  };
  process.on("SIGTERM",stop);
  process.on("SIGINT",stop);
  client.on("connect", () => {
    detector.clear();
    areaTrace.clear();
    client.subscribe("thing/product/+/osd",{qos:0},(error,granted) => {
      if (error || !granted?.some((g)=>g.qos!==128)) {
        console.error("V10 MQTT-Abonnement fehlgeschlagen",error?.message||"keine Berechtigung"); return;
      }
      console.log(`DJI Flugerfassung V10 aktiv (${dryRun?"TEST: ohne Datenbank":"nur bestaetigte Start-/Landeabschnitte"}).`);
    });
  });
  client.on("close",()=>{detector.clear();areaTrace.clear();if(!stopping)console.warn("V10 MQTT unterbrochen: unvollstaendige Fluege werden nicht gespeichert.");});
  client.on("error",e=>console.error("V10 MQTT-Verbindungsfehler",e.message));
  client.on("message",(topic,raw)=>{
    if(stopping)return;
    const sample = parseFlightSample(topic,raw,Date.now());
    if(!sample)return;
    const flight = detector.consume(sample);
    areaTrace.record(sample);
    if(!flight)return;
    const samples = areaTrace.consume(flight);
    queue = queue.then(async ()=>{
      if(dryRun) {
        console.log(`V10 TEST: Flug erkannt, Dauer ca. ${flight.flightSeconds} Sekunden.`);
      } else {
        const usageId = await saveFlight(db,flight);
        if (usageId) await saveAreaTimes(db,flight,usageId,samples);
      }
    }).catch(e=>console.error("V10 Historien-Speicherfehler",e.message));
  });
}

async function saveFlight(db, flight) {
  const aircraft = await db.djiAircraft.findUnique({where:{serialNumber:flight.aircraftSerial},select:{id:true,isActive:true,label:true}});
  if(!aircraft?.isActive)return;
  const battery = await db.djiBattery.findUnique({where:{serialNumber:flight.batterySerial},select:{id:true,aircraftId:true,status:true,labelNumber:true}});
  if(!battery || battery.aircraftId!==aircraft.id || battery.status==="RETIRED")return;
  // Keine mehrfachen Zeilen fuer dieselbe Flugsequenz, z.B. bei erneuter Zustellung.
  const tolerance = 30_000;
  const prior = await db.djiBatteryUsage.findFirst({where:{
    aircraftId:aircraft.id,batteryId:battery.id,source:"DJI_FLIGHT",
    startedAt:{gte:new Date(flight.startedAt.getTime()-tolerance),lte:new Date(flight.startedAt.getTime()+tolerance)},
  },select:{id:true}});
  if(prior)return prior.id;
  const inserted = await db.djiBatteryUsage.create({data:{
    aircraftId:aircraft.id, batteryId:battery.id,
    startedAt:flight.startedAt,endedAt:flight.endedAt,
    flightSeconds:flight.flightSeconds,
    startPercent:flight.startPercent,endPercent:flight.endPercent,
    usedPercent:flight.startPercent!=null && flight.endPercent!=null && flight.startPercent>=flight.endPercent
      ? flight.startPercent-flight.endPercent : null,
    source:"DJI_FLIGHT",
  }});
  console.log(`DJI FLUG ERFASST: ${aircraft.label} Akku ${battery.labelNumber??"?"}, ca. ${flight.flightSeconds} s.`);
  return inserted.id;
}

// DJI_FLIGHT_AREA_V11: Ein Flug darf auf mehrere Auftraege verteilt werden.
// Ist an einem GPS-Punkt kein eindeutiger Treffer moeglich, wird NICHT geraten.
function berlinDay(date) {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const get=t=>parts.find(p=>p.type===t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
async function saveAreaTimes(db,flight,usageId,samples) {
  if (await db.djiFlightAreaTime.count({where:{flightUsageId:usageId}})) return;
  // Nur am Flugtag in der Teamplanung enthaltene Auftraege; kein fremder Altbestand.
  const day = new Date(`${berlinDay(flight.startedAt)}T00:00:00.000Z`);
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
  console.log(`DJI GPS V11: ${flight.flightSeconds}s Flug, ${attributed}s eindeutig Flaechen zugeordnet.`);
}
