"use strict";
// DJI_AKKU_SSL_PROBE_V3_1: exclusively widen the V3 admin diagnostic URI validator.
// This is an experimental scheme test; it does not establish that DJI Pilot2 supports ssl://.
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const rel = "app/api/dji/pilot2/thing-test/route.ts";
const full = path.join(root, rel);
const check = process.argv.includes("--check");
const from = String.raw`/^tcp:\/\/[a-z0-9.-]+:\d{2,5}$/i.test(host)`;
const to = String.raw`/^(?:tcp|ssl):\/\/[a-z0-9.-]+:\d{2,5}$/i.test(host)`;
try {
  if (!fs.existsSync(path.join(root,"package.json")) || !fs.existsSync(full))
    throw new Error("Kein passendes Rehkitzrettung-Projekt oder V3-Test-Endpunkt gefunden.");
  const code = fs.readFileSync(full,"utf8");
  if (!code.includes("DJI_AKKU_THING_TEST_V3"))
    throw new Error("V3-Test-Endpunkt nicht eindeutig erkannt.");
  if (code.includes(to)) {
    console.log("DJI MQTT SSL-Versuch V3.1 ist bereits vorbereitet.");
    process.exit(0);
  }
  if (code.split(from).length !== 2)
    throw new Error("Erwartete URI-Pruefung nicht eindeutig erkannt. Keine Datei veraendert.");
  if (check) {
    console.log("VORPRUEFUNG OK: Aenderung ausschliesslich in "+rel+" (Admin-Test-Endpunkt). Keine DJI-PinPoint-Dateien, keine Datenbank.");
    process.exit(0);
  }
  const backup = full+".backup-ssl-probe-v3-1-"+new Date().toISOString().replace(/[:.]/g,"-");
  fs.copyFileSync(full,backup,fs.constants.COPYFILE_EXCL);
  try { fs.writeFileSync(full, code.replace(from,to), "utf8"); }
  catch(e) {try{fs.copyFileSync(backup,full)}catch{}throw e;}
  console.log("INSTALLATION OK: Test-Endpunkt akzeptiert zusaetzlich ssl:// als experimentelles URI-Schema.");
  console.log("Sicherung: "+backup);
  console.log("WICHTIG: MQTT SSL-Unterstuetzung auf DJI Pilot 2 ist damit NICHT bewiesen.");
} catch(error) {
  console.error("ABBRUCH: "+error.message);
  process.exitCode=1;
}
