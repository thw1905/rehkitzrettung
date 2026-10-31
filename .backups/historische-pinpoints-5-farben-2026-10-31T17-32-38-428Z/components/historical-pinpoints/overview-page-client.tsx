"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useHistoricalPinpoints } from "./use-historical-pinpoints";

const OverviewMap = dynamic(() => import("./overview-map"), { ssr: false });

export default function HistoricalPinpointsPageClient() {
  const [visible, setVisible] = useState(true);
  const [season, setSeason] = useState("all");
  const { items, seasons, error, loading, truncated } = useHistoricalPinpoints({ enabled: visible, season });
  return (
    <main className="min-h-screen bg-gray-50 p-3 pb-24 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-2xl bg-white p-4 shadow md:p-6">
          <h1 className="text-2xl font-bold text-gray-900">Historische PinPoints</h1>
          <p className="mt-1 text-sm text-gray-700">Alle PinPoints abgeschlossener Einsätze aus vergangenen Saisons. Nur zur Information; aktuelle Aufträge werden nicht verändert.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-gray-900">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
              Alte PinPoints anzeigen
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              Saison:
              <select className="rounded-lg border border-gray-300 bg-white px-3 py-2" value={season} onChange={(e) => setSeason(e.target.value)}>
                <option value="all">Alle Saisons</option>
                {seasons.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <span className="text-sm font-semibold text-violet-800">🟣 {visible ? `${items.length} historische Punkte` : "Ausgeblendet"}</span>
          </div>
          {loading && <p className="mt-2 text-sm text-gray-600">Lade historische PinPoints …</p>}
          {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
          {truncated && <p className="mt-2 text-sm font-semibold text-amber-800">Sehr viele Daten: Es werden höchstens 5.000 PinPoints angezeigt. Wähle eine einzelne Saison, um mehr Punkte dieser Saison zu sehen.</p>}
          {!loading && !error && visible && items.length === 0 && <p className="mt-2 text-sm text-gray-700">Für diese Auswahl sind keine historischen PinPoints gespeichert.</p>}
          <p className="mt-2 text-xs text-gray-600">🟣 Violett = historischer PinPoint. Durch Antippen werden Datum, Fläche und Wildzahlen angezeigt.</p>
        </section>
        <OverviewMap points={visible ? items : []} />
      </div>
    </main>
  );
}
