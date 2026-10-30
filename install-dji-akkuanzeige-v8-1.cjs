"use strict";
// DJI_BATTERY_PLACEMENT_V8_1: display existing V8 recommendation in two places only:
// /my-orders as an inline block and the authenticated /pilot-login DJI page.
// No Prisma migrations, data changes, MQTT/WS/Map/PinPoint or recommendation API changes.
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const MARK = "DJI_BATTERY_PLACEMENT_V8_1";
const files = {
  rootLayout: "app/layout.tsx",
  pilot: "components/dji/PilotSimpleClient.tsx",
  card: "components/dji/DjiGlobalBatteryRecommendation.tsx",
  ordersLayout: "app/my-orders/layout.tsx",
};
const v8Import = 'import DjiGlobalBatteryRecommendation from "@/components/dji/DjiGlobalBatteryRecommendation";\n';
const v8Injection = '  {/* DJI_BATTERY_GLOBAL_V8: always available to authenticated pilots. */}\n  <DjiGlobalBatteryRecommendation />\n';
const pilotSection = '<section className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">';
const oldAside = 'className="pointer-events-none fixed bottom-3 right-3 z-[9999] w-[min(350px,calc(100vw-24px))] text-slate-900"';
const newAside = 'className="w-full text-slate-900"';
const oldSection = 'className="pointer-events-auto overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl"';
const newSection = 'className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm"';

