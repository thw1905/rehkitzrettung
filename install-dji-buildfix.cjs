/**
 * Rehkitzrettung - lokaler Buildfix für DJI Stufe 1/2A + Teamtreffpunkte.
 * Ändert nur die jeweils geprüften Dateien, sichert Originalsicherungen daneben.
 * Führt absichtlich KEINE Datenbankbefehle aus.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();
function stop(reason) { console.error("ABBRUCH (keine neuen Änderungen): " + reason); process.exit(1); }
function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) stop("Datei fehlt: " + rel);
  return fs.readFileSync(abs, "utf8");
}
function schemaFix(text) {
  const blockRe = /model OperationDayTeam\s*\{([\s\S]*?)^\}/m;
  const match = text.match(blockRe);
  if (!match) stop("Prisma-Modell OperationDayTeam nicht gefunden.");
  if (/^\s*meetingPointText\s+String\?\s*$/m.test(match[1])) return text;
  if (/^\s*meetingPointText\b/m.test(match[1])) stop("meetingPointText existiert mit unerwartetem Typ.");
  const lineRe = /(model OperationDayTeam\s*\{\r?\n)/;
  return text.replace(lineRe, "$1  meetingPointText String?\n");
}
function routeFix(text) {
  const oldLine = 'const userId = String((admin.session.user as { id?: string }).id || "");';
  const updatedLine = 'const userId = String((admin.session?.user as { id?: string } | undefined)?.id || "");';
  if (text.includes(updatedLine) && text.includes('Benutzer-ID fehlt.')) return text;
  if (!text.includes(oldLine)) stop("DJI-Testimport enthält unerwarteten Code. Keine automatische Änderung.");
  return text.replace(oldLine, `${updatedLine}\n  if (!userId) return NextResponse.json({ error: "Benutzer-ID fehlt." }, { status: 401 });`);
}
function tsconfigFix(text) {
  let config;
  try { config = JSON.parse(text); } catch { stop("tsconfig.json ist kein erwartetes JSON."); }
  if (!Array.isArray(config.exclude)) stop("tsconfig.json: exclude fehlt oder ist kein Array.");
  const additions = ["dji-install-files", "dji-stage2-files"];
  if (additions.every(name => config.exclude.includes(name))) return text;
  // Keine Umformatierung der übrigen Konfiguration. Nur das vorhandene exclude-Array erweitern.
  const rx = /("exclude"\s*:\s*\[)([^\]]*)(\])/;
  const match = text.match(rx);
  if (!match || !match[2].includes('"node_modules"')) stop("tsconfig.json: unerwartetes exclude-Format.");
  const extras = additions.filter(name => !config.exclude.includes(name));
  const interior = match[2].trim().replace(/,\s*$/, "");
  const rep = `${match[1]}${interior}${extras.map(name => `, "${name}"`).join("")}${match[3]}`;
  const result = text.replace(rx, rep);
  try { JSON.parse(result); } catch { stop("Die tsconfig-Aktualisierung wäre nicht gültig."); }
  return result;
}
if (!fs.existsSync(path.join(root, "package.json"))) stop("Bitte in C:\\Projekte\\rehkitzrettung ausführen.");
let pkg; try { pkg = JSON.parse(read("package.json")); } catch { stop("package.json konnte nicht gelesen werden."); }
if (pkg.name !== "rehkitzrettung") stop("Falsches Projekt.");
const changes = [
  {rel:"prisma/schema.prisma", fn:schemaFix},
  {rel:"app/api/admin/dji/test-import/route.ts", fn:routeFix},
  {rel:"tsconfig.json", fn:tsconfigFix},
];
const pending = changes.map(({rel,fn})=> {
  const before = read(rel);
  const after = fn(before);
  return {rel,before,after};
});
const updated = pending.filter(x => x.before !== x.after);
if (!updated.length) { console.log("Buildfix ist bereits installiert. Keine Dateien geändert."); process.exit(0); }
// Vor dem ersten Schreiben alle Sicherheitskopien erstellen.
const stamp = new Date().toISOString().replace(/[:.]/g,"-");
for (const {rel} of updated) {
  const backup = path.join(root, rel) + `.backup-dji-buildfix-${stamp}`;
  fs.copyFileSync(path.join(root, rel), backup, fs.constants.COPYFILE_EXCL);
  console.log("Sicherung: " + path.relative(root, backup));
}
for (const {rel,after} of updated) {
  fs.writeFileSync(path.join(root, rel), after, "utf8");
  console.log("Korrigiert: " + rel);
}
console.log("Fertig. Keine Datenbankänderung ausgeführt.");
console.log("Danach lokale SQLite-Datenbank sichern, Schema synchronisieren und Prisma Client neu generieren.");
