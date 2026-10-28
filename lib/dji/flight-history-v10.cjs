"use strict";
// DJI_FLIGHT_HISTORY_V10: reiner Zustandsautomat, niemals Akkuerkennung/PinPoint-Ablauf beeinflussen.
const { parseTelemetry } = require("./battery-telemetry-parser.cjs");
const GROUND = new Set([0, 1, 2]);
// Nur eindeutig als Flug-/Landebewegung dokumentierte mode_code-Zustaende.
const AIR = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const MAX_GAP_MS = 30_000;
const MIN_FLIGHT_MS = 10_000;
const MAX_FLIGHT_MS = 4 * 60 * 60 * 1000;

function parseFlightSample(topic, raw, receivedAt = Date.now()) {
  const tele = parseTelemetry(topic, raw);
  if (!tele || tele.batteries.length !== 1 || !Buffer.isBuffer(raw) || raw.length > 65_536) return null;
  let payload;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return null; }
  const modeCode = payload?.data?.mode_code;
  if (!Number.isInteger(modeCode) || !GROUND.has(modeCode) && !AIR.has(modeCode)) return null;
  const battery = tele.batteries[0];
  return {
    aircraftSerial: tele.aircraftSerial,
    batterySerial: battery.serialNumber,
    modeCode,
    percent: battery.capacityPercent,
    // DJI OSD: Positionsdaten der Drohne, niemals home_latitude/home_longitude.
    latitude: typeof payload?.data?.latitude === "number" ? payload.data.latitude : null,
    longitude: typeof payload?.data?.longitude === "number" ? payload.data.longitude : null,
    at: receivedAt,
  };
}

// Ground -> confirmed-air -> confirmed-ground. Bei Unterbrechungen kein erfundener Flug.
class FlightDetector {
  constructor() { this.states = new Map(); }
  consume(s) {
    if (!s || !Number.isFinite(s.at)) return null;
    const aircraft = s.aircraftSerial;
    let state = this.states.get(aircraft);
    if (state && (s.batterySerial !== state.batterySerial ||
        s.at < state.lastAt || s.at - state.lastAt > MAX_GAP_MS)) {
      this.states.delete(aircraft);
      state = null;
    }
    if (!state) {
      state = {
        batterySerial: s.batterySerial, lastAt: s.at, groundConfirmed: false,
        groundCount: 0, airCount: 0, firstAirAt: null, startPercent: null,
        inFlight: false, landingCount: 0, firstGroundAt: null, endPercent: null,
      };
      this.states.set(aircraft, state);
    }
    state.lastAt = s.at;
    const onGround = GROUND.has(s.modeCode);
    const airborne = AIR.has(s.modeCode);

    if (!state.inFlight) {
      if (onGround) {
        state.groundCount += 1;
        if (state.groundCount >= 2) state.groundConfirmed = true;
        state.airCount = 0;
        state.firstAirAt = null;
        state.startPercent = null;
      } else if (airborne && state.groundConfirmed) {
        state.airCount++;
        if (state.airCount === 1) { state.firstAirAt = s.at; state.startPercent = s.percent; }
        if (state.airCount >= 2) { state.inFlight = true; state.groundCount = 0; }
      }
      return null;
    }

    if (airborne) {
      state.landingCount = 0;
      state.firstGroundAt = null;
      state.endPercent = null;
      return null;
    }
    if (onGround) {
      state.landingCount++;
      if (state.landingCount === 1) { state.firstGroundAt = s.at; state.endPercent = s.percent; }
      if (state.landingCount >= 2) {
        const start = state.firstAirAt;
        const end = state.firstGroundAt;
        // Damit kann ein weiterer Flug mit demselben Akku erkannt werden.
        state.inFlight = false;
        state.groundConfirmed = true;
        state.groundCount = 2;
        state.airCount = 0;
        state.firstAirAt = null;
        state.landingCount = 0;
        state.firstGroundAt = null;
        const ms = end - start;
        if (ms < MIN_FLIGHT_MS || ms > MAX_FLIGHT_MS) return null;
        return {
          aircraftSerial: aircraft, batterySerial: s.batterySerial,
          startedAt: new Date(start), endedAt: new Date(end),
          flightSeconds: Math.round(ms / 1000),
          startPercent: state.startPercent, endPercent: state.endPercent,
        };
      }
    }
    return null;
  }
  clear() { this.states.clear(); }
}

function selfTest() {
  const detector = new FlightDetector();
  const sample = (mode, second, sn="AKKU_TEST_01", percent=90) => ({ aircraftSerial:"DRONE_TEST", batterySerial:sn, modeCode:mode, at: second*1000, percent });
  const run = (m, s, sn, pct) => detector.consume(sample(m,s,sn,pct));
  if (run(0,0) || run(0,2) || run(1,4) || run(4,6) || run(3,8) || run(3,18) || run(10,20) || run(0,22)) throw Error("Start/Landung zu frueh erfasst");
  const flight = run(0,24);
  if (!flight || flight.flightSeconds !== 16 || flight.startPercent !== 90 || flight.endPercent !== 90) throw Error("Erster Flug falsch berechnet");
  // Neue Mission mit demselben Akku ist erlaubt, jedoch nie eine Wiederholung alter MQTT-Meldungen.
  if (run(3,26) || run(3,28) || run(3,40) || run(0,42)) throw Error("Zweiter Flug zu frueh");
  const second = run(0,44);
  if (!second || second.flightSeconds !== 16) throw Error("Zweiter Flug nicht erkannt");
  // Ohne Ground-Baseline oder bei Verbindungsabbruch keine Phantomeinsaetze.
  detector.clear();
  if (run(3,60) || run(3,62) || run(0,64) || run(0,66)) throw Error("Phantomflug beim Verbinden");
  if (run(3,68) || run(3,70) || run(0,150) || run(0,152)) throw Error("Flug ueber Verbindungsluecke erfunden");
  const payload = Buffer.from(JSON.stringify({ data: {mode_code:3, battery:{batteries:[{sn:"AKKU_TEST_01",loop_times:14,capacity_percent:80}]}}}));
  if (parseFlightSample("thing/product/DRONE_TEST/osd",payload,1234)?.modeCode !== 3) throw Error("MQTT Datenparser fehlerhaft");
  if (parseFlightSample("thing/product/DRONE_TEST/state",payload,1234)) throw Error("Nicht-OSD-Topic akzeptiert");
  return true;
}
module.exports = { parseFlightSample, FlightDetector, selfTest };
