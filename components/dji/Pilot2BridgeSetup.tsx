"use client";

import { useEffect, useState } from "react";

type Bridge = {
  platformVerifyLicense?: (id: string, key: string, license: string) => string;
  platformIsVerified?: () => boolean | string;
  platformGetVersion?: () => string;
  platformIsComponentLoaded?: (name: string) => string | boolean;
  platformLoadComponent?: (name: string, params: string) => string;
  platformSetWorkspaceId?: (id: string) => string;
  platformSetInformation?: (platform: string, name: string, description: string) => string;
};

type License = { appId: string; appKey: string; license: string };
type Setup = {
  workspaceId: string;
  platformName: string;
  workspaceName: string;
  description: string;
};

type BridgeReply = { code?: number; message?: string; data?: unknown };

declare global {
  interface Window { djiBridge?: Bridge }
}

function parseReply(raw: unknown): BridgeReply {
  if (typeof raw === "string") {
    try {
      const value: unknown = JSON.parse(raw);
      return value && typeof value === "object" ? value as BridgeReply : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? raw as BridgeReply : {};
}

function safeDjiMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, 300)
    .replace(/https?:\/\/\S+/gi, "[URL verdeckt]")
    .replace(/(token|authorization|password|secret|license|appkey|apikey)\s*[:=]\s*[^\s,;]+/gi, "$1=[verdeckt]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[Wert verdeckt]")
    .slice(0, 180);
}

function bridgeDiagnostics(bridge?: Bridge): string {
  if (!bridge) return "";
  const info: string[] = [];
  try {
    const raw = bridge.platformGetVersion?.();
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const v = obj.data && typeof obj.data === "object" ? obj.data as Record<string, unknown> : obj;
        for (const k of ["appVersion", "modelVersion"]) {
          if (typeof v[k] === "string" && /^[a-zA-Z0-9._-]{1,32}$/.test(v[k] as string)) {
            info.push(k + ": " + v[k]);
          }
        }
      }
    }
  } catch { /* optional */ }
  try {
    const raw = bridge.platformIsComponentLoaded?.("api");
    if (typeof raw === "boolean") info.push("API-Modul geladen: " + (raw ? "ja" : "nein"));
    if (typeof raw === "string") {
      const obj: unknown = JSON.parse(raw);
      if (obj && typeof obj === "object" && typeof (obj as {data?:unknown}).data === "boolean") {
        info.push("API-Modul geladen: " + ((obj as {data:boolean}).data ? "ja" : "nein"));
      }
    }
  } catch { /* optional */ }
  return info.length ? " | DJI-Diagnose: " + info.join(", ") : "";
}

function readDjiVerified(raw: unknown): { verified: boolean; explanation: string } {
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

function assertSuccess(raw: unknown, step: string) {
  const result = parseReply(raw);
  if (result.code !== 0) {
    const msg = safeDjiMessage(result.message);
    throw new Error(`${step}: DJI-Fehlercode ${result.code ?? "unbekannt"}${msg ? " – " + msg : ""}.`);
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin" });
  if (!response.ok) {
    let message = "";
    try { const data = await response.json(); message = String(data?.error || ""); } catch { /* no secret dumps */ }
    throw new Error(message || `Serveranfrage fehlgeschlagen (${response.status}).`);
  }
  return await response.json() as T;
}

/**
 * Stufe 2B: Safe DJI Pilot 2 JSBridge bootstrap.
 * This intentionally does NOT connect MQTT, WS or load map elements.
 * It does NOT import or create any PinPoints.
 */
export default function Pilot2BridgeSetup({ token }: { token: string | null }) {
  const [detected, setDetected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Noch nicht geprüft");
  const [error, setError] = useState("");

  useEffect(() => {
    const check = () => setDetected(Boolean(window.djiBridge?.platformVerifyLicense && window.djiBridge?.platformLoadComponent));
    check();
    // No background polling / no automatic connection. Manual action only.
  }, []);

  async function initialize() {
    if (!token || busy) return;
    setBusy(true);
    setError("");
    setStatus("DJI-Lizenz wird geprüft …");
    try {
      if (window.location.protocol !== "https:") {
        throw new Error("DJI Pilot 2 muss die öffentlich erreichbare HTTPS-Testadresse öffnen; localhost reicht nicht.");
      }
      const bridge = window.djiBridge;
      if (!bridge?.platformVerifyLicense || !bridge.platformLoadComponent ||
          !bridge.platformSetWorkspaceId || !bridge.platformSetInformation) {
        throw new Error("Die DJI-JSBridge ist nicht verfügbar. Bitte in DJI Pilot 2 unter Cloud-Dienst → Offene Plattformen öffnen.");
      }
      // Validate active pilot, order and unexpired session server-side before reading any configuration.
      const setup = await fetchJson<Setup>("/api/dji/pilot2/bridge-bootstrap", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      });
      const license = await fetchJson<License>("/api/dji/pilot2/bridge-license");
      assertSuccess(bridge.platformVerifyLicense(license.appId, license.appKey, license.license), "Lizenzprüfung");
      setStatus("Lizenzaufruf erfolgreich. DJI-Verifizierungsstatus wird geprüft …");
      await waitUntilDjiVerified(bridge);
      setStatus("DJI-App-Verifizierung bestätigt. API-Modul wird geladen …");
      // DJI requires the API module before any map endpoints can be used.
      setStatus("Lizenz akzeptiert. API-Modul wird geladen …");
      assertSuccess(bridge.platformLoadComponent("api", JSON.stringify({
        host: window.location.origin + "/",
        token,
      })), "API-Modul");
      setStatus("API-Modul geladen. Workspace wird eingestellt …");
      assertSuccess(bridge.platformSetWorkspaceId(setup.workspaceId), "Workspace-ID");
      assertSuccess(bridge.platformSetInformation(
        setup.platformName, setup.workspaceName, setup.description,
      ), "Workspace-Informationen");
      setStatus("DJI-Lizenz, API-Modul und Workspace: erfolgreich vorbereitet. MQTT/WebSocket noch NICHT verbunden.");
    } catch (reason) {
      setStatus("Verbindungsvorbereitung fehlgeschlagen");
      setError((reason instanceof Error ? reason.message : "Unbekannter DJI-Fehler.") + bridgeDiagnostics(window.djiBridge));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">DJI Pilot 2 – Verbindung vorbereiten (Stufe 2B)</h2>
      <p className="text-sm text-slate-700">
        Prüfungen: DJI-Lizenz → API-Modul → Workspace. Dies ist noch keine Verbindung zum MQTT-Server;
        es werden keine Fundpunkte übertragen.
      </p>
      <p className="text-sm">DJI-JSBridge: <strong>{detected ? "erkannt" : "nicht vorhanden (auf Windows normal)"}</strong></p>
      <button
        type="button" disabled={!token || !detected || busy} onClick={() => void initialize()}
        className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "DJI wird vorbereitet …" : "Lizenz, API und Workspace prüfen"}
      </button>
      <p className="rounded-lg bg-slate-100 p-3 text-sm" role="status">{status}</p>
      {error && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">{error}</p>}
      <p className="text-xs text-slate-600">
        Der Test ist ausschließlich innerhalb von DJI Pilot 2 über HTTPS sinnvoll.
        App-Schlüssel, Sitzungs-Token und sonstige Zugangsdaten nicht im Chat teilen.
      </p>
    </section>
  );
}
