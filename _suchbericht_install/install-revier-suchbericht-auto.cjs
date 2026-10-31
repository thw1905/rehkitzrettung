"use strict";
// Vorsichtiger Installer: KEINE fremden Projektdateien ersetzen, sondern
// zwei neue lib-Dateien hinzufuegen und kleine Erweiterungen im AKTUELLEN
// schema.prisma und der AKTUELLEN Auftrags-API vornehmen.
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const source = __dirname;
const preview = process.argv.includes("--check");
function fail(message) { console.error("ABBRUCH:", message); process.exit(1); }
function get(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) fail(`Datei fehlt: ${relative}`);
  return fs.readFileSync(file, "utf8");
}
const routeName = "app/api/orders/[id]/route.ts";
const schemaName = "prisma/schema.prisma";
let route = get(routeName);
let schema = get(schemaName);
const nl = route.includes("\r\n") ? "\r\n" : "\n";
if (!fs.existsSync(path.join(root, "lib/revier-search-report-template.ts")) ||
    !fs.existsSync(path.join(root, "lib/revier-search-report-template-store.ts"))) {
  fail("Suchbericht-Vorlagenverwaltung ist nicht vollstaendig installiert (beide lib/revier-search-report-template*.ts fehlen). Die bisherige Erweiterung bitte zuerst einspielen.");
}
if (/\bmodel\s+RevierSearchReportDispatch\s*\{/.test(schema) ||
    route.includes("REHKITZ_REV_REPORT_AUTO_V1")) {
  fail("Die Suchbericht-Automatik oder das zugehoerige Prisma-Modell scheint bereits eingebaut. Bitte keine doppelte Installation.");
}
const importAnchor = 'import { maybeSendFlightAfterOrderCompleted } from "@/lib/flight-certificates";';
if (route.split(importAnchor).length !== 2) fail("Unbekannte Version der Auftrags-API: Import fuer Befliegungsnachweis nicht eindeutig vorhanden.");
const finishAnchor = /^([ \t]*)if \(order\.status === "ERLEDIGT"\) \{/gm;
const matches = [...route.matchAll(finishAnchor)];
if (matches.length !== 2) {
  fail(`Unbekannte Abschlusslogik (erwartet: 2 Abschlussstellen, gefunden: ${matches.length}). Keine Aenderungen vorgenommen.`);
}
for (const name of ["lib/revier-search-report-auto.ts"]) {
  if (fs.existsSync(path.join(root, name))) fail(`Vorhandene Datei wird nicht ueberschrieben: ${name}`);
}
const snippet = fs.readFileSync(path.join(source, "SCHEMA-ERGAENZUNG.prisma"), "utf8");
const reportSrc = fs.readFileSync(path.join(source, "lib/revier-search-report-auto.ts"), "utf8");
const matchIndent = (indent) => {
  // marker macht das Patch eindeutig identifizierbar
  return [
    `${indent}// REHKITZ_REV_REPORT_AUTO_V1: Nur nach tatsaechlichem Abschluss`,
    `${indent}if (nextStatus === OrderStatus.ERLEDIGT && existingOrder.status !== OrderStatus.ERLEDIGT) {`,
    `${indent}  try {`,
    `${indent}    await maybeSendRevierReportAfterOrderCompleted(order.id);`,
    `${indent}  } catch (error) {`,
    `${indent}    // Ein Mailfehler darf den abgeschlossenen Auftrag nie rueckgaengig machen.`,
    `${indent}    console.error("Suchbericht beim Auftragsabschluss:", error);`,
    `${indent}  }`,
    `${indent}}`,
    `${indent}if (order.status === "ERLEDIGT") {`,
  ].join(nl);
};
const nextRoute = route.replace(importAnchor,
  importAnchor + nl + 'import { maybeSendRevierReportAfterOrderCompleted } from "@/lib/revier-search-report-auto";'
).replace(finishAnchor, (_whole, indent) => matchIndent(indent));
if ((nextRoute.match(/REHKITZ_REV_REPORT_AUTO_V1/g) || []).length !== 2 ||
    !nextRoute.includes('await maybeSendFlightAfterOrderCompleted(order.id);')) {
  fail("Sicherheitspruefung der geaenderten Auftrags-API fehlgeschlagen.");
}
const nextSchema = schema.trimEnd() + "\n\n" + snippet.trim() + "\n";
console.log("VORPRUEFUNG OK: Beide vorhandenen Abschlussstellen erkannt.");
console.log("Geplant: Hinzufuegen des Prisma-Modells (nur additive Aenderung), zwei Abschluss-Hooks, neue lib/revier-search-report-auto.ts.");
if (preview) { console.log("Pruefmodus: Keine Dateien veraendert."); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".backups", `revier-suchbericht-auto-${stamp}`);
fs.mkdirSync(path.join(backupRoot, "prisma"), { recursive: true });
fs.mkdirSync(path.join(backupRoot, "app/api/orders/[id]"), { recursive: true });
fs.copyFileSync(path.join(root, schemaName), path.join(backupRoot, schemaName));
fs.copyFileSync(path.join(root, routeName), path.join(backupRoot, routeName));
try {
  fs.writeFileSync(path.join(root, "lib/revier-search-report-auto.ts"), reportSrc, { flag: "wx" });
  fs.writeFileSync(path.join(root, schemaName), nextSchema, "utf8");
  fs.writeFileSync(path.join(root, routeName), nextRoute, "utf8");
  console.log("INSTALLATION OK. Backup:", backupRoot);
  console.log("Jetzt Datenbanksicherung + npx prisma db push + npx prisma generate und anschliessend npm run build.");
  console.log("OHNE REVIER_SEARCH_REPORT_AUTO_SEND=true werden noch KEINE echten Mails versendet.");
} catch (error) {
  console.error("Installationsfehler, versuche Rueckbau:", error);
  fs.copyFileSync(path.join(backupRoot, schemaName), path.join(root, schemaName));
  fs.copyFileSync(path.join(backupRoot, routeName), path.join(root, routeName));
  fs.rmSync(path.join(root, "lib/revier-search-report-auto.ts"), { force: true });
  process.exit(1);
}
