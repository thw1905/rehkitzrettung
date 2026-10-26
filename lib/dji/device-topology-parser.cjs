"use strict";
// DJI_AUTOERKENNUNG_V5: nur Topologiedaten, nie DJI device_secret/nonce ausgeben.
const deviceSn = /^[A-Za-z0-9_-]{5,80}$/;
const knownModels = new Map([
  ["77:0", "DJI M3E"], ["77:1", "DJI M3T"], ["77:3", "DJI M3TA"],
  ["99:0", "DJI M4E"], ["99:1", "DJI M4T"],
  ["67:0", "DJI M30"], ["67:1", "DJI M30T"],
  ["89:0", "DJI M350 RTK"], ["60:0", "DJI M300 RTK"],
]);
const asInteger = (v) => Number.isInteger(v) ? v : (typeof v === "string" && /^\d{1,4}$/.test(v) ? Number(v) : null);
function parseTopology(topic, payload) {
  const match = /^sys\/product\/([^/]+)\/status$/.exec(topic);
  if (!match || !deviceSn.test(match[1]) || !Buffer.isBuffer(payload) || payload.length > 65536 || !payload.length) return null;
  let msg;
  try { msg = JSON.parse(payload.toString("utf8")); } catch { return null; }
  if (!msg || msg.method !== "update_topo" || !Array.isArray(msg.data?.sub_devices)) return null;
  if (msg.data.sub_devices.length > 20) return null;
  const seen = new Set();
  const aircraft = [];
  for (const entry of msg.data.sub_devices) {
    if (!entry || typeof entry !== "object" || typeof entry.sn !== "string" || !deviceSn.test(entry.sn) || seen.has(entry.sn)) continue;
    const domain = asInteger(entry.domain);
    const type = asInteger(entry.type);
    const subType = asInteger(entry.sub_type);
    // Keine Fernsteuerungen, Nutzlasten oder unklare Geraetetypen als Drohne anlegen.
    if (domain !== 0 || type == null || subType == null || type < 0 || type > 9999 || subType < 0 || subType > 9999) continue;
    seen.add(entry.sn);
    aircraft.push({ serialNumber: entry.sn, model: knownModels.get(`${type}:${subType}`) || `DJI Fluggeraet Typ ${type}/${subType}` });
  }
  // TID/BID werden ausschließlich für die spezifikationskonforme Statusantwort verwendet.
  const id = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,90}$/.test(value) ? value : null;
  return { gatewaySerial: match[1], tid: id(msg.tid), bid: id(msg.bid), aircraft };
}
module.exports = { parseTopology };
