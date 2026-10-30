/** Rehkitzrettung / DJI: heutige Teamaufträge und lokale Workspace-ID. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = process.cwd();
const payload = path.join(__dirname, "dji-heute-paket");
const stop = (m) => { console.error("ABBRUCH: " + m); process.exit(1); };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function readFile(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile() || fs.lstatSync(p).isSymbolicLink()) stop("Datei fehlt oder ist ein Link: " + rel);
  return fs.readFileSync(p);
}
if (!fs.existsSync(path.join(root,"package.json"))) stop("Im Projektordner C:\\Projekte\\rehkitzrettung starten.");
let pkg;
try { pkg = JSON.parse(readFile("package.json").toString()); } catch { stop("package.json unlesbar."); }
if (pkg.name !== "rehkitzrettung") stop("Das ist nicht das Rehkitzrettungs-Projekt.");
const changes = [
  {
    target: "app/api/dji/pilot-sessions/route.ts", source: "route.ts.txt",
    originalSha: "53427680e439b3b7900d00e48014a089b0af0083f4ca2850d7132233087dbafd",
    nextSha: "ffbc35c0ae90b9a78945d22eadc1340c45f6ab5cc2b9e69ba50f6433938d5321",
  },
  {
    target: "components/dji/PilotLoginClient.tsx", source: "PilotLoginClient.tsx.txt",
    originalSha: "6306f08e4cb779a58f2f1581201dda5653b95750e483d2e193c4ae65d73e0b3d",
    nextSha: "361e09280347309ac136f5ab4e5c7b158c4e7c2abea480a8dba70860e4017549",
  },
];
const pending = changes.map((c) => {
  const old = readFile(c.target);
  const nextFile = path.join(payload, c.source);
  if (!fs.existsSync(nextFile)) stop("Datei im ZIP fehlt: " + c.source);
  const next = fs.readFileSync(nextFile);
  if (sha(next) !== c.nextSha) stop("Das Paket ist beschädigt: " + c.source);
  const currentSha = sha(old);
  if (currentSha !== c.originalSha && currentSha !== c.nextSha) {
    stop("Deine Datei weicht von der bekannten DJI-Version ab: " + c.target + ". Nichts überschrieben; bitte die Datei zeigen.");
  }
  return { ...c, needsUpdate: currentSha !== c.nextSha, next };
});
// Workspace UUID: einmalig pro Hegering, nicht als DJI App-ID verwechseln.
const localEnv = path.join(root, ".env.local");
const globalEnv = path.join(root, ".env");
const envValues = [];
for (const p of [localEnv, globalEnv]) {
  if (!fs.existsSync(p)) continue;
  if (fs.lstatSync(p).isSymbolicLink()) stop("Env-Datei ist ein Link: " + path.basename(p));
  const raw = fs.readFileSync(p,"utf8");
  const values = [...raw.matchAll(/^\s*(?:export\s+)?DJI_WORKSPACE_ID\s*=\s*(.*?)\s*$/gm)]
    .map(x => x[1].trim().replace(/^(["'])(.*)\1$/,"$2"));
  if (values.length > 1) stop("Mehrfach definierte DJI_WORKSPACE_ID in " + path.basename(p));
  if (values.length === 1) envValues.push({file:p, value:values[0]});
}
for (const v of envValues) {
  if (!uuidRe.test(v.value)) stop("DJI_WORKSPACE_ID ist in " + path.basename(v.file) + " keine gültige UUID. Bitte erst korrigieren.");
}
const needsWorkspace = envValues.length === 0;
const modified = pending.filter(c => c.needsUpdate);
if (modified.length === 0 && !needsWorkspace) {
  console.log("Schon installiert: Auftragsfilter und Workspace-ID vorhanden. Keine Änderung.");
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[:.]/g,"-");
// Backups vor jeder Änderung, auch von .env.local, falls vorhanden.
for (const c of modified) {
  const dest = path.join(root,c.target);
  const backup = `${dest}.backup-dji-heute-${stamp}`;
  fs.copyFileSync(dest,backup,fs.constants.COPYFILE_EXCL);
  console.log("Gesichert: " + path.relative(root,backup));
}
if (needsWorkspace && fs.existsSync(localEnv)) {
  fs.copyFileSync(localEnv,`${localEnv}.backup-dji-heute-${stamp}`,fs.constants.COPYFILE_EXCL);
  console.log("Gesichert: .env.local");
}
for (const c of modified) {
  fs.writeFileSync(path.join(root,c.target),c.next);
  console.log("Aktualisiert: " + c.target);
}
if (needsWorkspace) {
  const existing = fs.existsSync(localEnv) ? fs.readFileSync(localEnv,"utf8") : "";
  const newline = existing.includes("\r\n") ? "\r\n" : "\n";
  const prefix = existing.length && !/\r?\n$/.test(existing) ? newline : "";
  fs.appendFileSync(localEnv, `${prefix}# Einmalige ID des Rehkitzrettungs-DJI-Workspaces (auch später auf dem Ubuntu-Server verwenden)${newline}DJI_WORKSPACE_ID=${crypto.randomUUID()}${newline}`, { encoding:"utf8", mode:0o600 });
  console.log("DJI_WORKSPACE_ID einmalig in .env.local erstellt (keine Zugangsdaten ausgegeben).");
} else {
  console.log("Vorhandene Workspace-ID beibehalten.");
}
console.log("Fertig. Keine Prisma- oder Datenbankänderung.");
console.log("Next.js neu starten und testen: npx.cmd tsc --noEmit ; npm.cmd run build ; npm.cmd run dev");
