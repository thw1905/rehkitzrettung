"use client";

import { useEffect, useState } from "react";

type DjiBridge = {
  platformLoadComponent?: (name: string, params: string) => string;
  platformIsVerified?: () => string | boolean;
  wsGetConnectState?: () => string | boolean;
  wsDisconnect?: () => string;
};

type BridgeResult = { code?: number; message?: string; data?: unknown };

function parseResponse(raw: unknown): BridgeResult {
  if (typeof raw === "string") {
    try {
      const value: unknown = JSON.parse(raw);
      return value && typeof value === "object" ? value as BridgeResult : {};
    } catch { return {}; }
  }
  return raw && typeof raw === "object" ? raw as BridgeResult : {};
}

function bridgeInstance(): DjiBridge | null {
  return (window as Window & { djiBridge?: DjiBridge }).djiBridge ?? null;
}

function safeMessage(message: unknown): string {
  if (typeof message !== "string") return "";
  return message.replace(/https?:\/\/[^\s]+/gi, "[URL]")
    .replace(/(token|password|secret|license|key)\s*[=:]\s*\S+/gi, "$1=[verdeckt]")
    .replace(/[A-Za-z0-9_\-]{32,}/g, "[Wert verdeckt]").slice(0, 130);
}

function stateText(state: unknown): string {
  if (typeof state === "boolean") return state ? "verbunden" : "nicht verbunden";
  if (typeof state === "string") {
    if (state === "true" || state === "false") return state === "true" ? "verbunden" : "nicht verbunden";
    const response = parseResponse(state);
    const data = response.data;
    if (typeof data === "boolean") return data ? "verbunden" : "nicht verbunden";
    if (typeof data === "string") return safeMessage(data);
    if (typeof data === "number") return `Status ${data}`;
  }
  return "nicht eindeutig feststellbar";
}

type CallbackWindow = Window & { rehkitzWsConnectCallback?: (arg: unknown) => void };

/** Nur WebSocket-Handschlag: keine DJI-MQTT-Verbindung, kein Kartenmodul, kein PinPoint-Import. */
export default function Pilot2WsTest({ token }: { token: string | null }) {
  const [working, setWorking] = useState(false);
  const [state, setState] = useState("Nicht gestartet");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    const bridge = bridgeInstance();
    if (!bridge?.wsGetConnectState) return;
    try { setState("Status nach Rueckkehr: " + stateText(bridge.wsGetConnectState())); }
    catch { setState("Verbindungsstatus nach Rueckkehr unbekannt"); }
  }, [token]);

  async function start() {
    if (!token || working) return;
    setWorking(true);
    setError("");
    setState("DJI-WebSocket wird vorbereitet …");
    try {
      const bridge = bridgeInstance();
      if (!bridge?.platformLoadComponent) throw new Error("DJI-JSBridge fehlt. Bitte auf der Fernsteuerung testen.");
      const response = await fetch("/api/dji/pilot2/ws-bootstrap", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json() as { error?: string; wsUrl?: string };
      if (!response.ok || !data.wsUrl) throw new Error(data.error || `Serverfehler ${response.status}`);
      (window as CallbackWindow).rehkitzWsConnectCallback = (raw: unknown) => {
        // DJI-Callbacks koennen implementationsabhaengige Antworten enthalten.
        // Daher nur Status anzeigen, keine Rohdaten/Token protokollieren.
        setState("DJI-WebSocket-Callback erhalten: " + stateText(raw));
      };
      const result = parseResponse(bridge.platformLoadComponent("ws", JSON.stringify({
        host: data.wsUrl,
        token,
        connectCallback: "rehkitzWsConnectCallback",
      })));
      if (result.code !== 0) {
        throw new Error(`DJI-WebSocket-Modul: Fehler ${result.code ?? "unbekannt"}${result.message ? " – " + safeMessage(result.message) : ""}`);
      }
      setState("WebSocket-Modul geladen. Verbindung wird aufgebaut; Status bitte aktualisieren.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "DJI-WebSocket-Test fehlgeschlagen.");
      setState("Verbindung nicht bestätigt");
    } finally {
      setWorking(false);
    }
  }

  function refresh() {
    try {
      const bridge = bridgeInstance();
      if (!bridge?.wsGetConnectState) throw new Error("DJI meldet noch keinen WebSocket-Status.");
      setState("DJI-WebSocket: " + stateText(bridge.wsGetConnectState()));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Statusprüfung fehlgeschlagen."); }
  }

  function disconnect() {
    try {
      bridgeInstance()?.wsDisconnect?.();
      setState("WebSocket getrennt.");
      setError("");
    } catch { setError("DJI-WebSocket konnte nicht getrennt werden."); }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">DJI Pilot 2 – WebSocket-Test (Stufe 3A)</h2>
      <p className="text-sm text-slate-700">Erst nach erfolgreicher Lizenz-, API- und Workspace-Prüfung starten. Dieser Test importiert keine PinPoints.</p>
      <button type="button" disabled={!token || working} onClick={() => void start()}
        className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">
        {working ? "Verbinde …" : "DJI-WebSocket verbinden"}
      </button>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={refresh} className="rounded-xl border px-3 py-2 text-sm">Status aktualisieren</button>
        <button type="button" onClick={disconnect} className="rounded-xl border px-3 py-2 text-sm">WebSocket trennen</button>
      </div>
      <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{state}</p>
      {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
      <p className="text-xs text-slate-600">MQTT, Kartensynchronisierung und automatischer PinPoint-Import bleiben deaktiviert.</p>
    </section>
  );
}
