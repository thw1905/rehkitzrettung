"use strict";
// DJI_AKKU_MQTT_V2 - eigenstaendiger MQTT-Empfaenger, NICHT der DJI-Cloud-Login.
// '--dry-run' schreibt NICHT in die Datenbank. Unbekannte Seriennummern werden nie automatisch zugeordnet.
const path = require("node:path");
const { parseTelemetry } = require("../lib/dji/battery-telemetry-parser.cjs");
const dryRun = process.argv.includes("--dry-run");
const once = process.argv.includes("--once");
const test = process.argv.includes("--self-test");
const hide = (sn) => sn.length > 5 ? `${sn.slice(0, 3)}…${sn.slice(-4)}` : "****";

function selfTest() {
  const sample = Buffer.from(JSON.stringify({data:{battery:{batteries:[
    {sn:"TESTAKKU01",loop_times:12,capacity_percent:85,voltage:15900,temperature:28.5},
  ]}}}));
  const parsed = parseTelemetry("thing/product/demo/osd", sample);
  if (!parsed || parsed.aircraftSerial !== "demo" || parsed.batteries.length !== 1 ||
      parsed.batteries[0].cycles !== 12 || parsed.batteries[0].capacityPercent !== 85) throw new Error("Parser-Selbsttest fehlgeschlagen.");
  if (parseTelemetry("thing/product/demo/state",sample) !== null) throw new Error("Unzulaessiges Topic akzeptiert.");
  if (parseTelemetry("thing/product/demo/osd",Buffer.from("NOT JSON")) !== null) throw new Error("Ungueltiges JSON akzeptiert.");
  console.log("SELBSTTEST OK: DJI Akku-Nachricht erkannt, ungueltige Daten abgewiesen. Keine Datenbank veraendert.");
}
if (test) {
  try { selfTest(); } catch (error) { console.error(error); process.exitCode = 1; }
} else {
  void main().catch((error) => { console.error("MQTT-Empfaenger konnte nicht starten:", error.message); process.exitCode = 1; });
}

async function main() {
  process.chdir(path.resolve(__dirname, ".."));
  require("@next/env").loadEnvConfig(process.cwd());
  const password = process.env.DJI_MQTT_PASSWORD;
  if (!password) throw new Error("DJI_MQTT_PASSWORD fehlt. Das Passwort nicht im Quellcode speichern.");
  let mqtt;
  try { mqtt = require("mqtt"); }
  catch { throw new Error("Node-Paket mqtt fehlt. Im Projektordner 'npm install mqtt' ausfuehren."); }
  let prisma = null;
  if (!dryRun) {
    const { PrismaClient } = require("@prisma/client");
    prisma = new PrismaClient();
  }
  const lastWritten = new Map();
  const client = mqtt.connect("mqtt://127.0.0.1:1883", {
    username: "dji_telemetry", password,
    clientId: `rehkitz-akku-v2-${process.pid}`,
    clean: true, reconnectPeriod: 3000,
    connectTimeout: 10_000, keepalive: 45,
  });
  let queue = Promise.resolve();
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    client.end(true, () => {});
    void queue.finally(async () => { if (prisma) await prisma.$disconnect(); process.exit(0); });
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  client.on("connect", () => {
    client.subscribe("thing/product/+/osd", { qos: 0 }, (error, granted) => {
      if (error || !granted?.some((g) => g.qos !== 128)) {
        console.error("MQTT-Topic-Abonnement fehlgeschlagen:", error?.message || "nicht berechtigt");
        return;
      }
      console.log(`DJI Akku MQTT V2 aktiv (${dryRun ? "TESTMODUS: kein Datenbankzugriff" : "nur bekannte Akku-Seriennummern aktualisieren"}).`);
    });
  });
  client.on("error", (error) => console.error("MQTT-Verbindungsproblem:", error.message));
  client.on("close", () => { if (!stopping) console.log("MQTT-Verbindung unterbrochen, neuer Versuch ..."); });
  client.on("message", (topic, payload) => {
    if (stopping) return;
    const report = parseTelemetry(topic, payload);
    if (!report) return;
    queue = queue.then(async () => {
      for (const item of report.batteries) {
        if (dryRun) {
          console.log("TEST – Drohne",report.aircraftSerial,"Akku",item.serialNumber,"Zyklen",item.cycles,"Stand",item.capacityPercent,"%");
        } else {
          await storeKnownBattery(prisma, lastWritten, report.aircraftSerial, item);
        }
      }
      if (once) shutdown();
    }).catch((error) => console.error("DJI-Akkuverarbeitung:", error.message));
  });
}

async function storeKnownBattery(prisma, lastWritten, aircraftSerial, item) {
  const drone = await prisma.djiAircraft.findUnique({ where: {serialNumber: aircraftSerial}, select: {id:true,label:true,isActive:true} });
  if (!drone || !drone.isActive) {
    console.log(`NICHT ZUGEORDNET: Drohnen-Seriennummer ${hide(aircraftSerial)} – zuerst in Adminverwaltung erfassen.`);
    return;
  }
  const battery = await prisma.djiBattery.findUnique({where:{serialNumber:item.serialNumber},select:{id:true,aircraftId:true,status:true,cycles:true,labelNumber:true}});
  if (!battery) {
    console.log(`NEUER AKKU: ${drone.label} – Seriennummer ${item.serialNumber}; bitte einmalig im Adminbereich der Aufklebernummer zuordnen.`);
    return;
  }
  if (battery.aircraftId !== drone.id || battery.status === "RETIRED") {
    console.warn(`ZUORDNUNGSKONFLIKT: ${drone.label} Akku ${hide(item.serialNumber)} – keine Aenderung.`);
    return;
  }
  const now = Date.now();
  if (now - (lastWritten.get(battery.id) || 0) < 30_000 && (item.cycles == null || item.cycles === battery.cycles)) return;
  const data = { lastSeenAt: new Date(now) };
  if (item.cycles != null) {
    if (battery.cycles != null && item.cycles < battery.cycles) {
      console.warn(`ZYKLENKONFLIKT: ${drone.label} Akku ${battery.labelNumber ?? "?"}, DJI meldet niedrigeren Wert – Zyklen werden nicht gesenkt.`);
    } else {
      data.cycles = item.cycles;
      data.cycleSource = "DJI";
    }
  }
  if (item.capacityPercent != null) data.capacityPercent = item.capacityPercent;
  if (item.temperatureC != null) data.temperatureC = item.temperatureC;
  if (item.voltageMv != null) data.voltageMv = item.voltageMv;
  await prisma.djiBattery.update({where:{id:battery.id},data});
  lastWritten.set(battery.id,now);
  console.log(`AKTUALISIERT: ${drone.label} Akku ${battery.labelNumber ?? "?"}, ${item.cycles ?? "?"} Zyklen, ${item.capacityPercent ?? "?"}%`);
}
