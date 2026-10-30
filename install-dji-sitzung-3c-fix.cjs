"use strict";
/**
 * DJI Pilot 2 session restore 3C - safer installer for differently formatted clients.
 * Stage all changes in memory; do not touch project when any expected feature is missing.
 */
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const files = [
  'app/api/dji/pilot-sessions/route.ts',
  'components/dji/PilotLoginClient.tsx',
  'components/dji/Pilot2WsTest.tsx',
  'components/dji/Pilot2MapTest.tsx',
];

function fail(message) { throw new Error(message); }
function once(text, from, to, description) {
  const count = text.split(from).length - 1;
  if (count !== 1) fail(`${description}: erwartete Stelle ${count === 0 ? 'nicht gefunden' : 'mehrdeutig'}`);
  return text.replace(from, to);
}
function onceRegex(text, expression, replacement, description) {
  const regexp = new RegExp(expression.source, expression.flags.includes('g') ? expression.flags : expression.flags + 'g');
  const count = Array.from(text.matchAll(regexp)).length;
  if (count !== 1) fail(`${description}: erwartete Stelle ${count === 0 ? 'nicht gefunden' : 'mehrdeutig'}`);
  return text.replace(expression, replacement);
}

function modifyAPI(src) {
  if (src.includes('rk_dji_pilot_session')) return src;
  src = once(src,
    'import { createDjiSession, hashDjiToken } from "@/lib/dji/token";',
    'import { createDjiSession, hashDjiToken, checkDjiSession } from "@/lib/dji/token";',
    'API-Import');
  src = once(src, 'const noStore = { "Cache-Control": "private, no-store" };',
    `const noStore = { "Cache-Control": "private, no-store" };
const DJI_COOKIE = "rk_dji_pilot_session";
const cookieConfig = {
  httpOnly: true, secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const, path: "/api/dji", maxAge: 8 * 60 * 60,
};`, 'Cookie-Konfiguration');
  src = once(src, 'export async function GET() {', 'export async function GET(req: NextRequest) {', 'GET-Parameter');
  src = onceRegex(src,
    /([ \t]*)return NextResponse\.json\(\{\s*orders,\s*date: today\.dateKey,\s*adminView: user\.isAdmin,?\s*\},\s*\{ headers: noStore \}\);/m,
    (_match, indent) => `${indent}// Recover only a nonrevoked, unexpired session of this authenticated pilot.\n${indent}const cookieToken = req.cookies.get(DJI_COOKIE)?.value || "";\n${indent}const djiSession = cookieToken\n${indent}  ? await checkDjiSession(cookieToken, process.env.DJI_WORKSPACE_ID || "")\n${indent}  : null;\n${indent}const orderStillToday = djiSession && orders.some((item) => item.id === djiSession.orderId);\n${indent}const activeSession = djiSession && djiSession.pilotUserId === user.id && orderStillToday\n${indent}  ? { token: cookieToken, orderId: djiSession.orderId, expiresAt: djiSession.expiresAt.toISOString() }\n${indent}  : null;\n${indent}return NextResponse.json({ orders, date: today.dateKey, adminView: user.isAdmin, activeSession }, { headers: noStore });`,
    'API-Sitzungsantwort');
  src = onceRegex(src, /([ \t]*)return NextResponse\.json\(\{ token, expiresInSeconds: 28800 \}, \{ headers: noStore \}\);/m,
    (_match, indent) => `${indent}const response = NextResponse.json({ token, expiresInSeconds: 28800 }, { headers: noStore });\n${indent}response.cookies.set(DJI_COOKIE, token, cookieConfig);\n${indent}return response;`, 'Cookie nach Sitzungsbeginn');
  src = onceRegex(src, /([ \t]*)return NextResponse\.json\(\{ success: true \}, \{ headers: noStore \}\);/m,
    (_match, indent) => `${indent}const response = NextResponse.json({ success: true }, { headers: noStore });\n${indent}response.cookies.set(DJI_COOKIE, "", { ...cookieConfig, maxAge: 0 });\n${indent}return response;`, 'Cookie beim Widerruf loeschen');
  return src;
}

