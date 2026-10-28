"use strict";
// DJI_AUTOERKENNUNG_V5: ersetzt V2 im selben PM2-Prozess. Keine Aenderung an Karten/PinPoints.
// Topologie -> Drohne ueber Seriennummer; OSD -> Akku ueber Seriennummer.
const path = require("node:path");
const { parseTelemetry } = require("../lib/dji/battery-telemetry-parser.cjs");
const { parseTopology } = require("../lib/dji/device-topology-parser.cjs");
const dryRun = process.argv.includes("--dry-run");
const once = process.argv.includes("--once");
const test = process.argv.includes("--self-test");
const hide = (sn) => sn.length > 5 ? `${sn.slice(0, 3)}…${sn.slice(-4)}` : "****";
const topicStatus = "sys/product/+/status";
const topicOsd = "thing/product/+/osd";

async function registerDrone(db, entry) {
  let existing = await db.djiAircraft.findUnique({ where: { serialNumber: entry.serialNumber } });
  if (existing) {
    // DJI_AIRCRAFT_JSBRIDGE_V7: V7 hat die Seriennummer ggf. schon vor MQTT erkannt.
    // Die DJI-Modellinformation nachtragen, manuelle Beschriftung respektieren.
    if (existing.model === "Noch nicht ermittelt") {
      const autoLabel = `DJI (${entry.serialNumber.slice(-8)})`;
      const data = { model: entry.model,
        ...(existing.label === autoLabel ? { label: `${entry.model} (${entry.serialNumber.slice(-8)})` } : {}),
      };
      try { return await db.djiAircraft.update({ where: { id: existing.id }, data }); }
      catch (error) {
        // Bei gleichlautenden automatisch generierten Namen nur das Modell aktualisieren.
        if (error?.code !== "P2002") throw error;
        return await db.djiAircraft.update({ where: { id: existing.id }, data: { model: entry.model } });
      }
    }
    // Bereits manuell vergebene Bezeichnung niemals aendern, inaktive nicht reaktivieren.
    return existing;
  }
  const postfix = entry.serialNumber.slice(-8);
  for (const label of [
    `${entry.model} (${postfix})`,
    `${entry.model} (${entry.serialNumber})`,
    `DJI ${entry.serialNumber}`,
  ]) {
    try {
      const created = await db.djiAircraft.create({ data: { label, model: entry.model, serialNumber: entry.serialNumber } });
      console.log(`DROHNE ERKANNT: ${created.label}, SN ${hide(entry.serialNumber)}`);
      return created;
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      existing = await db.djiAircraft.findUnique({ where: { serialNumber: entry.serialNumber } });
      if (existing) return existing;
    }
  }
  throw new Error("Drohne konnte wegen Bezeichnungskonflikt nicht erstellt werden.");
}

async function registerAndUpdateBattery(db, lastWritten, aircraftSerial, item) {
  const drone = await db.djiAircraft.findUnique({ where: { serialNumber: aircraftSerial }, select: { id: true, label: true, isActive: true } });
  if (!drone || !drone.isActive) {
    console.log(`NOCH KEINE TOPOLOGIE: OSD fuer Fluggeraet ${hide(aircraftSerial)} nicht zugeordnet.`);
    return;
  }
  let battery = await db.djiBattery.findUnique({ where: { serialNumber: item.serialNumber } });
  if (!battery) {
    try {
      battery = await db.djiBattery.create({
        data: { aircraftId: drone.id, serialNumber: item.serialNumber, labelNumber: null },
      });
      console.log(`AKKU ERKANNT: ${drone.label}, SN ${hide(item.serialNumber)} (Aufklebernummer noch offen)`);
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      battery = await db.djiBattery.findUnique({ where: { serialNumber: item.serialNumber } });
      if (!battery) throw error;
    }
  }
  // Historische Verknuepfung, Sperrung und Ausmusterung unbedingt respektieren.
  if (battery.aircraftId !== drone.id || battery.status === "RETIRED") {
    console.warn(`ZUORDNUNGSKONFLIKT: ${drone.label}, Akku ${hide(item.serialNumber)}. Keine Aenderung.`);
    return;
  }
  const now = Date.now();
  if (now - (lastWritten.get(battery.id) || 0) < 30_000 && (item.cycles == null || item.cycles === battery.cycles)) return;
  const data = { lastSeenAt: new Date(now) };
  if (item.cycles != null) {
    if (battery.cycles != null && item.cycles < battery.cycles) {
      console.warn(`ZYKLENKONFLIKT: ${drone.label}, Akku ${battery.labelNumber ?? "?"}. Keine Senkung der Zyklen.`);
    } else {
      data.cycles = item.cycles;
      data.cycleSource = "DJI";
    }
  }
  if (item.capacityPercent != null) data.capacityPercent = item.capacityPercent;
  if (item.temperatureC != null) data.temperatureC = item.temperatureC;
  if (item.voltageMv != null) data.voltageMv = item.voltageMv;
  await db.djiBattery.update({ where: { id: battery.id }, data });
  // DJI_BATTERY_GLOBAL_V8: sichtbarer, aktiver Akku gilt als heute eingesetzt.
  if (battery.status === "ACTIVE" && battery.labelNumber != null) {
    await v8MarkDetectedToday(db, drone.id, battery.id, new Date(now));
  }
  lastWritten.set(battery.id, now);
  console.log(`AKKU AKTUALISIERT: ${drone.label}, Nummer ${battery.labelNumber ?? "noch offen"}, Zyklen ${item.cycles ?? "?"}, Stand ${item.capacityPercent ?? "?"}%`);
}

