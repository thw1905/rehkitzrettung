"use client";

// DJI_PILOT_LOG_DIAG_V1: read-only JSBridge log-path query and opt-in log upload.
// No automatic access to local files; no changes to DJI authentication or MQTT.
import { useState, type ChangeEvent } from "react";

type GetLogPathBridge = { platformGetLogPath?: () => unknown };

function asDisplayText(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { return asDisplayText(JSON.parse(trimmed)); } catch { /* raw path */ }
    }
    return trimmed.slice(0, 1800);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["path", "logPath", "log_path", "data", "result"]) {
      if (obj[key] != null) return asDisplayText(obj[key]);
    }
    return JSON.stringify(obj).slice(0, 1800);
  }
  return value == null ? "" : String(value);
}

export default function DjiPilotLogDiagnose() {
  const [pathResult, setPathResult] = useState("");
  const [bridgeStatus, setBridgeStatus] = useState("");
  const [chosen, setChosen] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function readLogPath() {
    setLoading(true);
    setPathResult("");
    setBridgeStatus("");
    try {
      const bridge = (window as unknown as { djiBridge?: GetLogPathBridge }).djiBridge;
      if (!bridge) {
        setBridgeStatus("DJI-JSBridge nicht gefunden. Bitte diese Seite innerhalb von DJI Pilot 2 unter Cloud-Dienst öffnen.");
        return;
      }
      if (typeof bridge.platformGetLogPath !== "function") {
        setBridgeStatus("DJI-JSBridge vorhanden, aber platformGetLogPath wird von dieser Pilot-2-Version nicht bereitgestellt.");
        return;
      }
      const result = await Promise.resolve(bridge.platformGetLogPath());
      const text = asDisplayText(result);
      if (!text || text === "null" || text === "undefined") {
        setBridgeStatus("DJI hat keinen Log-Pfad zurückgegeben. Das ist noch kein Download-Fehlercode.");
      } else {
        setPathResult(text);
        setBridgeStatus("DJI-Protokollpfad abgefragt. Das Auslesen des Pfads lädt keine Logdatei hoch.");
      }
    } catch (error) {
      setBridgeStatus(`DJI-Logpfad-Abfrage fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setChosen(event.target.files?.item(0) ?? null);
    setConsent(false);
    setUploadStatus("");
  }

  async function uploadLog() {
    if (!chosen || !consent || uploading) return;
    if (chosen.size > 12 * 1024 * 1024) {
      setUploadStatus("Datei ist größer als 12 MB. Bitte eine kleinere DJI-Logdatei wählen.");
      return;
    }
    setUploading(true);
    setUploadStatus("");
    try {
      const data = new FormData();
      data.append("log", chosen, chosen.name);
      const response = await fetch("/api/dji/pilot2/log-diagnose", {
        method: "POST", credentials: "same-origin", cache: "no-store", body: data,
      });
      const result: { error?: string; storedAs?: string; bytes?: number } = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setUploadStatus(`Datei geschützt gespeichert: ${result.storedAs ?? "OK"} (${result.bytes ?? chosen.size} Bytes). Noch nicht automatisch entschlüsselt oder ausgewertet.`);
      setConsent(false);
    } catch (error) {
      setUploadStatus(`Upload fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}. Falls HTTP 413 erscheint, ist möglicherweise die Webserver-Uploadgrenze zu niedrig.`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="mx-auto my-4 w-full max-w-2xl space-y-4 rounded-2xl border border-amber-300 bg-white p-4 text-slate-900 shadow-sm" aria-label="DJI Pilot 2 Protokolldiagnose">
      <div>
        <h2 className="text-lg font-bold">DJI Pilot 2 – Protokolldiagnose</h2>
        <p className="mt-1 text-sm text-slate-700">Für den Fehler „Download fehlgeschlagen“. Nur auf dieser PIN-geschützten Admin-Technikseite.</p>
      </div>
      <div className="space-y-2 rounded-xl border bg-slate-50 p-3">
        <button type="button" disabled={loading} onClick={() => void readLogPath()} className="w-full rounded-xl bg-slate-900 px-4 py-3 font-bold text-white disabled:opacity-50">
          {loading ? "DJI wird abgefragt …" : "DJI-Protokollpfad prüfen"}
        </button>
        {bridgeStatus && <p className="break-words text-sm" role="status">{bridgeStatus}</p>}
        {pathResult && (
          <div className="rounded-lg bg-white p-3">
            <p className="mb-1 text-xs font-semibold">DJI-Rückgabe / Protokollpfad</p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs" aria-label="DJI Protokollpfad">{pathResult}</pre>
          </div>
        )}
        <p className="text-xs text-slate-600">Die Schnittstelle liefert nur einen Pfad. Sie kann keinen Fehlerbericht automatisch entschlüsseln oder auf den Server übertragen.</p>
      </div>
      <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
        <h3 className="font-semibold">Optional: DJI-Logdatei hochladen</h3>
        <p className="text-sm text-slate-700">Nur wenn die DJI-Dateiauswahl auf der Fernbedienung funktioniert: Protokolldatei bewusst auswählen und geschützt zum Server übertragen. Die Dateien können verschlüsselt sein und sensible Gerätedaten enthalten.</p>
        <input type="file" onChange={selectFile} accept=".log,.txt,.zip,.gz,.dat,.bin,.plog,.json,.tar" className="block w-full text-sm" aria-label="DJI-Logdatei auswählen" />
        {chosen && <p className="break-all text-xs text-slate-600">Ausgewählt: {chosen.name} ({chosen.size} Bytes)</p>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
          <span>Ich möchte diese Logdatei zur Fehleranalyse auf unseren Server übertragen.</span>
        </label>
        <button type="button" disabled={!chosen || !consent || uploading} onClick={() => void uploadLog()} className="w-full rounded-xl bg-blue-800 px-4 py-3 font-bold text-white disabled:opacity-50">
          {uploading ? "Logdatei wird übertragen …" : "Ausgewählte Logdatei hochladen"}
        </button>
        {uploadStatus && <p role="status" className="break-words rounded-lg bg-white p-3 text-sm">{uploadStatus}</p>}
        <p className="text-xs text-slate-600">Keine automatische Dateiübertragung. Wenn die DJI-Webansicht die Android-Dateiauswahl nicht öffnet, ist dieser Uploadweg auf dem Gerät nicht verfügbar.</p>
      </div>
    </section>
  );
}
