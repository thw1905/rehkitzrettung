"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const file = path.join(root,"app","pilot-login","page.tsx");
const payload = path.join(root,"dji-webview-paket","pilot-return.txt");
const anchor = "  return <PilotLoginClient />;";
if (!fs.existsSync(path.join(root,"package.json")) || !fs.existsSync(file) || !fs.existsSync(payload)) {
  console.error("ABBRUCH: Installationspaket und /pilot-login fehlen. Im Projektordner starten.");
  process.exit(1);
}
const orig = fs.readFileSync(file,"utf8");
if (orig.includes("DJI_VIEW_COMPAT_V1")) {
  console.log("DJI-WebView-Oberflaeche bereits installiert. Keine Aenderung.");
  process.exit(0);
}
if (!orig.includes(anchor) || orig.split(anchor).length !== 2 || !orig.includes('export default function PilotLoginPage()')) {
  console.error("ABBRUCH: pilot-login/page.tsx hat eine abweichende Struktur. Nichts ueberschrieben.");
  process.exit(1);
}
const patch = fs.readFileSync(payload, "utf8");
const next = orig.replace(anchor, patch);
if (!next.includes("DJI_VIEW_COMPAT_V1") || !next.includes("<PilotLoginClient />")) {
  console.error("ABBRUCH: Patch nicht plausibel.");
  process.exit(1);
}
if (process.argv.includes("--check")) {
  console.log("Pruefung erfolgreich: app/pilot-login/page.tsx wuerde angepasst. Keine Aenderung.");
  process.exit(0);
}
const backupFolder = path.resolve(root, "..", "rehkitzrettung-dji-ui-backups");
fs.mkdirSync(backupFolder,{recursive:true});
const backup = path.join(backupFolder,"pilot-login-page-"+ new Date().toISOString().replace(/[:.]/g,"-") + ".txt");
fs.writeFileSync(backup,orig,"utf8");
fs.writeFileSync(file,next,"utf8");
console.log("DJI-Layout-Korrektur eingebaut: app/pilot-login/page.tsx");
console.log("Sicherung ausserhalb des Next.js-Projekts:",backup);
console.log("Nur Darstellung auf /pilot-login; keine Aenderung von APIs, Datenbank, DJI-Bridge oder MQTT.");
