"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const page = path.join(root, "app", "pilot-login", "page.tsx");
const out = path.join(root, "app", "pilot-login", "layout.tsx");
const source = path.join(root, "paket", "app", "pilot-login", "layout.tsx");
if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(page) || !fs.existsSync(source)) {
  console.error("ABBRUCH: Im Rehkitzrettungs-Projektordner mit entpacktem ZIP starten.");
  process.exit(1);
}
const pageText = fs.readFileSync(page, "utf8");
if (!pageText.includes("PilotSimpleClient") && !pageText.includes("PilotLoginClient")) {
  console.error("ABBRUCH: /pilot-login ist unbekannt. Keine Datei veraendert.");
  process.exit(1);
}
const wanted = fs.readFileSync(source, "utf8");
if (fs.existsSync(out)) {
  if (fs.readFileSync(out, "utf8") === wanted) {
    console.log("DJI-Layout bereits installiert. Keine Aenderung.");
    process.exit(0);
  }
  console.error("ABBRUCH: app/pilot-login/layout.tsx ist bereits vorhanden und abweichend. Nichts ueberschrieben.");
  process.exit(1);
}
if (process.argv.includes("--check")) {
  console.log("Pruefung OK: /pilot-login haette ein neues, kompatibles Layout. Keine Aenderung.");
  process.exit(0);
}
fs.writeFileSync(out, wanted, { flag: "wx" });
console.log("OK: app/pilot-login/layout.tsx NEU angelegt.");
console.log("app/pilot-login/page.tsx und alle bisherigen Funktionen UNVERAENDERT.");
console.log("Keine Datenbank-, MQTT- oder Serverkonfiguration veraendert.");
