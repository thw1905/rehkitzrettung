"use client";
// DJI_BATTERY_PLACEMENT_V8_1: inline card for My Orders and DJI Pilot 2; never a floating overlay.
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Drone = { id: string; label: string };
type Recommendation = {
  drones: Drone[];
  aircraftId: string | null;
  aircraftLabel: string | null;
  currentNumber: number | null;
  nextNumber: number | null;
  remaining: number;
  phase: "FIRST_START" | "NEXT_CHANGE" | "SELECT_AIRCRAFT";
  reason?: string | null;
};
const STORAGE_KEY = "rk-dji-preferred-aircraft";
const UPDATE_EVENT = "rk-dji-aircraft-change";

export default function DjiGlobalBatteryRecommendation() {
  const pathname = usePathname();
  const [choice, setChoice] = useState("");
  const [data, setData] = useState<Recommendation | null>(null);
  const [minimized, setMinimized] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const prevRecommendation = useRef("");

  // Bridge detection in PilotSimpleClient writes the same key and signals this event.
  useEffect(() => {
    const sync = () => setChoice(window.localStorage.getItem(STORAGE_KEY) || "");
    sync();
    window.addEventListener(UPDATE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(UPDATE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const load = useCallback(async (alive: () => boolean) => {
    try {
      const query = choice ? `?aircraftId=${encodeURIComponent(choice)}` : "";
      const response = await fetch(`/api/dji/pilot2/battery-overlay${query}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) {
        if (alive()) setData(null);
        return;
      }
      const result = await response.json() as Recommendation;
      if (!alive()) return;
      setData(result);
      const nextKey = result.aircraftId && result.nextNumber !== null
        ? `${result.aircraftId}:${result.phase}:${result.nextNumber}` : "";
      if (nextKey && prevRecommendation.current && nextKey !== prevRecommendation.current) setMinimized(false);
      prevRecommendation.current = nextKey;
    } catch {
      if (alive()) setData(null);
    }
  }, [choice]);

  useEffect(() => {
    let active = true;
    const alive = () => active;
    const update = () => void load(alive);
    update();
    const timer = window.setInterval(update, 15_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [pathname, load, refreshKey]);

  function changeAircraft(id: string) {
    setChoice(id);
    window.localStorage.setItem(STORAGE_KEY, id);
    window.dispatchEvent(new Event(UPDATE_EVENT));
    setMinimized(false);
  }

  // No overlay for unauthenticated, unapproved or non-pilot users (API returns 403).
  if (!data || data.drones.length === 0) return null;
  const chosen = Boolean(data.aircraftId);
  const mainText = data.nextNumber !== null ? `Akku ${data.nextNumber}` : "Keine Empfehlung";
  return (
    <aside aria-label="DJI Akkuempfehlung" className="w-full text-slate-900">
      <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
          <span>🔋 DJI-Akkuempfehlung</span>
          <button type="button" onClick={() => setMinimized((value) => !value)}
            aria-label={minimized ? "Akkuempfehlung aufklappen" : "Akkuempfehlung minimieren"}
            className="rounded px-2 py-1 text-white hover:bg-slate-700">
            {minimized ? "Öffnen" : "Minimieren"}
          </button>
        </div>
        {minimized ? (
          <button type="button" className="block w-full px-3 py-3 text-left text-sm font-semibold"
            onClick={() => setMinimized(false)}>
            {chosen ? `${data.aircraftLabel}: ${mainText}` : "Drohne für Akkuempfehlung wählen"}
          </button>
        ) : (
          <div className="space-y-3 px-3 py-3 text-sm" aria-live="polite">
            <label className="block text-xs font-medium text-slate-600">
              Drohne
              <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                value={data.aircraftId || ""} onChange={(event) => changeAircraft(event.target.value)}>
                <option value="">Drohne auswählen</option>
                {data.drones.map((drone) => <option key={drone.id} value={drone.id}>{drone.label}</option>)}
              </select>
            </label>
            {chosen ? (
              <>
                <p className="text-xs text-slate-600">
                  {data.phase === "FIRST_START" ? "Vor dem ersten Start verwenden" : "Beim nächsten Akkuwechsel verwenden"}
                </p>
                <div className="text-2xl font-bold">{mainText}</div>
                {data.currentNumber !== null && <p className="text-xs text-slate-700">Aktuell eingesetzt: Akku {data.currentNumber}</p>}
                {data.nextNumber === null && <p className="text-xs text-amber-800">{data.reason || "Kein weiterer geeigneter Akku bekannt."}</p>}
              </>
            ) : <p className="text-xs text-slate-600">Vor dem ersten Start die Drohne auswählen. Die letzte Auswahl wird auf diesem Gerät gespeichert.</p>}
            <div className="flex justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
              <span>Reihenfolge nach Ladezyklen</span>
              <button type="button" className="font-semibold text-slate-700 underline" onClick={() => setRefreshKey((v) => v + 1)}>
                Aktualisieren
              </button>
            </div>
          </div>
        )}
      </section>
    </aside>
  );
}