// DJI_BATTERY_GLOBAL_V8: "today used" means detected in the aircraft today, not proven in-flight.
// The day boundary is Europe/Berlin. Detection alone must not count as a flown mission.
const v8Recorded = new Set();
function v8GermanDay(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (name) => parts.find((p) => p.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
async function v8MarkDetectedToday(db, aircraftId, batteryId, now) {
  const day = v8GermanDay(now);
  const key = `${batteryId}:${day}`;
  if (v8Recorded.has(key)) return;
  const existing = await db.djiBatteryUsage.findMany({
    where: { batteryId, startedAt: { gte: new Date(now.getTime() - 48 * 3600_000) } },
    select: { startedAt: true },
  });
  if (!existing.some((item) => v8GermanDay(item.startedAt) === day)) {
    await db.djiBatteryUsage.create({
      data: { aircraftId, batteryId, startedAt: now, source: "DJI_DETECTED" },
    });
    console.log("AKKU HEUTE ERKANNT: Einsatzwechsel-Empfehlung wird aktualisiert.");
  }
  v8Recorded.add(key);
}

function selfTest() {
  const status = Buffer.from(JSON.stringify({ tid: "a", bid: "b", method: "update_topo", data: { sub_devices: [
    { sn: "TESTDROHNE123", domain: "0", type: 99, sub_type: 1 },
    { sn: "TESTFERNSTEUER", domain: "2", type: 174, sub_type: 0 },
  ] } }));
  const result = parseTopology("sys/product/GATEWAY123/status", status);
  if (!result || result.aircraft.length !== 1 || result.aircraft[0].model !== "DJI M4T") throw new Error("DJI Topologie-Selbsttest fehlgeschlagen.");
  const sample = Buffer.from(JSON.stringify({ data: { battery: { batteries: [
    { sn: "TESTAKKU01", loop_times: 12, capacity_percent: 85 },
  ] } } }));
  const parsed = parseTelemetry("thing/product/TESTDROHNE123/osd", sample);
  if (!parsed || parsed.batteries.length !== 1 || parsed.batteries[0].cycles !== 12) throw new Error("DJI Akku-Selbsttest fehlgeschlagen.");
  if (parseTopology("sys/product/GATEWAY123/status", Buffer.from("bad-json")) !== null) throw new Error("Ungueltige Topologie akzeptiert.");
  console.log("SELBSTTEST OK: M4T erkannt, Fernsteuerung ignoriert, Akku zugeordnet, ungueltige Meldung abgewiesen. Keine Datenbank veraendert.");
}
if (test) {
  try { selfTest(); } catch (e) { console.error(e); process.exitCode = 1; }
} else {
  void main().catch((e) => { console.error("DJI-Autoerkennung konnte nicht starten:", e.message); process.exitCode = 1; });
}

async function main() {
  process.chdir(path.resolve(__dirname, ".."));
  require("@next/env").loadEnvConfig(process.cwd());
  const password = process.env.DJI_MQTT_PASSWORD;
  if (!password) throw new Error("DJI_MQTT_PASSWORD fehlt.");
  let mqtt;
  try { mqtt = require("mqtt"); } catch { throw new Error("Node-Paket mqtt fehlt."); }
  let db = null;
  if (!dryRun) {
    const { PrismaClient } = require("@prisma/client");
    db = new PrismaClient();
  }
  const lastWritten = new Map();
  // Der externe MQTT-Transport von DJI Pilot 2 ist separat zu konfigurieren.
  // Dieser lokale Client spricht nur mit dem Mosquitto-Loopback-Listener.
  const client = mqtt.connect("mqtt://127.0.0.1:1883", {
    username: "dji_telemetry", password,
    clientId: `rehkitz-dji-autov5-${process.pid}`, clean: true,
    reconnectPeriod: 3000, connectTimeout: 10_000, keepalive: 45,
  });
  let replyClient = null;
  // Optional: eigener lokaler MQTT-Servicebenutzer mit WRITE ausschliesslich auf status_reply.
  const replyUser = process.env.DJI_MQTT_REPLY_USER;
  const replyPassword = process.env.DJI_MQTT_REPLY_PASSWORD;
  if (replyUser && replyPassword && !dryRun) {
    replyClient = mqtt.connect("mqtt://127.0.0.1:1883", {
      username: replyUser, password: replyPassword,
      clientId: `rehkitz-dji-replyv5-${process.pid}`, clean: true,
      reconnectPeriod: 3000, connectTimeout: 10_000,
    });
    replyClient.on("error", (e) => console.error("DJI Statusantwort MQTT:", e.message));
  }
  let queue = Promise.resolve();
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    client.end(true);
    replyClient?.end(true);
    void queue.finally(async () => { if (db) await db.$disconnect(); process.exit(0); });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  client.on("connect", () => {
    client.subscribe([topicOsd, topicStatus], { qos: 0 }, (error, granted) => {
      if (error || !granted || granted.length !== 2 || granted.some((g) => g.qos === 128)) {
        console.error("DJI-Topic-Abonnement unvollstaendig:", error?.message || JSON.stringify(granted));
        return;
      }
      console.log(`DJI AUTO V5 aktiv (${dryRun ? "TESTMODUS ohne Datenbank" : "Drohnen- und Akkuerkennung"}).`);
      if (!replyClient && !dryRun) console.log("HINWEIS: Kein DJI_MQTT_REPLY_USER konfiguriert; update_topo wird noch nicht quittiert.");
    });
  });
  client.on("error", (e) => console.error("DJI MQTT:", e.message));
  client.on("close", () => { if (!stopping) console.log("DJI MQTT unterbrochen. Wiederverbindung ..."); });
  client.on("message", (topic, payload) => {
    if (stopping) return;
    const topo = parseTopology(topic, payload);
    const tele = topo ? null : parseTelemetry(topic, payload);
    if (!topo && !tele) return;
    queue = queue.then(async () => {
      if (topo) {
        for (const aircraft of topo.aircraft) {
          if (dryRun) console.log("TEST DROHNE:", aircraft.model, hide(aircraft.serialNumber));
          else await registerDrone(db, aircraft);
        }
        // Auch leere sub_devices (Drohne offline) werden mit Erfolg bestaetigt.
        // Nur mit eigenem, topic-begrenztem Schreibkonto; niemals als dji_telemetry.
        if (replyClient?.connected && topo.tid && topo.bid) {
          replyClient.publish(`sys/product/${topo.gatewaySerial}/status_reply`, JSON.stringify({
            tid: topo.tid, bid: topo.bid, timestamp: Date.now(), method: "update_topo", data: { result: 0 },
          }), { qos: 1 });
        }
      } else if (tele) {
        for (const item of tele.batteries) {
          if (dryRun) console.log("TEST AKKU:", hide(tele.aircraftSerial), hide(item.serialNumber), "Zyklen", item.cycles);
          else await registerAndUpdateBattery(db, lastWritten, tele.aircraftSerial, item);
        }
      }
      if (once) shutdown();
    }).catch((e) => console.error("DJI Autoerkennung:", e.message));
  });
}
