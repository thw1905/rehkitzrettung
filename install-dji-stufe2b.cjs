/* DJI Pilot 2 - Step 2B: conservative installer. Run in project root. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const payload = path.join(root, "dji-stufe2b-paket");
const originalPath = path.join(root, "components", "dji", "PilotLoginClient.tsx");
const newComponentPath = path.join(root, "components", "dji", "Pilot2BridgeSetup.tsx");
const newApiPath = path.join(root, "app", "api", "dji", "pilot2", "bridge-bootstrap", "route.ts");
const componentSourcePath = path.join(payload, "components", "dji", "Pilot2BridgeSetup.tsx");
const apiSourcePath = path.join(payload, "app", "api", "dji", "pilot2", "bridge-bootstrap", "route.ts");

const importLine = 'import Pilot2BridgeSetup from "@/components/dji/Pilot2BridgeSetup";';
const marker = '      {message && <p className="rounded-xl border bg-white p-3 text-sm" role="status">{message}</p>}';
const extra = '      {authStatus === "authenticated" && hasRole && <Pilot2BridgeSetup token={pilotToken} />}\n';

function fail(reason) {
  console.error(`\nABBRUCH: ${reason}`);
  process.exit(1);
}
function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function contentOf(file) { if (!fs.existsSync(file)) fail(`Datei fehlt: ${file}`); return fs.readFileSync(file); }

if (!fs.existsSync(path.join(root, "package.json"))) fail("Bitte aus C:\\Projekte\\rehkitzrettung starten.");
for (const p of [componentSourcePath, apiSourcePath]) contentOf(p);
if (!fs.existsSync(originalPath)) fail("Die vorhandene DJI-Stufe-2A-Anmeldeseite fehlt.");

const old = fs.readFileSync(originalPath, "utf8");
const installedImport = old.includes(importLine);
const installedRender = old.includes("<Pilot2BridgeSetup token={pilotToken} />");
if (installedImport !== installedRender) fail("Unvollständige frühere Installation erkannt. Keine automatischen Änderungen.");
if (!installedImport && (!old.includes(marker) || !old.includes('import { signIn, signOut, useSession } from "next-auth/react";'))) {
  fail("PilotLoginClient.tsx weicht von der erwarteten DJI-Stufe-2A-Version ab. Bitte die Datei zur Anpassung hochladen.");
}
const newContent = installedImport ? old : old
  .replace('import { signIn, signOut, useSession } from "next-auth/react";', 'import { signIn, signOut, useSession } from "next-auth/react";\n' + importLine)
  .replace(marker, extra + marker);

const changes = [];
for (const [source, target] of [[componentSourcePath, newComponentPath], [apiSourcePath, newApiPath]]) {
  const intended = contentOf(source);
  if (fs.existsSync(target)) {
    if (sha(contentOf(target)) !== sha(intended)) fail(`Ziel schon vorhanden mit anderem Inhalt: ${target}`);
    console.log(`Schon korrekt installiert: ${path.relative(root, target)}`);
  } else changes.push({ target, bytes: intended });
}
if (!installedImport) changes.push({ target: originalPath, bytes: Buffer.from(newContent, "utf8"), backup: true });
if (changes.length === 0) {
  console.log("DJI Stufe 2B ist bereits installiert. Keine Änderung nötig.");
  process.exit(0);
}
const checkOnly = process.argv.includes("--check");
console.log(checkOnly ? "Prüfung (keine Änderungen):" : "Geplante Änderungen:");
for (const item of changes) console.log(`  ${item.backup ? "Anpassen + sichern" : "Neu"}: ${path.relative(root, item.target)}`);
if (checkOnly) process.exit(0);

const backup = path.join(root, "dji-backups", `stufe2b-${new Date().toISOString().replace(/[:.]/g, "-")}`);
fs.mkdirSync(backup, { recursive: true });
try {
  for (const item of changes) {
    if (item.backup) {
      const relative = path.relative(root, item.target);
      const destination = path.join(backup, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(item.target, destination);
    }
  }
  for (const item of changes) {
    fs.mkdirSync(path.dirname(item.target), { recursive: true });
    fs.writeFileSync(item.target, item.bytes);
  }
  console.log(`\nDJI Stufe 2B vorbereitet. Sicherung: ${path.relative(root, backup)}`);
  console.log("Keine Datenbankmigration, keine App-Schlüssel und keine MQTT-Änderung vorgenommen.");
} catch (err) {
  console.error("Schreibfehler. Bitte Sicherung prüfen:", backup, err);
  process.exit(1);
}
