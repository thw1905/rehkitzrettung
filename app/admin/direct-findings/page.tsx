"use client";

import { useCallback, useEffect, useState } from "react";
import DirectFindingsCorrectionModal from "@/components/orders/direct-findings-correction-modal";

type ResultOrder = {
  id: string;
  label: string;
  fieldLabel: string;
  ownerName: string;
  pilotName: string;
  teamName: string;
  endTime: string | null;
  mowingDate: string | null;
  operationDayStatus: string;
  directTotal: number;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("de-DE");
}

export default function AdminDirectFindingsPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<ResultOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/direct-findings?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Abgeschlossene Aufträge konnten nicht geladen werden.");
      setOrders(Array.isArray(json.orders) ? json.orders : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-5 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-black text-gray-950">Direktfunde korrigieren</h1>
          <p className="mt-2 text-sm text-gray-700">Admin-Ansicht für erledigte Aufträge aller Teams. Jede Korrektur wird mit Grund und alten/neuen Zahlen protokolliert.</p>
          <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); setQuery(input.trim()); }}>
            <input className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-3" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Auftragsnummer, Landwirt oder Fläche suchen" />
            <button className="rounded-xl bg-black px-5 py-3 font-semibold text-white" type="submit">Suchen</button>
            <button className="rounded-xl border px-4 py-3 font-semibold" type="button" onClick={() => { setInput(""); setQuery(""); void load(); }}>Zurücksetzen</button>
          </form>
        </div>

        {error && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">{error}</div>}
        {loading ? <div className="rounded-xl bg-white p-4 text-sm">Lade Aufträge ...</div> : null}
        {!loading && !error && orders.length === 0 ? <div className="rounded-xl bg-white p-4 text-sm">Keine erledigten Aufträge gefunden.</div> : null}

        <div className="space-y-3">
          {orders.map((order) => (
            <article key={order.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div className="min-w-0 space-y-1">
                  <div className="text-lg font-extrabold text-gray-950">{order.label}</div>
                  <div className="text-sm text-gray-800">{order.fieldLabel} · {order.ownerName}</div>
                  <div className="text-xs text-gray-600">Team: {order.teamName} · Pilot: {order.pilotName}</div>
                  <div className="text-xs text-gray-600">Mähdatum: {formatDate(order.mowingDate)} · Einsatzende: {formatDate(order.endTime)} · Einsatztag: {order.operationDayStatus}</div>
                  <div className="text-sm font-semibold text-gray-800">Direktfunde gesamt: {order.directTotal}</div>
                </div>
                <button type="button" onClick={() => setSelectedId(order.id)} className="shrink-0 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">✏️ Direktfunde korrigieren</button>
              </div>
            </article>
          ))}
        </div>
        <p className="text-xs text-gray-500">Es werden maximal 100 passende Aufträge angezeigt. Verwende die Suche, um ältere Aufträge zu finden.</p>
      </div>
      {selectedId && (
        <DirectFindingsCorrectionModal
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={async () => { await load(); }}
        />
      )}
    </main>
  );
}
