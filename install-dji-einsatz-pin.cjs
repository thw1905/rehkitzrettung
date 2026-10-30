"use strict";
// Targeted installer for the Rehkitzrettung repository. No Prisma or server config changes.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = process.cwd();
const rel = (...parts) => path.join(root, ...parts);
const component = rel("components", "dji", "PilotSimpleClient.tsx");
const layout = rel("app", "pilot-login", "layout.tsx");
const techPage = rel("app", "pilot-login", "technik", "page.tsx");
const gateDest = rel("components", "dji", "DjiTechnicalPinGate.tsx");
const gateSource = rel("paket", "components", "dji", "DjiTechnicalPinGate.tsx");
const packageFile = rel("package.json");
function fail(message) { throw new Error("ABBRUCH: " + message + " (keine Dateien überschrieben)"); }
function read(file) { if (!fs.existsSync(file)) fail("Datei fehlt: " + path.relative(root, file)); return fs.readFileSync(file, "utf8"); }
function replaceOne(text, oldText, newText, label) {
  if (text.includes(newText)) return text; // idempotent; replacement may include old text
  if (text.split(oldText).length !== 2) fail("Unerwarteter Stand bei " + label);
  return text.replace(oldText, newText);
}
function count(text, pattern) { return (text.match(pattern) || []).length; }
try {
  if (!fs.existsSync(packageFile)) fail("Bitte im Projektordner C:\\Projekte\\rehkitzrettung starten");
  const original = read(component);
  const originalLayout = read(layout);
  const originalTech = read(techPage);
  const gateText = read(gateSource);
  if (fs.existsSync(gateDest) && read(gateDest) !== gateText) fail("DjiTechnicalPinGate.tsx existiert bereits in anderer Version");

  // 1. Match the successful manual sequence: verify -> actually verified -> API -> workspace -> WS -> map.
  let next = original;
  next = replaceOne(next,
    '  platformVerifyLicense?: (appId: string, appKey: string, license: string) => string;',
    '  platformVerifyLicense?: (appId: string, appKey: string, license: string) => string;\n  platformIsVerified?: () => string | boolean;',
    "DJI-Bridge-Type");
  const verificationHelpers = `
function isVerifiedReply(value: unknown): boolean {
  if (value === true || value === "true") return true;
  const result = reply(value);
  if (result.code !== undefined && result.code !== 0) return false;
  if (result.data === true || result.data === "true") return true;
  if (result.data && typeof result.data === "object") {
    const d = result.data as { verified?: unknown; isVerified?: unknown };
    return d.verified === true || d.isVerified === true;
  }
  return false;
}
async function waitForDjiVerification(b: DjiBridge) {
  if (!b.platformIsVerified) throw new Error("DJI-Verifizierungsstatus nicht verfügbar.");
  for (let attempt = 0; attempt < 12; attempt++) {
    if (isVerifiedReply(b.platformIsVerified())) return;
    if (attempt < 11) await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("DJI meldet die App noch nicht als verifiziert. Bitte Lizenz und Freigabe unter Technik prüfen.");
}
`;
  next = replaceOne(next,
    'function connectionState(): "VERBUNDEN" | "UNVOLLSTAENDIG" | "UNBEKANNT" {',
    verificationHelpers + '\nfunction connectionState(): "VERBUNDEN" | "UNVOLLSTAENDIG" | "UNBEKANNT" {',
    "DJI-Verifizierung");
  // If already fully connected, do not reload components on each tap.
  next = replaceOne(next,
    '      if (window.location.protocol !== "https:") throw new Error("Für DJI wird HTTPS benötigt.");',
    '      if (window.location.protocol !== "https:") throw new Error("Für DJI wird HTTPS benötigt.");\n      if (token && connectionState() === "VERBUNDEN") { setPhase("DJI bereits verbunden – du kannst weiterarbeiten"); return; }',
    "Bestehende Verbindung");
  next = replaceOne(next,
    `       assertDji(b.platformVerifyLicense(license.appId, license.appKey, license.license), "DJI-Lizenz");
       setPhase("API und Workspace werden eingerichtet …");
       assertDji(b.platformLoadComponent("api", JSON.stringify({ host: window.location.origin, token: sessionToken })), "API-Modul");`,
    `       assertDji(b.platformVerifyLicense(license.appId, license.appKey, license.license), "DJI-Lizenz");
       setPhase("DJI-Verifizierung wird bestätigt …");
       await waitForDjiVerification(b);
       setPhase("API und Workspace werden eingerichtet …");
       if (truthy(b.platformIsComponentLoaded?.("api")) !== true) {
         assertDji(b.platformLoadComponent("api", JSON.stringify({ host: window.location.origin + "/", token: sessionToken })), "API-Modul");
       }`,
    "API-Initialisierung");
  // In case WS is already up, do not reload. Otherwise use the exact working manual connection procedure.
  next = replaceOne(next,
    `       const socket = await api<{ wsUrl: string }>("/api/dji/pilot2/ws-bootstrap", post(sessionToken));
       // Callback does not log or display potentially sensitive DJI values.
       (window as DjiWindow).rehkitzQuickWsCallback = () => {};
       assertDji(b.platformLoadComponent("ws", JSON.stringify({
         host: socket.wsUrl, token: sessionToken, connectCallback: "rehkitzQuickWsCallback",
       })), "WebSocket-Modul");`,
    `       if (truthy(b.wsGetConnectState?.()) !== true) {
         const socket = await api<{ wsUrl: string }>("/api/dji/pilot2/ws-bootstrap", post(sessionToken));
         // No raw callback payload, token or DJI secret is logged.
         (window as DjiWindow).rehkitzQuickWsCallback = () => {};
         assertDji(b.platformLoadComponent("ws", JSON.stringify({
           host: socket.wsUrl, token: sessionToken, connectCallback: "rehkitzQuickWsCallback",
         })), "WebSocket-Modul");
       }`,
    "DJI-WebSocket");
  next = replaceOne(next,
    `       assertDji(b.platformLoadComponent("map", JSON.stringify({})), "Kartenmodul");
       const loaded = b.platformIsComponentLoaded ? truthy(b.platformIsComponentLoaded("map")) : null;
       if (loaded === false) throw new Error("DJI meldet das Kartenmodul noch nicht als aktiv. Bitte erneut verbinden.");`,
    `       if (truthy(b.platformIsComponentLoaded?.("map")) !== true) {
         assertDji(b.platformLoadComponent("map", JSON.stringify({})), "Kartenmodul");
       }
       // Activation can be asynchronous on the DJI Android WebView.
       for (let i = 0; i < 10 && b.platformIsComponentLoaded && truthy(b.platformIsComponentLoaded("map")) !== true; i++) {
         await new Promise<void>((resolve) => setTimeout(resolve, 500));
       }
       const loaded = b.platformIsComponentLoaded ? truthy(b.platformIsComponentLoaded("map")) : null;
       if (loaded === false) throw new Error("DJI-Kartenmodul noch nicht aktiv; Details unter Technik prüfen.");`,
    "DJI-Kartenmodul");
  // Keep the ordinary disconnect control available to pilots while locking ONLY technical tests.
  next = replaceOne(next,
    `<details className="rounded-2xl border bg-white p-4 text-sm">
             <summary className="cursor-pointer font-semibold">Technik und Fehlersuche</summary>`,
    `<details className="rounded-2xl border bg-white p-4 text-sm">
             <summary className="cursor-pointer font-semibold">Technik und Fehlersuche (Admin + Demo-PIN)</summary>`,
    "Technik-Link");
  next = replaceOne(next,
    `<a className="block underline" href="/pilot-login/technik">Technische Testansicht öffnen</a>`,
    `{user?.isAdmin ? <a className="block underline" href="/pilot-login/technik">Technische Testansicht (PIN-geschützt) öffnen</a>
               : <p>Technische Tests sind Administratoren vorbehalten.</p>}`, "Technik-Zugriff");

  // 2. Center exactly the existing DJI legacy WebView header, not all other pages.
  let nextLayout = replaceOne(originalLayout,
    '.dji-view-root main > header { background: #143a59 !important; border-color: #143a59 !important; }',
    '.dji-view-root main > header { text-align: center !important; background: #143a59 !important; border-color: #143a59 !important; }',
    "DJI-Header");

  // 3. Server gate with the SAME signed GPS/demo PIN cookie. Non-admin gets 404; even direct URL is protected.
  if (!originalTech.includes('PilotLoginClient') && !originalTech.includes('DjiTechnicalPinGate')) fail("Technik-Seite hat unerwartete Struktur");
  const nextTech = `import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import PilotLoginClient from "@/components/dji/PilotLoginClient";
import DjiTechnicalPinGate from "@/components/dji/DjiTechnicalPinGate";
import { GPS_TEST_COOKIE_NAME, gpsTestPrincipal, gpsTestIsConfigured, isValidGpsTestToken } from "@/lib/gps-test-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "DJI-Technik – Rehkitzrettung Hegering Hittfeld", robots: { index: false, follow: false },
};
export default async function PilotTechnicalPage() {
  const user = await gpsTestPrincipal(); // admin only, the same principal as GPS-Test
  if (!user) notFound();
  if (!gpsTestIsConfigured()) {
    return <main><p>Technik-PIN ist noch nicht eingerichtet. Bitte die bestehende Demo-/GPS-Test-Konfiguration prüfen.</p></main>;
  }
  const jar = await cookies();
  if (!isValidGpsTestToken(jar.get(GPS_TEST_COOKIE_NAME)?.value, user.id)) {
    return <DjiTechnicalPinGate />;
  }
  return <PilotLoginClient />;
}
`;
  if (originalTech !== nextTech && originalTech.includes('gpsTestPrincipal')) fail("Technikseite wurde bereits individuell geschützt. Bitte manuell vergleichen");

  // All preflights above completed before writing anything.
  const changes = [
    { file: component, before: original, after: next },
    { file: layout, before: originalLayout, after: nextLayout },
    { file: techPage, before: originalTech, after: nextTech },
    { file: gateDest, before: fs.existsSync(gateDest) ? read(gateDest) : null, after: gateText },
  ].filter((item) => item.before !== item.after);
  if (process.argv.includes("--check")) {
    console.log("VORPRÜFUNG OK – Folgende Änderungen wären nötig:");
    for (const item of changes) console.log(" • " + path.relative(root, item.file));
    process.exit(0);
  }
  if (!changes.length) { console.log("Schon vollständig installiert. Keine Änderungen."); process.exit(0); }
  const backupRoot = path.join(path.dirname(root), "rehkitzrettung-dji-backups", "einsatz-pin-" + new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(backupRoot, { recursive: true });
  for (const item of changes) {
    if (item.before !== null) {
      const dest = path.join(backupRoot, path.relative(root, item.file));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(item.file, dest, fs.constants.COPYFILE_EXCL);
    }
  }
  for (const item of changes) {
    fs.mkdirSync(path.dirname(item.file), { recursive: true });
    fs.writeFileSync(item.file, item.after, "utf8");
    console.log("OK: " + path.relative(root, item.file));
  }
  console.log("Sicherung außerhalb des Projekts: " + backupRoot);
  console.log("Keine Datenbank-, MQTT- oder .env-Änderungen.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
