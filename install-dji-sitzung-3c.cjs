/**
 * DJI Stage 3C - restores the active pilot session after DJI Pilot 2 closes
 * and reopens the embedded webview. Nothing is uploaded to Git automatically.
 * Fails closed if the current code no longer matches the expected version.
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

function replaceOnce(content, from, to, description) {
  const count = content.split(from).length - 1;
  if (count !== 1) throw new Error(`${description}: erwartete Stelle ${count === 0 ? 'nicht gefunden' : 'mehrdeutig'}. Keine Aenderungen vorgenommen.`);
  return content.replace(from, to);
}

function modifyAPI(src) {
  src = replaceOnce(src,
    'import { createDjiSession, hashDjiToken } from "@/lib/dji/token";',
    'import { createDjiSession, hashDjiToken, checkDjiSession } from "@/lib/dji/token";', 'API-Import');
  src = replaceOnce(src,
    'const noStore = { "Cache-Control": "private, no-store" };',
    `const noStore = { "Cache-Control": "private, no-store" };
const DJI_COOKIE = "rk_dji_pilot_session";
const cookieConfig = {
  httpOnly: true, secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const, path: "/api/dji", maxAge: 8 * 60 * 60,
};`, 'Cookie-Optionen');
  src = replaceOnce(src, 'export async function GET() {', 'export async function GET(req: NextRequest) {', 'GET-Argument');
  src = replaceOnce(src,
    `  return NextResponse.json({
    orders, date: today.dateKey, adminView: user.isAdmin,
  }, { headers: noStore });`,
    `  // The cookie is HttpOnly. A re-opened Webview fetches the active token only
  // after authenticating as the same pilot. No raw token is stored in localStorage.
  const cookieToken = req.cookies.get(DJI_COOKIE)?.value || "";
  const djiSession = cookieToken
    ? await checkDjiSession(cookieToken, process.env.DJI_WORKSPACE_ID || "")
    : null;
  const orderStillToday = djiSession && orders.some((item) => item.id === djiSession.orderId);
  const activeSession = djiSession && djiSession.pilotUserId === user.id && orderStillToday
    ? { token: cookieToken, orderId: djiSession.orderId,
        expiresAt: djiSession.expiresAt.toISOString() }
    : null;
  return NextResponse.json({
    orders, date: today.dateKey, adminView: user.isAdmin, activeSession,
  }, { headers: noStore });`, 'Aktive Sitzung wiederherstellen');
  src = replaceOnce(src,
    `  return NextResponse.json({ token, expiresInSeconds: 28800 }, { headers: noStore });`,
    `  const response = NextResponse.json({ token, expiresInSeconds: 28800 }, { headers: noStore });
  response.cookies.set(DJI_COOKIE, token, cookieConfig);
  return response;`, 'Cookie beim POST setzen');
  src = replaceOnce(src,
    `  return NextResponse.json({ success: true }, { headers: noStore });`,
    `  const response = NextResponse.json({ success: true }, { headers: noStore });
  response.cookies.set(DJI_COOKIE, "", { ...cookieConfig, maxAge: 0 });
  return response;`, 'Cookie beim DELETE loeschen');
  return src;
}

function modifyClient(src) {
  src = replaceOnce(src,
    `        setOrders(Array.isArray(orderJson.orders) ? orderJson.orders : []);
        setSetup(statusJson);`,
    `        setOrders(Array.isArray(orderJson.orders) ? orderJson.orders : []);
        setSetup(statusJson);
        // DJI Pilot 2 can unload its embedded webview when flight view opens.
        // Recover the server-validated assignment and session on return.
        const restored = orderJson.activeSession;
        if (restored && typeof restored.token === "string" &&
            typeof restored.orderId === "string") {
          setOrderId(restored.orderId);
          setPilotToken(restored.token);
          setMessage("Aktive DJI-Testsitzung und Auftrag wiederhergestellt. Verbindungsstatus unten pruefen.");
        }`, 'Sitzung im Client wiederherstellen');
  src = replaceOnce(src,
    `  async function testLicense() {`,
    `  async function logout() {
    if (pilotToken) {
      setBusy(true);
      try {
        const response = await fetch("/api/dji/pilot-sessions", {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: pilotToken }),
        });
        if (!response.ok) throw new Error("Die DJI-Sitzung konnte nicht beendet werden.");
        setPilotToken(null);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Abmeldung fehlgeschlagen.");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    await signOut({ callbackUrl: "/pilot-login" });
  }

  async function testLicense() {`, 'Abmeldung mit Widerruf');
  src = replaceOnce(src,
    `onClick={() => signOut({ callbackUrl: "/pilot-login" })}`,
    `onClick={() => void logout()}`, 'Abmelde-Button');
  return src;
}

function modifyWs(src) {
  src = replaceOnce(src,
    `import { useState } from "react";`,
    `import { useEffect, useState } from "react";`, 'WebSocket Hook Import');
  src = replaceOnce(src,
    `  const [error, setError] = useState("");

  async function start() {`,
    `  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    const bridge = bridgeInstance();
    if (!bridge?.wsGetConnectState) return;
    try { setState("Status nach Rueckkehr: " + stateText(bridge.wsGetConnectState())); }
    catch { setState("Verbindungsstatus nach Rueckkehr unbekannt"); }
  }, [token]);

  async function start() {`, 'WebSocket Status nach Rueckkehr');
  return src;
}
function modifyMap(src) {
  src = replaceOnce(src,
    `import { useState } from "react";`,
    `import { useEffect, useState } from "react";`, 'Map Hook Import');
  src = replaceOnce(src,
    `  const [listStatus, setListStatus] = useState("");

  async function activate() {`,
    `  const [listStatus, setListStatus] = useState("");

  useEffect(() => {
    if (!token) return;
    const bridge = (window as Window & { djiBridge?: DjiMapBridge }).djiBridge;
    if (!bridge?.platformIsComponentLoaded) return;
    try {
      const loaded = isYes(bridge.platformIsComponentLoaded("map"));
      setStatus(loaded === true
        ? "DJI-Kartenmodul laut Pilot 2 bereits aktiv. Empfang unten kontrollieren."
        : loaded === false
          ? "DJI-Kartenmodul nach Rueckkehr nicht geladen. Erneut aktivieren, falls erforderlich."
          : "DJI-Kartenmodulstatus nicht eindeutig. Empfang unten kontrollieren.");
    } catch { setStatus("Kartenmodulstatus nach Rueckkehr nicht verfuegbar."); }
  }, [token]);

  async function activate() {`, 'Map Status nach Rueckkehr');
  return src;
}

const converters = [modifyAPI, modifyClient, modifyWs, modifyMap];
const planned = [];
try {
  for (let i = 0; i < files.length; i++) {
    const target = path.join(root, files[i]);
    const original = fs.readFileSync(target, 'utf8');
    if (original.includes('rk_dji_pilot_session') && i === 0) {
      console.log('Die Wiederherstellung scheint bereits installiert zu sein.');
      process.exit(0);
    }
    planned.push({ target, original, changed: converters[i](original) });
  }
} catch (error) { console.error(error.message); process.exit(1); }
// No files have been changed before all four patches pass their exact checks.
const backupDir = path.join(root, 'rehkitzrettung-backups', 'dji-sitzung-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupDir, { recursive: true });
for (let i = 0; i < planned.length; i++) {
  const p = planned[i];
  const back = path.join(backupDir, files[i]);
  fs.mkdirSync(path.dirname(back), { recursive: true });
  fs.writeFileSync(back, p.original, 'utf8');
  const tmp = p.target + '.stage3c-temp';
  fs.writeFileSync(tmp, p.changed, 'utf8');
  fs.renameSync(tmp, p.target);
  console.log('Angepasst:', files[i]);
}
console.log('Sicherheitskopie:', backupDir);
console.log('Fertig. Noch kein Datenbankeingriff oder Git-Commit.');
