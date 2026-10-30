"use strict";
/** Safely install the DJI team-day one-button UI + read-only GPS matching. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = process.cwd();
const pkgFile = path.join(root, "package.json");
const isCheck = process.argv.includes("--check");
function fail(message) { console.error("ABBRUCH:", message, "\nKeine Dateien geändert."); process.exit(1); }
if (!fs.existsSync(pkgFile)) fail("Im Projektordner C:\\Projekte\\rehkitzrettung ausführen.");
const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
if (pkg.name !== "rehkitzrettung") fail("Das ist nicht das Rehkitzrettung-Projekt.");
const hashes = (text) => crypto.createHash("sha256").update(text).digest("hex");
const writes = [];
function addFile(rel, content, label) {
  const target = path.join(root, rel);
  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target, "utf8");
    if (hashes(current) !== hashes(content)) fail(`${label || rel} existiert bereits mit anderem Inhalt; bitte zunächst prüfen.`);
    return;
  }
  writes.push({ rel, target, content, existing: false });
}
function patch(rel, transform) {
  const target = path.join(root, rel);
  if (!fs.existsSync(target)) fail(`${rel} fehlt.`);
  const current = fs.readFileSync(target, "utf8");
  const changed = transform(current);
  if (!changed || typeof changed !== "string") fail(`Nicht unterstützte Version: ${rel}`);
  if (changed !== current) writes.push({ rel, target, content: changed, existing: true, backup: current });
}
const payloads = [
  "app/api/dji/pilot2/team-connect/route.ts",
  "app/api/dji/pilot2/point-preview/route.ts",
  "components/dji/PilotSimpleClient.tsx",
  "lib/dji/point-matching.ts",
  "app/pilot-login/technik/page.tsx",
];
for (const rel of payloads) {
  const input = path.join(__dirname, "payload", rel);
  if (!fs.existsSync(input)) fail("Paketdatei fehlt: " + rel);
  addFile(rel, fs.readFileSync(input, "utf8"));
}
patch("app/pilot-login/page.tsx", (src) => {
  if (src.includes('import PilotSimpleClient from "@/components/dji/PilotSimpleClient";')) return src;
  const from = 'import PilotLoginClient from "@/components/dji/PilotLoginClient";';
  if (src.split(from).length !== 2 || src.split("<PilotLoginClient />").length !== 2) return "";
  return src.replace(from, 'import PilotSimpleClient from "@/components/dji/PilotSimpleClient";')
    .replace("<PilotLoginClient />", "<PilotSimpleClient />")
    .replace('title: "DJI Pilot 2 – Rehkitzrettung",', 'title: "Rehkitzrettung Hegering Hittfeld – DJI",');
});
// This interim phase only previews GPS mapping. Block every real auto-import even if env is accidentally changed.
patch("app/api/map/api/v1/workspaces/[workspaceId]/element-groups/[groupId]/elements/route.ts", (src) => {
  if (src.includes("allowImport: false,")) return src;
  const existing = 'allowImport: process.env.DJI_IMPORT_ENABLED === "true",';
  if (src.split(existing).length !== 2) return "";
  return src.replace(existing, 'allowImport: false, // Stufe 4A: keine echten Auftrags-PinPoints erzeugen.');
});
if (isCheck) {
  console.log("Vorprüfung erfolgreich. Geplante Änderungen:");
  for (const item of writes) console.log("  " + item.rel + (item.existing ? " (anpassen)" : " (neu)"));
  console.log("Keine Datenbank-/Schema- oder Umgebungsvariablenänderung.");
  process.exit(0);
}
if (!writes.length) { console.log("DJI-Stufe 4A ist bereits installiert."); process.exit(0); }
const backupDir = path.join(path.dirname(root), "rehkitzrettung-backups", "dji-einsatz-4a-" + new Date().toISOString().replace(/[:.]/g, "-"));
try {
  for (const item of writes.filter((w) => w.existing)) {
    const backup = path.join(backupDir, item.rel);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, item.backup, "utf8");
  }
  for (const item of writes) {
    fs.mkdirSync(path.dirname(item.target), { recursive: true });
    const tmp = item.target + ".dji4a-tmp";
    fs.writeFileSync(tmp, item.content, "utf8");
    fs.renameSync(tmp, item.target);
    console.log("Installiert:", item.rel);
  }
  console.log("Fertig. Backups:", backupDir);
  console.log("WICHTIG: flächenbasierte GPS-Zuordnung ist eine VORSCHAU. Es werden keine regulären PinPoints angelegt.");
} catch (error) {
  console.error("Schreibfehler – die Sicherungen sind unter", backupDir, "–", error.message);
  process.exit(1);
}
