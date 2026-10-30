"use strict";
// DJI Pilot 2 verification state check before loading the API module.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const target = path.join(process.cwd(), "components", "dji", "Pilot2BridgeSetup.tsx");
if (!fs.existsSync(target)) {
  console.error("ABBRUCH: components/dji/Pilot2BridgeSetup.tsx nicht gefunden."); process.exit(1);
}
let src = fs.readFileSync(target, "utf8");
const marker = 'async function waitUntilDjiVerified(bridge: Bridge) {';
const oldLine = '      assertSuccess(bridge.platformVerifyLicense(license.appId, license.appKey, license.license), "Lizenzprüfung");';
const oldStatus = '      // DJI requires the API module before any map endpoints can be used.';
if (src.includes(marker) && src.includes('await waitUntilDjiVerified(bridge);')) {
  console.log("DJI-Verifizierungsstatus-Prüfung bereits installiert."); process.exit(0);
}
for (const [name, anchor] of [["DJI-Lizenzaufruf", oldLine], ["Modulanker", oldStatus], ["Hilfsanker", 'function assertSuccess(raw: unknown, step: string) {'], ["Diagnosefunktion", 'function safeDjiMessage(value: unknown): string {']]) {
  if (src.split(anchor).length !== 2) {
    console.error("ABBRUCH: Unbekannte Datei-Version bei " + name + ". Keine Änderung vorgenommen."); process.exit(1);
  }
}
const helpers = String.raw`function readDjiVerified(raw: unknown): { verified: boolean; explanation: string } {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); }
    catch { return { verified: false, explanation: "Antwort ist kein gültiges JSON" }; }
  }
  if (typeof value === "boolean") return { verified: value, explanation: "verifiziert=" + value };
  if (!value || typeof value !== "object") return { verified: false, explanation: "Status nicht lesbar" };
  const result = value as Record<string, unknown>;
  const d = result.data;
  let verified: boolean | null = typeof d === "boolean" ? d : null;
  if (d && typeof d === "object") {
    const nested = d as Record<string, unknown>;
    if (typeof nested.verified === "boolean") verified = nested.verified;
    if (typeof nested.isVerified === "boolean") verified = nested.isVerified;
  }
  const code = typeof result.code === "number" ? result.code : null;
  const parts: string[] = [];
  if (code !== null) parts.push("code=" + code);
  if (verified !== null) parts.push("verifiziert=" + verified);
  const message = safeDjiMessage(result.message);
  if (message) parts.push(message);
  return { verified: verified === true && (code === null || code === 0), explanation: parts.join(", ") || "Keine Statusangabe" };
}

async function waitUntilDjiVerified(bridge: Bridge) {
  if (!bridge.platformIsVerified) {
    throw new Error("DJI Pilot 2 stellt platformIsVerified nicht bereit; Statusprüfung nicht möglich.");
  }
  let reason = "keine Antwort";
  // DJI may acknowledge the license method before verification is visible to the next JSBridge call.
  for (let attempt = 0; attempt < 11; attempt++) {
    let raw: unknown;
    try { raw = bridge.platformIsVerified(); }
    catch { throw new Error("DJI konnte den Verifizierungsstatus nicht abfragen."); }
    const state = readDjiVerified(raw);
    if (state.verified) return;
    reason = state.explanation;
    if (attempt < 10) await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("DJI bestätigt die App-Verifizierung nicht (" + reason + "). Bitte prüfen, ob die Cloud-API-App im DJI Developer Center aktiviert ist und App-ID, Key und License zusammengehören.");
}

`;
src = src.replace('function assertSuccess(raw: unknown, step: string) {', helpers + 'function assertSuccess(raw: unknown, step: string) {');
src = src.replace(oldLine, oldLine + '\n      setStatus("Lizenzaufruf erfolgreich. DJI-Verifizierungsstatus wird geprüft …");\n      await waitUntilDjiVerified(bridge);\n      setStatus("DJI-App-Verifizierung bestätigt. API-Modul wird geladen …");');
if (process.argv.includes("--check")) { console.log("Prüfung OK; Änderung kann installiert werden."); process.exit(0); }
const backupDir = path.join(process.cwd(), "dji-backups");
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, "Pilot2BridgeSetup.before-verify-fix." + new Date().toISOString().replace(/[:.]/g, "-") + ".bak");
fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
const tmp = target + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
try { fs.writeFileSync(tmp, src, { flag: "wx" }); fs.renameSync(tmp, target); }
catch (e) { try { fs.unlinkSync(tmp); } catch {} console.error("Installationsfehler:", e.message); process.exit(1); }
console.log("DJI-Verifizierungsprüfung installiert. Sicherung:", backup);
console.log("Keine Datenbank-, MQTT-, Lizenz- oder Serverkonfiguration geändert.");
