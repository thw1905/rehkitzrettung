"use strict";
// DJI_AKKU_MQTT_V2 - untrusted MQTT input: parse only battery fields.
const batterySerialPattern = /^[A-Za-z0-9_-]{5,80}$/;
const devicePattern = /^[A-Za-z0-9_-]{1,128}$/;
const finiteInt = (v, min, max) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
const finiteFloat = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
function parseTelemetry(topic, raw) {
  const match = /^thing\/product\/([^/]+)\/osd$/.exec(topic);
  if (!match || !devicePattern.test(match[1])) return null;
  if (!Buffer.isBuffer(raw) || raw.length > 65_536 || raw.length === 0) return null;
  let input;
  try { input = JSON.parse(raw.toString("utf8")); } catch { return null; }
  const items = input?.data?.battery?.batteries;
  if (!Array.isArray(items)) return null;
  const seen = new Set();
  const batteries = [];
  for (const entry of items.slice(0, 8)) {
    if (!entry || typeof entry !== "object" || typeof entry.sn !== "string" || !batterySerialPattern.test(entry.sn) || seen.has(entry.sn)) continue;
    seen.add(entry.sn);
    batteries.push({
      serialNumber: entry.sn,
      cycles: finiteInt(entry.loop_times, 0, 100_000),
      capacityPercent: finiteInt(entry.capacity_percent, 0, 100),
      voltageMv: finiteInt(entry.voltage, 0, 200_000),
      temperatureC: finiteFloat(entry.temperature, -60, 130),
    });
  }
  if (!batteries.length) return null;
  return { aircraftSerial: match[1], batteries };
}
module.exports = { parseTelemetry };