function modifyClient(src) {
  if (!src.includes('Aktive DJI-Testsitzung und Auftrag wiederhergestellt')) {
    // Unlike 3C v1, do not depend on setOrders and setSetup being adjacent.
    // Search the single setSetup call inside the authenticated data-load callback.
    src = onceRegex(src,
      /^([ \t]*)setSetup\s*\(\s*statusJson\s*\)\s*;/m,
      (matched, indent) => `${matched}\n${indent}// Restore the same pilot's active, server-validated assignment after a webview reload.\n${indent}const restored = orderJson.activeSession;\n${indent}if (restored && typeof restored.token === "string" && typeof restored.orderId === "string") {\n${indent}  setOrderId(restored.orderId);\n${indent}  setPilotToken(restored.token);\n${indent}  setMessage("Aktive DJI-Testsitzung und Auftrag wiederhergestellt. Verbindungsstatus unten pruefen.");\n${indent}}`,
      'Sitzung im Client wiederherstellen');
  }
  if (!src.includes('async function logout()')) {
    src = onceRegex(src, /^([ \t]*)async function testLicense\s*\(\s*\)\s*\{/m,
      (_matched, indent) => `${indent}async function logout() {\n${indent}  if (pilotToken) {\n${indent}    setBusy(true);\n${indent}    try {\n${indent}      const response = await fetch("/api/dji/pilot-sessions", {\n${indent}        method: "DELETE", headers: { "Content-Type": "application/json" },\n${indent}        body: JSON.stringify({ token: pilotToken }),\n${indent}      });\n${indent}      if (!response.ok) throw new Error("Die DJI-Sitzung konnte nicht beendet werden.");\n${indent}      setPilotToken(null);\n${indent}    } catch (error) {\n${indent}      setMessage(error instanceof Error ? error.message : "Abmeldung fehlgeschlagen.");\n${indent}      setBusy(false);\n${indent}      return;\n${indent}    }\n${indent}    setBusy(false);\n${indent}  }\n${indent}  await signOut({ callbackUrl: "/pilot-login" });\n${indent}}\n\n${indent}async function testLicense() {`,
      'Abmeldefunktion');
  }
  if (!src.includes('onClick={() => void logout()}')) {
    src = onceRegex(src,
      /onClick=\{\(\)\s*=>\s*signOut\(\{\s*callbackUrl:\s*["']\/pilot-login["']\s*\}\)\}/m,
      'onClick={() => void logout()}', 'Abmelde-Button');
  }
  return src;
}

function withUseEffect(src, description) {
  if (/import\s*\{[^}]*\buseEffect\b[^}]*\}\s*from\s*["']react["'];?/.test(src)) return src;
  return onceRegex(src, /import\s*\{\s*useState\s*\}\s*from\s*["']react["'];?/m,
    'import { useEffect, useState } from "react";', description);
}
function modifyWs(src) {
  if (src.includes('Status nach Rueckkehr:')) return src;
  src = withUseEffect(src, 'WebSocket useEffect import');
  return onceRegex(src,
    /^([ \t]*)async function start\s*\(\s*\)\s*\{/m,
    (_matched, indent) => `${indent}useEffect(() => {\n${indent}  if (!token) return;\n${indent}  const bridge = bridgeInstance();\n${indent}  if (!bridge?.wsGetConnectState) return;\n${indent}  try { setState("Status nach Rueckkehr: " + stateText(bridge.wsGetConnectState())); }\n${indent}  catch { setState("Verbindungsstatus nach Rueckkehr unbekannt"); }\n${indent}}, [token]);\n\n${indent}async function start() {`,
    'WebSocket Status nach Rueckkehr');
}
function modifyMap(src) {
  if (src.includes('DJI-Kartenmodul laut Pilot 2 bereits aktiv')) return src;
  src = withUseEffect(src, 'Map useEffect import');
  return onceRegex(src,
    /^([ \t]*)async function activate\s*\(\s*\)\s*\{/m,
    (_matched, indent) => `${indent}useEffect(() => {\n${indent}  if (!token) return;\n${indent}  const bridge = (window as Window & { djiBridge?: DjiMapBridge }).djiBridge;\n${indent}  if (!bridge?.platformIsComponentLoaded) return;\n${indent}  try {\n${indent}    const loaded = isYes(bridge.platformIsComponentLoaded("map"));\n${indent}    setStatus(loaded === true\n${indent}      ? "DJI-Kartenmodul laut Pilot 2 bereits aktiv. Empfang unten kontrollieren."\n${indent}      : loaded === false\n${indent}        ? "DJI-Kartenmodul nach Rueckkehr nicht geladen. Erneut aktivieren, falls erforderlich."\n${indent}        : "DJI-Kartenmodulstatus nicht eindeutig. Empfang unten kontrollieren.");\n${indent}  } catch { setStatus("Kartenmodulstatus nach Rueckkehr nicht verfuegbar."); }\n${indent}}, [token]);\n\n${indent}async function activate() {`,
    'Map Status nach Rueckkehr');
}

const transforms = [modifyAPI, modifyClient, modifyWs, modifyMap];
const planned = [];
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.name !== 'rehkitzrettung') fail('Bitte im Projektordner C:\\Projekte\\rehkitzrettung ausfuehren.');
  for (let i = 0; i < files.length; i++) {
    const target = path.join(root, files[i]);
    const original = fs.readFileSync(target, 'utf8');
    const changed = transforms[i](original);
    if (changed !== original) planned.push({ target, original, changed, relative: files[i] });
  }
} catch (error) {
  console.error('ABBRUCH:', error.message);
  console.error('Keine Programmdateien geaendert. Bitte Fehlermeldung und zugehoerige Quelldatei weitergeben.');
  process.exit(1);
}
if (process.argv.includes('--check')) {
  console.log('Vorpruefung erfolgreich. Zu aendernde Dateien:', planned.map(p => p.relative));
  process.exit(0);
}
if (!planned.length) { console.log('DJI-Sitzungswiederherstellung ist bereits installiert.'); process.exit(0); }
const backupDir = path.join(path.dirname(root), 'rehkitzrettung-backups',
  'dji-sitzung-3c-fix-' + new Date().toISOString().replace(/[:.]/g, '-'));
try {
  for (const item of planned) {
    const backup = path.join(backupDir, item.relative);
    fs.mkdirSync(path.dirname(backup), {recursive: true});
    fs.writeFileSync(backup, item.original, 'utf8');
  }
  for (const item of planned) {
    const tmp = item.target + '.stage3c-fix-temp';
    fs.writeFileSync(tmp, item.changed, 'utf8');
    fs.renameSync(tmp, item.target);
    console.log('Angepasst:', item.relative);
  }
  console.log('Sicherung:', backupDir);
  console.log('Fertig. Keine Datenbank, keine Umgebungsvariablen, kein Git-Commit geaendert.');
} catch (error) { console.error('Schreibfehler:', error.message); process.exit(1); }
