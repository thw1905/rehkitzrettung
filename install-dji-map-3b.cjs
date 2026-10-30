"use strict";
/* Rehkitzrettung: installiert ausschließlich DJI Kartenmodul-Test Stufe 3B.
 * Alle Vorbedingungen werden vor einer Dateiänderung geprüft.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = process.cwd();
const fail = (reason) => { console.error("ABBRUCH: " + reason + "\nKeine Programmdateien geändert."); process.exit(1); };

const pkgPath = path.join(root, "package.json");
if (!fs.existsSync(pkgPath)) fail("Bitte im Ordner C:\\Projekte\\rehkitzrettung starten.");
let pkg;
try { pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")); }
catch { fail("package.json kann nicht gelesen werden."); }
if (pkg.name !== "rehkitzrettung") fail("Dies ist nicht das erwartete Rehkitzrettungsprojekt.");

const loginRel = "components/dji/PilotLoginClient.tsx";
const loginPath = path.join(root, loginRel);
if (!fs.existsSync(loginPath)) fail("PilotLoginClient.tsx fehlt.");
let login = fs.readFileSync(loginPath, "utf8");
const importAnchor = 'import Pilot2WsTest from "@/components/dji/Pilot2WsTest";';
const viewAnchor = '{authStatus === "authenticated" && hasRole && <Pilot2WsTest token={pilotToken} />}';
const mapImport = 'import Pilot2MapTest from "@/components/dji/Pilot2MapTest";';
const mapView = '{authStatus === "authenticated" && hasRole && <Pilot2MapTest token={pilotToken} />}';

const hasImport = login.includes(mapImport);
const hasView = login.includes(mapView);
if (hasImport !== hasView) fail("DJI-Kartenmodul ist nur teilweise eingebaut. Bitte Quelltext zuerst prüfen.");
if (!hasImport && (!login.includes(importAnchor) || !login.includes(viewAnchor))) {
  fail("Stufe 3A/Dateistruktur in PilotLoginClient.tsx weicht von der Vorlage ab; nichts überschreiben.");
}
if (!hasImport) {
  login = login.replace(importAnchor, importAnchor + "\n" + mapImport);
  login = login.replace(viewAnchor, viewAnchor + "\n      " + mapView);
  const oldText = "Diese Testseite stellt <strong>noch keine Verbindung</strong> zu DJI-MQTT oder WebSocket her. Kein Fluggerät und kein Fundpunkt werden dadurch automatisch übertragen.";
  const newText = "Die DJI-Verbindung wird schrittweise getestet. Kartenpunkte werden zunächst nur als DJI-Testeinträge gespeichert. Der automatische Auftrags-PinPoint-Import ist deaktiviert.";
  if (login.includes(oldText)) login = login.replace(oldText, newText);
  login = login.replace("Stufe 2A: Anmeldung und Verbindungsprüfung. Der automatische Live-Import ist noch deaktiviert.",
    "Stufe 3B: DJI-Anmeldung, WebSocket und Kartensynchronisierung testen. Der automatische Auftragsimport bleibt deaktiviert.");
}

const files = [
  ["payload/components/dji/Pilot2MapTest.tsx.txt", "components/dji/Pilot2MapTest.tsx"],
  ["payload/app/api/dji/pilot2/map-bootstrap/route.ts.txt", "app/api/dji/pilot2/map-bootstrap/route.ts"],
  ["payload/app/api/dji/pilot2/map-observations/route.ts.txt", "app/api/dji/pilot2/map-observations/route.ts"],
];
const sha = (contents) => crypto.createHash("sha256").update(contents).digest("hex");
const changes = [];
for (const [src, relative] of files) {
  const input = path.join(__dirname, src);
  const output = path.join(root, relative);
  if (!fs.existsSync(input)) fail("Installationsdatei fehlt: " + src);
  const contents = fs.readFileSync(input);
  if (fs.existsSync(output)) {
    if (sha(fs.readFileSync(output)) !== sha(contents)) {
      fail("Die Datei " + relative + " existiert bereits mit anderem Inhalt. Bitte nicht überschreiben.");
    }
  } else changes.push({ relative, output, contents });
}
if (!hasImport) changes.push({ relative: loginRel, output: loginPath, contents: Buffer.from(login, "utf8"), backUp: true });
if (process.argv.includes("--check")) {
  console.log("Vorprüfung erfolgreich. Änderungen:", changes.map((item) => item.relative));
  process.exit(0);
}
if (!changes.length) { console.log("DJI Stufe 3B ist bereits eingebaut. Keine Dateien geändert."); process.exit(0); }

const archive = path.join(path.dirname(root), "rehkitzrettung-backups", "dji-map-3b-" + new Date().toISOString().replace(/[:.]/g, "-"));
try {
  fs.mkdirSync(archive, { recursive: true });
  for (const item of changes) {
    if (!item.backUp) continue;
    const backup = path.join(archive, item.relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(item.output, backup, fs.constants.COPYFILE_EXCL);
  }
  for (const item of changes) {
    fs.mkdirSync(path.dirname(item.output), { recursive: true });
    fs.writeFileSync(item.output, item.contents);
    console.log("Installiert: " + item.relative);
  }
  console.log("Sicherung außerhalb des Projektordners:", archive);
  console.log("Prisma, .env-Dateien, MQTT, Nginx und der WebSocket-Dienst wurden nicht geändert.");
} catch (reason) {
  console.error("Installationsfehler. Bitte Dateien und Sicherungen prüfen:", reason.message);
  process.exit(1);
}
