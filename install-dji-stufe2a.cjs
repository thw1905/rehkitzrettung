/* Rehkitzrettung – DJI Pilot 2 Stufe 2A: ausschließlich neue Dateien hinzufügen. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const project = __dirname;
const source = path.join(project, "dji-stage2-files");
function stop(message) { console.error("INSTALLATION ABGEBROCHEN:", message); process.exit(1); }
function list(base, rel = "") {
  return fs.readdirSync(path.join(base, rel), {withFileTypes: true}).flatMap(item => {
    if (item.isSymbolicLink()) stop("Symbolischer Link im Paket nicht gestattet: " + item.name);
    const next = path.join(rel, item.name);
    return item.isDirectory() ? list(base, next) : [next];
  });
}
function digest(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
if (!fs.existsSync(source)) stop("Ordner dji-stage2-files fehlt. ZIP vollstaendig entpacken.");
const pkgPath = path.join(project, "package.json");
const schemaPath = path.join(project, "prisma", "schema.prisma");
if (!fs.existsSync(pkgPath) || !fs.existsSync(schemaPath)) stop("Nicht im Rehkitzrettung-Projektordner.");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (pkg.name !== "rehkitzrettung") stop("Anderes Projekt gefunden.");
const schema = fs.readFileSync(schemaPath, "utf8");
if (!schema.includes("model DjiPilotSession") || !schema.includes("model DjiMapElement")) {
  stop("DJI-Stufe 1 ist noch nicht installiert (Prisma-Modelle fehlen). Zuerst Stufe 1 einrichten.");
}
for (const f of ["lib/dji/token.ts", "app/api/dji/pilot-sessions/route.ts"]) {
  if (!fs.existsSync(path.join(project, f))) stop("DJI-Stufe 1 ist unvollstaendig: " + f);
}
const allFiles = list(source);
const conflicts = allFiles.filter(rel => fs.existsSync(path.join(project, rel)) &&
  (fs.lstatSync(path.join(project, rel)).isSymbolicLink() || digest(path.join(project, rel)) !== digest(path.join(source, rel))));
if (conflicts.length) stop("Abweichende Dateien vorhanden. Nichts ueberschrieben:\n" + conflicts.join("\n"));
let added = 0;
for (const rel of allFiles) {
  const dest = path.join(project, rel);
  if (fs.existsSync(dest)) { console.log("Bereits vorhanden: " + rel); continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(source, rel), dest, fs.constants.COPYFILE_EXCL);
  added++;
}
console.log("DJI-Stufe 2A: " + added + " neue Datei(en) installiert.");
console.log("Keine vorhandenen Programmdateien, Datenbanken oder .env-Dateien veraendert.");
console.log("Start/Pruefung: npx tsc --noEmit ; npm run build ; npm run dev");
console.log("Testseite: http://localhost:3000/pilot-login");
console.log("WICHTIG: Noch keine Cloud-Verbindung oder automatische DJI-Funduebertragung.");
