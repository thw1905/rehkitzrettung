"use strict";
// DJI_AIRCRAFT_ORIGIN_FIX_V7_2: Fix reverse-proxy origin validation for aircraft-detect API.
// Only modifies one route. Does not disable CSRF origin validation.
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const dryRun = process.argv.includes("--check");
const targetRel = "app/api/dji/pilot2/aircraft-detect/route.ts";
const target = path.join(root, targetRel);
const marker = "DJI_AIRCRAFT_ORIGIN_FIX_V7_2";
const oldText = '  const origin = req.headers.get("origin");\n  if (origin && origin !== req.nextUrl.origin) return result("Ungueltiger Ursprung.", 403);';
const newText = `  // DJI_AIRCRAFT_ORIGIN_FIX_V7_2:
  // In production NextRequest.nextUrl.origin may resolve to an internal reverse-proxy
  // address, not the origin seen by DJI Pilot 2. Do not trust incoming forwarded
  // host headers here; only accept the explicitly configured public site origin.
  const origin = req.headers.get("origin");
  const expectedOrigin = process.env.NODE_ENV === "production"
    ? (process.env.DJI_AIRCRAFT_ALLOWED_ORIGIN || "https://kitzrettung-hegering-hittfeld.de").replace(/\\/+$/, "")
    : req.nextUrl.origin;
  if (origin && origin !== expectedOrigin) {
    return result("Ungueltiger Ursprung.", 403);
  }`;
function abort(message) { throw new Error(message + " Keine Programmdateien geaendert."); }
try {
  if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(target)) {
    abort("Bitte im bestehenden Rehkitzrettungs-Projektordner ausfuehren; V7-Route fehlt.");
  }
  const current = fs.readFileSync(target, "utf8");
  if (current.includes(marker)) {
    console.log("V7.2 bereits installiert; keine Aenderung.");
    process.exit(0);
  }
  if (!current.includes("DJI_AIRCRAFT_JSBRIDGE_V7")) abort("V7-Route nicht erkannt.");
  const count = current.split(oldText).length - 1;
  if (count !== 1) abort("Sicherheitspruefung anders als erwartet (Anzahl " + count + "). Bitte Datei zuerst pruefen.");
  if (dryRun) {
    console.log("VORPRUEFUNG OK: Nur " + targetRel + " wird geaendert.");
    console.log("Die Origin-Pruefung bleibt aktiv; oeffentliche HTTPS-Domain wird statt interner Proxy-Adresse verwendet.");
    console.log("Keine Aenderung an Datenbank, DJI-Bruecke, PinPoints, WebSocket oder MQTT.");
    process.exit(0);
  }
  const backupDir = path.join(root, ".backups", "dji-origin-fix-v7-2-" + new Date().toISOString().replace(/[:.]/g,"-"));
  fs.mkdirSync(backupDir, {recursive:true});
  const backup = path.join(backupDir, "aircraft-detect-route.ts");
  fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
  const updated = current.replace(oldText, newText);
  try { fs.writeFileSync(target, updated, "utf8"); }
  catch (error) { fs.copyFileSync(backup, target); throw error; }
  console.log("V7.2 erfolgreich installiert. Sicherung: " + backup);
  console.log("Sicherheit: Erlaubt nur das konfigurierte oeffentliche Origin in Produktion, nicht beliebige Herkunft.");
} catch (err) {
  console.error("ABBRUCH: " + (err instanceof Error ? err.message : String(err)));
  process.exitCode = 1;
}
