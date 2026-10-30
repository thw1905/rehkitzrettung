"use client";
import { useState } from "react";
import WildSiteShare from "@/components/orders/WildSiteShare";

type Props = { orderId: string; pinpointId: string; onClose: () => void };
type Site = { url: string; expiresAt: string };
export default function SecuredWildCaptureModal({ orderId, pinpointId, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [site, setSite] = useState<Site | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  async function capture() {
    setError("");
    if (!navigator.geolocation) { setError("Standortermittlung ist auf diesem Gerät nicht verfügbar."); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async position => {
      setAccuracy(position.coords.accuracy);
      try {
        const response = await fetch("/api/wild-sites", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, pinpointId, latitude: position.coords.latitude,
            longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy }) });
        const data = await response.json().catch(() => ({})) as Site & { error?: string };
        if (!response.ok) throw new Error(data.error || "GPS-Punkt konnte nicht gespeichert werden.");
        setSite({ url: data.url, expiresAt: data.expiresAt });
      } catch (e) { setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen."); }
      finally { setBusy(false); }
    }, e => {
      setBusy(false);
      setError(e.code === 1 ? "Standortfreigabe verweigert. Bitte GPS-Berechtigung im Browser erlauben."
        : e.code === 3 ? "GPS-Zeitüberschreitung. Bitte erneut versuchen." : "GPS-Standort nicht verfügbar.");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }
  return <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/60 p-4">
    <section role="dialog" aria-modal="true" aria-label="Sicherungsort erfassen" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl space-y-4">
      <h2 className="text-xl font-bold">Wild-Sicherungsort erfassen?</h2>
      {!site ? <>
        <p>Du hast gesichertes Wild erfasst. Soll dein jetziger Handy-Standort als Sicherungsort gespeichert werden?</p>
        <button type="button" disabled={busy} onClick={() => void capture()} className="w-full rounded-xl bg-green-700 p-3 font-semibold text-white disabled:opacity-50">
          {busy ? "GPS wird ermittelt …" : "Aktuellen Standort übernehmen"}
        </button>
        <button type="button" disabled={busy} onClick={onClose} className="w-full rounded-xl border p-3">Ohne Sicherungsort fortfahren</button>
        <p className="text-xs text-gray-600">Das Wildzahlergebnis ist bereits gespeichert. Der Sicherungsort wird um Mitternacht gelöscht. Keine Freilass-Bestätigung erforderlich.</p>
      </> : <>
        <p className="font-semibold text-green-800">Sicherungsort gespeichert.</p>
        {accuracy != null && <p className="text-sm">GPS-Genauigkeit ca. {Math.round(accuracy)} m{accuracy > 50 ? " – bitte Standort prüfen." : "."}</p>}
        <WildSiteShare url={site.url} expiresAt={site.expiresAt} />
        <button type="button" onClick={onClose} className="w-full rounded-xl border p-3">Schließen</button>
      </>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  </div>;
}
