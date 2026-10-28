"use client";

import { useEffect, useState } from "react";

type Battery = {
  id: string;
  labelNumber: number | null;
  lastLabelNumber: number | null;
  serialNumber: string | null;
  status: string;
  cycles: number | null;
  cycleSource: string | null;
  capacityPercent: number | null;
  lastSeenAt: string | null;
  retiredAt: string | null;
};
type Aircraft = {
  id: string;
  label: string;
  model: string;
  serialNumber: string | null;
  isActive: boolean;
  batteries: Battery[];
};
type Inventory = { aircraft: Aircraft[] };

export default function DjiBatteryInventoryClient() {
  const [items, setItems] = useState<Aircraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [droneName, setDroneName] = useState("");
  const [droneModel, setDroneModel] = useState("DJI M4T");
  const [droneSerial, setDroneSerial] = useState("");
  const [initialBatteryCount, setInitialBatteryCount] = useState("5");
  const [selectedAircraft, setSelectedAircraft] = useState("");
  const [batteryNumber, setBatteryNumber] = useState("1");
  const [batterySerial, setBatterySerial] = useState("");
  const [serialInputs, setSerialInputs] = useState<Record<string, string>>({});
  const [aircraftNumberInputs, setAircraftNumberInputs] = useState<Record<string, string>>({}); // DJI_ADMIN_UI_V11_5
  const [numberInputs, setNumberInputs] = useState<Record<string, string>>({});
  const [showRetired, setShowRetired] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/dji-akkus", { cache: "no-store" });
    const data = await response.json() as Inventory & { error?: string };
    if (!response.ok) throw new Error(data.error || "Drohnen konnten nicht geladen werden.");
    setItems(data.aircraft);
    if (!selectedAircraft && data.aircraft.length) setSelectedAircraft(data.aircraft[0].id);
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/dji-akkus", { cache: "no-store" }).then(async (res) => {
      const data = await res.json() as Inventory & { error?: string };
      if (!res.ok) throw new Error(data.error || "Daten konnten nicht geladen werden.");
      if (!cancelled) {
        setItems(data.aircraft);
        if (data.aircraft.length) setSelectedAircraft(data.aircraft[0].id);
      }
    }).catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Ladefehler.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function save(action: string, extra: Record<string, unknown>, success: string) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/dji-akkus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Speichern fehlgeschlagen.");
      await refresh();
      setMessage(success);
      if (action === "create-aircraft") { setDroneName(""); setDroneSerial(""); }
      if (action === "register-battery") setBatterySerial("");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 text-slate-900">
      <header className="rounded-2xl bg-slate-900 p-5 text-white">
        <h1 className="text-2xl font-bold">Drohnen- und Akkuverwaltung</h1>
          {/* DJI_BATTERY_HISTORY_V9: read-only history; only administrator page grants access. */}
          <a href="/admin/dji-akku-historie" className="mt-3 inline-block rounded-lg border border-white/50 px-3 py-2 text-sm text-white hover:bg-white/10">Akkuhistorie ansehen</a>
        <p className="mt-2 text-sm text-slate-200">Hegering-Bestand, unabhängig vom jeweiligen Piloten. Drohnen und Akkus werden per DJI-Telemetrie automatisch erkannt. Nur die Aufklebernummern werden einmalig eingetragen.</p>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900">{message}</p>}
      <details className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
        <summary className="cursor-pointer text-base font-semibold text-slate-900">Manuelle Erfassung (nur Notfall) – aufklappen</summary>
        <p className="my-3 text-sm text-slate-600">Normalerweise werden Drohnen und Akkus automatisch über DJI erkannt. Nur bei Bedarf manuell hinzufügen.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <form className="space-y-3 rounded-2xl border bg-white p-4" onSubmit={(event) => {
            event.preventDefault();
            void save("create-aircraft", { label: droneName, model: droneModel, serialNumber: droneSerial, batteryCount: Number(initialBatteryCount) }, "Drohne und nummerierte Akkuplaetze angelegt.");
          }}>
            <h2 className="text-lg font-semibold">Drohne hinzufügen</h2>
            <label className="block text-sm">Bezeichnung
              <input required maxLength={64} className="mt-1 w-full rounded-lg border p-2" placeholder="z. B. Drohne 1" value={droneName} onChange={e => setDroneName(e.target.value)} />
            </label>
            <label className="block text-sm">Modell
              <select className="mt-1 w-full rounded-lg border p-2" value={droneModel} onChange={e => setDroneModel(e.target.value)}>
                <option value="DJI M3T">DJI Mavic 3 Thermal (M3T)</option>
                <option value="DJI M4T">DJI Matrice 4 Thermal (M4T)</option>
                <option value="Sonstiges">Sonstiges DJI-Modell</option>
              </select>
            </label>
            <label className="block text-sm">Anzahl bereits beschrifteter Akkus (1 bis N automatisch anlegen)
              <select className="mt-1 w-full rounded-lg border p-2" value={initialBatteryCount} onChange={e => setInitialBatteryCount(e.target.value)}>
                <option value="0">0 – später erfassen</option>
                <option value="3">3 Akkus</option>
                <option value="4">4 Akkus</option>
                <option value="5">5 Akkus</option>
                <option value="6">6 Akkus</option>
              </select>
            </label>
            <label className="block text-sm">Drohnen-Seriennummer (optional)
              <input maxLength={80} className="mt-1 w-full rounded-lg border p-2" value={droneSerial} onChange={e => setDroneSerial(e.target.value)} />
            </label>
            <button disabled={busy || loading} className="w-full rounded-lg bg-slate-900 p-3 font-semibold text-white disabled:opacity-50">Drohne speichern</button>
          </form>
          <form className="space-y-3 rounded-2xl border bg-white p-4" onSubmit={(event) => {
            event.preventDefault();
            void save("register-battery", { aircraftId: selectedAircraft, labelNumber: Number(batteryNumber), serialNumber: batterySerial }, "Akku registriert.");
          }}>
            <h2 className="text-lg font-semibold">Beschrifteten Akku erfassen</h2>
            <label className="block text-sm">Zugehörige Drohne
              <select required className="mt-1 w-full rounded-lg border p-2" value={selectedAircraft} onChange={e => setSelectedAircraft(e.target.value)}>
                {!items.length && <option value="">Zuerst Drohne anlegen</option>}
                {items.filter(x => x.isActive).map(x => <option key={x.id} value={x.id}>{x.label} ({x.model})</option>)}
              </select>
            </label>
            <label className="block text-sm">Nummer auf dem Akku
              <input required min={1} max={99} type="number" className="mt-1 w-full rounded-lg border p-2" value={batteryNumber} onChange={e => setBatteryNumber(e.target.value)} />
            </label>
            <label className="block text-sm">Seriennummer (optional – später zuordnen)
              <input maxLength={80} className="mt-1 w-full rounded-lg border p-2" value={batterySerial} onChange={e => setBatterySerial(e.target.value)} />
            </label>
            <button disabled={busy || loading || !selectedAircraft} className="w-full rounded-lg bg-emerald-700 p-3 font-semibold text-white disabled:opacity-50">Akku speichern</button>
          </form>
        </div>
      </details>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Bestand ({items.length} Drohnen)</h2>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} /> Ausgemusterte Akkus anzeigen</label>
        </div>
        {loading && <p>Geräte werden geladen …</p>}
        {!loading && !items.length && <p className="rounded-lg bg-slate-100 p-4 text-sm">Noch keine Drohne erkannt. Sie erscheint automatisch bei eingehender DJI-Telemetrie.</p>}
        {items.map(aircraft => {
          const batteries = aircraft.batteries.filter(b => showRetired || b.status !== "RETIRED");
          const available = aircraft.batteries.filter(b => b.status === "ACTIVE" && b.cycles != null && b.labelNumber != null);
          const recommendation = available.sort((a, b) => (a.cycles ?? 999999) - (b.cycles ?? 999999))[0];
          return <article key={aircraft.id} className="space-y-3 rounded-2xl border bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-bold">{aircraft.label} <span className="text-sm font-normal text-slate-600">({aircraft.model})</span></h3>
              <span className="text-xs text-slate-500">{aircraft.batteries.filter(b => b.status !== "RETIRED").length} aktive/gesperrte Akkus</span>
            </div>
            {/* DJI_ADMIN_UI_V11_5: die Drohne wird weiterhin allein per DJI-Seriennummer erkannt. */}
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
              <label className="block text-sm font-medium text-slate-800" htmlFor={`dji-aircraft-number-${aircraft.id}`}>Nummer auf der Drohne</label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  id={`dji-aircraft-number-${aircraft.id}`}
                  type="number" min={1} max={99} step={1}
                  className="w-24 rounded-lg border bg-white p-2 text-sm"
                  placeholder="1–99"
                  value={aircraftNumberInputs[aircraft.id] ?? (/^Drohne ([1-9]\d?)$/.exec(aircraft.label)?.[1] ?? "")}
                  onChange={(event) => setAircraftNumberInputs(old => ({ ...old, [aircraft.id]: event.target.value }))}
                />
                <button
                  type="button"
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={busy || loading || !/^(?:[1-9]|[1-9]\d)$/.test(aircraftNumberInputs[aircraft.id] ?? (/^Drohne ([1-9]\d?)$/.exec(aircraft.label)?.[1] ?? ""))}
                  onClick={() => void save("set-aircraft-number", { aircraftId: aircraft.id, number: Number(aircraftNumberInputs[aircraft.id] ?? (/^Drohne ([1-9]\d?)$/.exec(aircraft.label)?.[1] ?? "")) }, "Drohnennummer gespeichert.")}
                >Nummer speichern</button>
                <span className="text-xs text-slate-600">Die DJI-Seriennummer und automatische Erkennung bleiben bestehen.</span>
              </div>
            </div>
            {recommendation && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">Geringste bekannte Ladezyklen: <strong>Akku {recommendation.labelNumber}</strong>. Ladezustand und technischen Zustand vor Nutzung prüfen.</p>}
            <div className="space-y-2">
              {batteries.map(battery => <div key={battery.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>Akku {battery.labelNumber ?? battery.lastLabelNumber ?? "?"}{battery.status === "RETIRED" ? " (ausgemustert)" : ""}</strong>
                  <span className={battery.status === "ACTIVE" ? "text-emerald-700" : "text-amber-700"}>{battery.status === "ACTIVE" ? "Aktiv" : battery.status === "BLOCKED" ? "Gesperrt" : "Ausgemustert"}</span>
                </div>
                <div className="mt-1 text-slate-600">Ladezyklen: <strong>{battery.cycles ?? "noch nicht ausgelesen"}</strong> · Zuletzt gemeldeter Ladestand: {battery.capacityPercent == null ? "–" : `${battery.capacityPercent} %`}</div>
                <p className="mt-1 break-all text-xs text-slate-500">Seriennummer: {battery.serialNumber || "noch nicht zugeordnet"}</p>
                {battery.status !== "RETIRED" && <div className="mt-3 flex flex-wrap items-center gap-2">
                  {battery.serialNumber && battery.labelNumber == null && <>
                    <label className="text-sm">Aufklebernummer
                      <input aria-label="Aufklebernummer" type="number" min={1} max={99} className="ml-2 w-20 rounded-lg border p-2" value={numberInputs[battery.id] ?? ""} onChange={e => setNumberInputs(old => ({ ...old, [battery.id]: e.target.value }))} />
                    </label>
                    <button type="button" disabled={busy || !/^[1-9]\d?$/.test(numberInputs[battery.id] || "")} className="rounded-lg border p-2 disabled:opacity-50" onClick={() => void save("set-label", { batteryId: battery.id, labelNumber: Number(numberInputs[battery.id]) }, "Aufklebernummer zugeordnet.")}>Nummer zuordnen</button>
                  </>}
                  {!battery.serialNumber && <>
                    <input aria-label={`Seriennummer fuer Akku ${battery.labelNumber}`} className="min-w-0 flex-1 rounded-lg border p-2" placeholder="DJI-Seriennummer" value={serialInputs[battery.id] ?? ""} onChange={e => setSerialInputs(old => ({ ...old, [battery.id]: e.target.value }))} />
                    <button type="button" disabled={busy || !serialInputs[battery.id]?.trim()} className="rounded-lg border bg-slate-100 p-2 disabled:opacity-50" onClick={() => void save("assign-serial", { batteryId: battery.id, serialNumber: serialInputs[battery.id] }, "Seriennummer zugeordnet.")}>Zuordnen</button>
                  </>}
                  <button type="button" disabled={busy} className="rounded-lg border p-2 disabled:opacity-50" onClick={() => void save("set-blocked", { batteryId: battery.id, blocked: battery.status !== "BLOCKED" }, battery.status === "BLOCKED" ? "Akku freigegeben." : "Akku gesperrt.")}>{battery.status === "BLOCKED" ? "Freigeben" : "Sperren"}</button>
                  <button type="button" disabled={busy} className="rounded-lg border border-red-300 p-2 text-red-800 disabled:opacity-50" onClick={() => {
                    if (window.confirm(`Akku ${battery.labelNumber} wirklich ausmustern? Seine Historie und Seriennummer bleiben erhalten; die Nummer kann danach neu vergeben werden.`)) {
                      void save("retire-battery", { batteryId: battery.id }, "Akku archiviert. Die aufgeklebte Nummer ist wieder frei.");
                    }
                  }}>Ausmustern</button>
                </div>}
              </div>)}
              {!batteries.length && <p className="text-sm text-slate-500">Noch keine Akkus erfasst.</p>}
            </div>
          </article>;
        })}
      </section>
      <p className="text-xs text-slate-500">DJI Autoerkennung V5: Seriennummern und Ladezyklen werden bei aktiver MQTT-Verbindung automatisch erfasst. Nur die Aufklebernummer ist einmalig einzutragen. Gemeldete Ladestaende koennen veraltet sein.</p>
    </main>
  );
}