function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function containsOnce(content, needle, where) {
  const count = content.split(needle).length - 1;
  if (count !== 1) throw new Error(`${where}: Erwarteter Abschnitt nicht eindeutig vorhanden (Anzahl ${count}). Keine Dateien geaendert.`);
}
function requireFile(rel) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`Datei fehlt: ${rel}. Keine Dateien geaendert.`);
}
function inspect() {
  requireFile("package.json");
  for (const rel of [files.rootLayout, files.pilot, files.card, "app/api/dji/pilot2/battery-overlay/route.ts"]) requireFile(rel);
  const rootLayout = read(files.rootLayout);
  const pilot = read(files.pilot);
  const card = read(files.card);
  const existing = fs.existsSync(path.join(root, files.ordersLayout));
  const already = rootLayout.includes(MARK) || pilot.includes(MARK) || card.includes(MARK) || existing && read(files.ordersLayout).includes(MARK);
  if (already) {
    if (rootLayout.includes(MARK) && pilot.includes(MARK) && card.includes(MARK) && existing && read(files.ordersLayout).includes(MARK)) {
      return { already: true };
    }
    throw new Error("V8.1 ist nur teilweise installiert oder zwischenzeitlich geaendert. Keine Dateien geaendert.");
  }
  if (existing) throw new Error(`${files.ordersLayout} existiert bereits. Diese Datei wird nicht ueberschrieben. Bitte Inhalt zeigen.`);
  if (!rootLayout.includes("DJI_BATTERY_GLOBAL_V8") || !card.includes("DJI_BATTERY_GLOBAL_V8") || !pilot.includes("DJI_BATTERY_GLOBAL_V8")) {
    throw new Error("V8-Marker fehlt in Layout, Komponente oder Pilotenseite. Keine Dateien geaendert.");
  }
  containsOnce(rootLayout, v8Import, files.rootLayout);
  containsOnce(rootLayout, v8Injection, files.rootLayout);
  containsOnce(pilot, pilotSection, files.pilot);
  containsOnce(pilot, '"use client";\n', files.pilot);
  if (pilot.includes('import DjiGlobalBatteryRecommendation')) throw new Error("Pilotenseite importiert die Empfehlung bereits; Abbruch statt Doppelanzeige.");
  containsOnce(card, oldAside, files.card);
  containsOnce(card, oldSection, files.card);
  if (rootLayout.includes("<DjiGlobalBatteryRecommendation />") && rootLayout.split("<DjiGlobalBatteryRecommendation />").length !== 2) {
    throw new Error("Root-Layout enthaelt mehrere Akkuanzeigen. Abbruch.");
  }
  return { rootLayout, pilot, card, already: false };
}
function prepare(old) {
  const newRoot = old.rootLayout.replace(v8Import, "").replace(v8Injection, '  {/* '+MARK+': V8 wird nur in /my-orders und /pilot-login angezeigt. */}\n');
  const newPilot = old.pilot
    .replace('"use client";\n', '"use client";\n\n' + v8Import)
    .replace(pilotSection, `{/* ${MARK}: Akkuempfehlung vor dem ersten Start sichtbar, auch ohne Tagesauftrag. */}\n          <DjiGlobalBatteryRecommendation />\n          ` + pilotSection);
  const newCard = old.card.replace(oldAside, newAside).replace(oldSection, newSection)
    .replace("// DJI_BATTERY_GLOBAL_V8: unobtrusive global pilot overlay, including DJI Pilot 2 webview.",
      "// " + MARK + ": inline card for My Orders and DJI Pilot 2; never a floating overlay.");
  const newOrders = `// ${MARK}: Akkuempfehlung ausschliesslich auf der Seite Meine Auftraege.\nimport type { ReactNode } from "react";\nimport DjiGlobalBatteryRecommendation from "@/components/dji/DjiGlobalBatteryRecommendation";\n\nexport default function MyOrdersBatteryLayout({ children }: { children: ReactNode }) {\n  return (\n    <>\n      <div className="mx-auto w-full max-w-5xl px-4 pt-4">\n        <DjiGlobalBatteryRecommendation />\n      </div>\n      {children}\n    </>\n  );\n}\n`;
  return {
    [files.rootLayout]: newRoot,
    [files.pilot]: newPilot,
    [files.card]: newCard,
    [files.ordersLayout]: newOrders,
  };
}
function apply(changes) {
  const backup = path.join(root, ".backups", "dji-akkuanzeige-v8-1-" + new Date().toISOString().replace(/[:.]/g,"-"));
  fs.mkdirSync(backup, { recursive: true });
  // Back up all existing source files before touching ANY of them.
  const originals = {};
  for (const rel of Object.keys(changes)) {
    const target = path.join(root, rel);
    const present = fs.existsSync(target);
    originals[rel] = present;
    if (present) {
      const dest = path.join(backup, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(target, dest, fs.constants.COPYFILE_EXCL);
    }
  }
  const modified = [];
  try {
    for (const [rel, source] of Object.entries(changes)) {
      const target = path.join(root, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source, { flag: originals[rel] ? "w" : "wx", encoding: "utf8" });
      modified.push(rel);
    }
  } catch (e) {
    for (const rel of modified.reverse()) {
      try {
        const dest = path.join(root, rel);
        if (originals[rel]) fs.copyFileSync(path.join(backup, rel), dest);
        else fs.unlinkSync(dest);
      } catch (err) { console.error("MANUELLE RUECKSICHERUNG erforderlich:", rel); }
    }
    throw e;
  }
  return backup;
}
try {
  const old = inspect();
  if (old.already) {
    console.log("V8.1 bereits installiert. Keine Aenderungen.");
    process.exit(0);
  }
  const changes = prepare(old);
  if (checkOnly) {
    console.log("VORPRUEFUNG OK: V8-Anzeige nur auf Meine Auftraege und DJI-Pilotenseite als eingebetteter Abschnitt.");
    console.log("Aenderungen: app/layout.tsx, app/my-orders/layout.tsx (neu), PilotSimpleClient.tsx, DjiGlobalBatteryRecommendation.tsx.");
    console.log("Keine Aenderung an API, Datenbank, Berechnung, MQTT, Drohnenerkennung, PinPoints, WebSocket oder Karten.");
    process.exit(0);
  }
  const backup = apply(changes);
  console.log("DJI Akkuanzeige V8.1 installiert. Sicherungen:", backup);
  console.log("Empfehlung nur auf /my-orders und fuer angemeldete Piloten auf /pilot-login; kein schwebendes Overlay mehr.");
  console.log("Bitte zuerst npm run build ausfuehren; erst danach commit/push und Server-Deployment.");
} catch (e) {
  console.error("ABBRUCH: " + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
}
