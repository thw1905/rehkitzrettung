"use client";

import { useState } from "react";

type BridgeReply = { code?: number; message?: string; data?: unknown };
type DjiMapBridge = {
  platformLoadComponent?: (name: string, param: string) => string;
  platformIsComponentLoaded?: (name: string) => string | boolean;
  wsGetConnectState?: () => string | boolean;
};
type MapBootstrap = { workspaceId: string; groupId: string; autoImportEnabled: boolean; error?: string };
type Point = { id: string; name: string; latitude: number; longitude: number; receivedAt: string };
type PointsResponse = { count: number; points: Point[]; error?: string };

function bridgeReply(value: unknown): BridgeReply {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === "object" ? parsed as BridgeReply : {};
    } catch { return {}; }
  }
  return value !== null && typeof value === "object" ? value as BridgeReply : {};
}

function isYes(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  const reply = bridgeReply(value);
  if (typeof reply.data === "boolean") return reply.data;
  if (reply.data === "true") return true;
  if (reply.data === "false") return false;
  return null;
}

function safeDjiError(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/(?:https?|wss?):\/\/\S+/gi, "[Adresse verdeckt]")
    .replace(/(?:token|password|license|key|secret)\s*[=:]\s*\S+/gi, "[Zugangsdaten verdeckt]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[Wert verdeckt]").slice(0, 150);
}

async function postJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Serverfehler ${response.status}`);
  return result;
}

/**
 * DJI Map-Stufe 3B: manuelle Modulaktivierung und lesende Kontrolle empfangener Elemente.
 * Der bestehende POST-Map-Endpunkt speichert ausschließlich DjiMapElement,
 * solange DJI_IMPORT_ENABLED nicht auf true gesetzt wurde.
 */
export default function Pilot2MapTest({ token }: { token: string | null }) {
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("Noch nicht aktiviert");
  const [error, setError] = useState("");
  const [points, setPoints] = useState<Point[]>([]);
  const [listStatus, setListStatus] = useState("");

  async function activate() {
    if (!token || working) return;
    setWorking(true);
    setError("");
    setStatus("Prüfe DJI-Kartenkonfiguration …");
    try {
      const bridge = (window as Window & { djiBridge?: DjiMapBridge }).djiBridge;
      if (!bridge?.platformLoadComponent) {
        throw new Error("Die DJI-JSBridge fehlt. Bitte diesen Test in DJI Pilot 2 öffnen.");
      }
      const config = await postJson<MapBootstrap>("/api/dji/pilot2/map-bootstrap", token);
      if (config.autoImportEnabled) throw new Error("Autoimport ist aktiviert: Test aus Sicherheitsgründen gesperrt.");
      const ws = bridge.wsGetConnectState?.();
      if (ws !== undefined && isYes(ws) === false) {
        throw new Error("DJI-WebSocket noch nicht verbunden. Bitte zuerst Stufe 3A verbinden.");
      }
      // Testet über denselben HTTPS-Endpunkt und x-auth-token, den DJI selbst verwenden soll.
      // Keine Token-Ausgabe in URL oder Protokollen.
      const url = `/map/api/v1/workspaces/${encodeURIComponent(config.workspaceId)}/element-groups`;
      const apiResponse = await fetch(url, {
        method: "GET", headers: { "x-auth-token": token }, cache: "no-store", credentials: "same-origin",
      });
      if (!apiResponse.ok) throw new Error(`DJI-Karten-API antwortet mit HTTP ${apiResponse.status}.`);
      const body = await apiResponse.json() as { code?: number; data?: Array<{ id?: string; type?: number }> };
      if (body.code !== 0 || !Array.isArray(body.data) ||
          !body.data.some((group) => group.id === config.groupId && group.type === 2)) {
        throw new Error("App-Shared-Kartenebene fehlt in der Antwort der DJI-Karten-API.");
      }
      setStatus("Karten-API erreichbar. Lade Kartenmodul in DJI Pilot 2 …");
      const result = bridgeReply(bridge.platformLoadComponent("map", JSON.stringify({})));
      if (result.code !== 0) {
        throw new Error(`DJI-Kartenmodul: Fehler ${result.code ?? "unbekannt"}${result.message ? " – " + safeDjiError(result.message) : ""}`);
      }
      const loaded = bridge.platformIsComponentLoaded?.("map");
      const confirmed = loaded === undefined ? null : isYes(loaded);
      if (confirmed === false) throw new Error("DJI hat den Kartenmodulaufruf akzeptiert, meldet das Modul aber noch nicht als geladen.");
      setStatus(confirmed === true
        ? "DJI-Kartenmodul geladen. Jetzt einen neuen Test-Kartenpunkt in Pilot 2 setzen."
        : "DJI hat das Laden angenommen (Code 0). Bitte Kartenpunkt setzen und Empfang prüfen.");
    } catch (cause) {
      setStatus("Kartenmodul-Verbindung noch nicht bestätigt");
      setError(cause instanceof Error ? cause.message : "DJI-Kartenmodul konnte nicht geladen werden.");
    } finally {
      setWorking(false);
    }
  }

  async function refreshPoints() {
    if (!token || working) return;
    setWorking(true);
    setError("");
    try {
      const result = await postJson<PointsResponse>("/api/dji/pilot2/map-observations", token);
      setPoints(result.points || []);
      setListStatus(result.count
        ? `${result.count} DJI-Kartenpunkt(e) in dieser Pilotensitzung empfangen. Noch kein regulärer Auftrags-PinPoint.`
        : "Noch kein DJI-Kartenpunkt für diese Testsitzung empfangen.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Empfangskontrolle fehlgeschlagen.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">DJI Pilot 2 – Kartenpunkte testen (Stufe 3B)</h2>
      <p className="text-sm text-slate-700">Zuerst Lizenz, API, Workspace und WebSocket wie bisher verbinden. Danach hier das Kartenmodul starten. Der automatische Auftragsimport bleibt aus.</p>
      <button type="button" disabled={!token || working} onClick={() => void activate()}
        className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">
        {working ? "Bitte einen Moment …" : "DJI-Kartenmodul aktivieren"}
      </button>
      <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{status}</p>
      <button type="button" disabled={!token || working} onClick={() => void refreshPoints()}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold disabled:opacity-50">
        Empfangene Testpunkte prüfen
      </button>
      {listStatus && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{listStatus}</p>}
      {points.length > 0 && <ul className="space-y-1 rounded-lg border p-3 text-sm">
        {points.map((point) => <li key={point.id}>{point.name}: {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</li>)}
      </ul>}
      {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
      <p className="text-xs text-slate-600">Nur neu gesetzte DJI-Kartenmarkierungen testen. Wärmebild-Fundpunkte/POIs können sich von normalen Kartenmarkierungen unterscheiden; dies prüfen wir separat. Keine automatische Übernahme in Aufträge.</p>
    </section>
  );
}
