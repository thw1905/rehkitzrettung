"use client";

import { useEffect, useState } from "react";

type CountKey =
  | "rehkitzeGesichert"
  | "rehkitzeAbgesprungen"
  | "sonstigesWildGesichert"
  | "sonstigesWildAbgesprungen"
  | "maulwurfhuegelFehlstelle";

type Counts = Record<CountKey, number>;

const CATEGORIES: { key: CountKey; label: string; icon: string; className: string }[] = [
  { key: "rehkitzeGesichert", label: "Kitz gesichert", icon: "🦌", className: "border-green-300 bg-green-50" },
  { key: "rehkitzeAbgesprungen", label: "Kitz abgesprungen", icon: "🦌", className: "border-amber-300 bg-amber-50" },
  { key: "sonstigesWildGesichert", label: "Sonstiges Wild gesichert", icon: "🌿", className: "border-emerald-300 bg-emerald-50" },
  { key: "sonstigesWildAbgesprungen", label: "Sonstiges Wild abgesprungen", icon: "🌿", className: "border-orange-300 bg-orange-50" },
  { key: "maulwurfhuegelFehlstelle", label: "Maulwurfhügel / Fehlstelle", icon: "🕳️", className: "border-slate-300 bg-slate-50" },
];

const EMPTY: Counts = {
  rehkitzeGesichert: 0,
  rehkitzeAbgesprungen: 0,
  sonstigesWildGesichert: 0,
  sonstigesWildAbgesprungen: 0,
  maulwurfhuegelFehlstelle: 0,
};

type HistoryEntry = {
  id: string;
  correctedAt: string;
  correctedByName: string;
  reason: string;
  beforeData: Partial<Counts>;
  afterData: Partial<Counts>;
};

type Data = {
  orderId: string;
  orderLabel: string;
  canCorrect: boolean;
  dayClosed: boolean;
  status: string;
  revision: string;
  counts: Counts;
  corrections: HistoryEntry[];
};

type Props = {
  orderId: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export default function DirectFindingsCorrectionModal({ orderId, onClose, onSaved }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [counts, setCounts] = useState<Counts>(EMPTY);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      setData(null);
      setReason("");
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/direct-findings-correction`, { cache: "no-store" });
        const json = await response.json();
        if (!response.ok) throw new Error(json?.error || "Direktfunde konnten nicht geladen werden.");
        if (!cancelled) {
          setData(json as Data);
          setCounts({ ...(json.counts as Counts) });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Fehler beim Laden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [orderId]);

  function adjust(key: CountKey, delta: number) {
    setCounts((previous) => ({
      ...previous,
      [key]: Math.min(6, Math.max(0, previous[key] + delta)),
    }));
  }

  const hasChanges = data != null && CATEGORIES.some(({ key }) => data.counts[key] !== counts[key]);

  async function save() {
    if (!data || !data.canCorrect || !hasChanges || saving || reason.trim().length < 5) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/direct-findings-correction`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counts,
          reason: reason.trim(),
          expectedUpdatedAt: data.revision,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Korrektur konnte nicht gespeichert werden.");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Korrektur konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Direktfunde korrigieren">
      <div className="flex max-h-[96dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="shrink-0 border-b border-gray-200 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-gray-950">✏️ Direktfunde korrigieren</h2>
              <p className="text-sm font-semibold text-gray-700">{data?.orderLabel || "Auftrag wird geladen ..."}</p>
              <p className="mt-1 text-xs text-gray-600">Nur Funde ohne Pinpoint · Höchstens 6 pro Kategorie</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border px-3 py-2 text-sm font-semibold">Schließen</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
          {loading ? <div className="p-4 text-sm">Direktfunde werden geladen ...</div> : null}

          {error ? <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900" role="alert">{error}</div> : null}

          {data && !data.canCorrect ? (
            <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              {data.status !== "ERLEDIGT"
                ? "Der Auftrag ist noch nicht erledigt. Direktfunde kannst du vor dem Abschluss im normalen Auftragsfenster ändern."
                : data.dayClosed
                  ? "Der Einsatztag ist bereits abgeschlossen. Nur Administratoren dürfen jetzt korrigieren."
                  : "Für diese Korrektur besteht keine Berechtigung."}
            </div>
          ) : null}

          {data && (
            <>
              <div className="space-y-2">
                {CATEGORIES.map((category) => (
                  <div key={category.key} className="flex gap-2">
                    <button
                      type="button"
                      disabled={!data.canCorrect || saving || counts[category.key] >= 6}
                      onClick={() => adjust(category.key, 1)}
                      className={`flex min-h-[72px] min-w-0 flex-1 items-center justify-between rounded-2xl border-2 p-3 text-left text-gray-950 disabled:opacity-50 ${category.className}`}
                      aria-label={`${category.label}: plus eins`}
                    >
                      <span className="text-sm font-bold">{category.icon} {category.label}</span>
                      <span className="ml-2 shrink-0 rounded-xl bg-white px-3 py-2 text-2xl font-black tabular-nums">{counts[category.key]}</span>
                    </button>
                    <button
                      type="button"
                      disabled={!data.canCorrect || saving || counts[category.key] <= 0}
                      onClick={() => adjust(category.key, -1)}
                      className="w-12 shrink-0 rounded-xl border-2 border-gray-300 bg-white text-2xl font-bold disabled:opacity-30"
                      aria-label={`${category.label}: minus eins`}
                    >−</button>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl bg-gray-100 p-3 text-sm font-bold text-gray-900">
                Direktfunde insgesamt: {CATEGORIES.reduce((sum, { key }) => sum + counts[key], 0)}
              </div>

              {data.canCorrect && (
                <div className="mt-4">
                  <label htmlFor="direct-findings-correction-reason" className="mb-1 block text-sm font-bold text-gray-900">Korrekturgrund (Pflichtfeld)</label>
                  <textarea
                    id="direct-findings-correction-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="z. B. ein Kitz wurde versehentlich doppelt eingetragen"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                </div>
              )}

              <details className="mt-3 rounded-xl border border-gray-200 p-3">
                <summary className="cursor-pointer text-sm font-bold">Korrekturverlauf ({data.corrections.length})</summary>
                {data.corrections.length === 0 ? <p className="mt-2 text-sm text-gray-600">Bisher keine Korrekturen.</p> : null}
                <div className="mt-2 space-y-3">
                  {data.corrections.map((entry) => (
                    <div key={entry.id} className="rounded-xl bg-gray-50 p-3 text-sm">
                      <div className="font-bold">{entry.correctedByName} · {new Date(entry.correctedAt).toLocaleString("de-DE")}</div>
                      <div className="mt-1 text-gray-700">Grund: {entry.reason}</div>
                      <div className="mt-2 space-y-1 text-xs text-gray-600">
                        {CATEGORIES.filter(({ key }) => entry.beforeData?.[key] !== entry.afterData?.[key]).map(({ key, label }) => (
                          <div key={key}>{label}: {entry.beforeData?.[key] ?? "–"} → {entry.afterData?.[key] ?? "–"}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-gray-300 px-3 py-3 text-sm font-bold">Abbrechen</button>
            <button type="button" onClick={() => void save()} disabled={!data?.canCorrect || !hasChanges || reason.trim().length < 5 || saving} className="rounded-xl bg-green-700 px-3 py-3 text-sm font-bold text-white disabled:opacity-40">
              {saving ? "Speichert ..." : "Korrektur speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
