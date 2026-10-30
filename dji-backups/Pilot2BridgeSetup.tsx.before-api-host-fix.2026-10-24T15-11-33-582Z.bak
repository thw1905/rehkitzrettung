"use client";

import { useEffect, useState } from "react";

type Bridge = {
  platformVerifyLicense?: (id: string, key: string, license: string) => string;
  platformIsVerified?: () => boolean | string;
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

function assertSuccess(raw: unknown, step: string) {
  const result = parseReply(raw);
  if (result.code !== 0) {
    throw new Error(`${step}: DJI antwortet mit Fehlercode ${result.code ?? "unbekannt"}.`);
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
      // DJI requires the API module before any map endpoints can be used.
      setStatus("Lizenz akzeptiert. API-Modul wird geladen …");
      assertSuccess(bridge.platformLoadComponent("api", JSON.stringify({
        host: window.location.origin,
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
      setError(reason instanceof Error ? reason.message : "Unbekannter DJI-Fehler.");
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
