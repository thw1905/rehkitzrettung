"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

type TestDayRow = { id: string; date: string; isTest: true };
type CleanupPreview = {
  fingerprint: string;
  days: { id: string; date: string }[];
  counts: {
    days: number; teams: number; teamMembers: number;
    orders: number; pinpoints: number; findingsCorrections: number;
    availability: number; locations: number;
    pilotSessions: number; mapElements: number;
    batteryUsage: number; flightTimes: number; securedWild: number;
    cloudMissions: number; protectedMailRecords: number;
  };
  warnings: string[];
};

function formatDayLabel(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("de-DE", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export default function TestDaysAdminPageClient() {
  const [testDate, setTestDate] = useState("");
  const [testPin, setTestPin] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testDays, setTestDays] = useState<TestDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteScope, setDeleteScope] = useState<"single" | "all">("single");
  const [deleteDayId, setDeleteDayId] = useState("");
  const [deletePreview, setDeletePreview] = useState<CleanupPreview | null>(null);
  const [deletePin, setDeletePin] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadTestDays = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/test-days", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "TEST-Tage konnten nicht geladen werden.");
      const rows = Array.isArray(data.days) ? data.days as TestDayRow[] : [];
      setTestDays(rows);
      setDeleteDayId((prev) => rows.some((x) => x.id === prev) ? prev : rows[0]?.id || "");
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "TEST-Tage konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTestDays(); }, [loadTestDays]);

  function clearDeletePreview() {
    setDeletePreview(null);
    setDeletePin("");
    setDeleteMessage("");
  }

  async function createTestDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setTestMessage("");
    try {
      const res = await fetch("/api/test-days", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: testDate, pin: testPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Freigabe fehlgeschlagen.");
      setTestPin("");
      setTestMessage("TEST-Einsatztag freigegeben.");
      clearDeletePreview();
      await loadTestDays();
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : "Freigabe fehlgeschlagen.");
    } finally {
      setCreating(false);
    }
  }

  async function inspectTestDeletion() {
    clearDeletePreview();
    setDeleteBusy(true);
    try {
      const query = new URLSearchParams({ scope: deleteScope });
      if (deleteScope === "single") {
        if (!deleteDayId) throw new Error("Bitte zuerst einen TEST-Tag auswählen.");
        query.set("dayId", deleteDayId);
      }
      const res = await fetch(`/api/test-days/cleanup?${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Vorschau fehlgeschlagen.");
      setDeletePreview(data as CleanupPreview);
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "Vorschau fehlgeschlagen.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function performTestDeletion() {
    if (!deletePreview || deleteBusy || deletePin.length < 4) return;
    if (deleteScope === "all" && !window.confirm(
      `Wirklich alle ${deletePreview.counts.days} TEST-Einsatztage und ihre zugeordneten TEST-Daten löschen?`
    )) return;
    setDeleteBusy(true);
    setDeleteMessage("");
    try {
      const res = await fetch("/api/test-days/cleanup", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: deleteScope,
          ...(deleteScope === "single" ? { dayId: deleteDayId } : {}),
          fingerprint: deletePreview.fingerprint, pin: deletePin,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Löschen fehlgeschlagen.");
      const deletedDays = Number(data?.deleted?.days) || 0;
      setDeletePreview(null);
      setDeletePin("");
      await loadTestDays();
      const warnings: string[] = Array.isArray(data.warnings) ? data.warnings : [];
      setDeleteMessage(`${deletedDays} TEST-Tag(e) gelöscht.` +
        (warnings.length ? ` Achtung: ${warnings.join(" ")}` : ""));
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "Löschen fehlgeschlagen.");
      setDeletePreview(null);
      setDeletePin("");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-4 md:px-6 md:py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-8">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">TEST-Einsatztage</h1>
          <p className="mt-2 text-sm text-gray-600 md:text-base">
            Hier kannst du zusätzliche TEST-Tage freigeben, einzeln löschen oder alle TEST-Tage entfernen.
            Für alle Änderungen ist die Admin-PIN erforderlich.
          </p>
        </header>

        <section className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm md:p-5">
          <h2 className="font-bold text-gray-900">Zusätzlichen TEST-Einsatztag freigeben</h2>
          <p className="mt-1 text-sm text-gray-600">
            Außerhalb Mai bis Juli. TEST-Daten werden nicht für echte Einsätze gewertet.
          </p>
          <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={createTestDay}>
            <input type="date" required aria-label="TEST-Datum" value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              className="rounded-lg border p-2 text-gray-900" />
            <input type="password" inputMode="numeric" required minLength={4} maxLength={64}
              aria-label="TEST-PIN" placeholder="PIN" value={testPin}
              onChange={(e) => setTestPin(e.target.value)}
              className="rounded-lg border p-2 text-gray-900" />
            <button type="submit" disabled={creating}
              className="rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
              {creating ? "Bitte warten …" : "TEST-Tag freigeben"}
            </button>
          </form>
          {testMessage && <p className="mt-2 text-sm text-gray-800" role="status">{testMessage}</p>}
        </section>

        <section className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm md:p-5">
          <h2 className="font-bold text-gray-900">TEST-Einsätze verwalten und löschen</h2>
          <p className="mt-1 text-sm text-gray-700">
            Nur TEST-Daten: Echte Einsätze, Flächen, Helfer, Landwirte und Drohnen bleiben erhalten.
            Vor dem Löschen wird genau angezeigt, was betroffen ist.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
              Löschumfang
              <select className="rounded-lg border border-gray-300 bg-white p-2"
                value={deleteScope}
                onChange={(e) => { setDeleteScope(e.target.value as "single" | "all"); clearDeletePreview(); }}>
                <option value="single">Einen TEST-Tag löschen</option>
                <option value="all">Alle TEST-Tage löschen</option>
              </select>
            </label>
            {deleteScope === "single" && (
              <label className="flex flex-col gap-1 text-sm font-medium text-gray-900">
                TEST-Einsatztag
                <select className="rounded-lg border border-gray-300 bg-white p-2"
                  value={deleteDayId}
                  onChange={(e) => { setDeleteDayId(e.target.value); clearDeletePreview(); }}>
                  {testDays.map((day) => <option key={day.id} value={day.id}>{formatDayLabel(day.date)}</option>)}
                </select>
              </label>
            )}
            <button type="button" disabled={deleteBusy || loading || testDays.length === 0}
              onClick={inspectTestDeletion}
              className="rounded-lg border border-red-400 px-4 py-2 font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50">
              Löschung prüfen
            </button>
          </div>
          {loading && <p className="mt-2 text-sm text-gray-600">TEST-Tage werden geladen …</p>}
          {!loading && testDays.length === 0 &&
            <p className="mt-2 text-sm text-gray-600">Keine TEST-Einsatztage vorhanden.</p>}
          {deletePreview && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4">
              <h3 className="font-bold text-red-900">Vorschau: {deletePreview.counts.days} TEST-Tag(e)</h3>
              <p className="mt-1 text-xs text-red-900">
                {deletePreview.days.slice(0, 12).map((day) => formatDayLabel(day.date)).join(", ")}
                {deletePreview.days.length > 12 ? " und weitere …" : ""}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-900 sm:grid-cols-3">
                <p>Teams: <strong>{deletePreview.counts.teams}</strong></p>
                <p>Teammitglieder: <strong>{deletePreview.counts.teamMembers}</strong></p>
                <p>Aufträge: <strong>{deletePreview.counts.orders}</strong></p>
                <p>PinPoints: <strong>{deletePreview.counts.pinpoints}</strong></p>
                <p>Fundkorrekturen: <strong>{deletePreview.counts.findingsCorrections}</strong></p>
                <p>Verfügbarkeiten: <strong>{deletePreview.counts.availability}</strong></p>
                <p>GPS-Freigaben: <strong>{deletePreview.counts.locations}</strong></p>
                <p>DJI-Punkte: <strong>{deletePreview.counts.mapElements}</strong></p>
                <p>DJI-Sitzungen: <strong>{deletePreview.counts.pilotSessions}</strong></p>
                <p>Akku-Testverläufe: <strong>{deletePreview.counts.batteryUsage}</strong></p>
                <p>DJI-Flugzeiten: <strong>{deletePreview.counts.flightTimes}</strong></p>
                <p>Wild-Sicherungsorte: <strong>{deletePreview.counts.securedWild}</strong></p>
                <p>TEST-Cloudmissionen: <strong>{deletePreview.counts.cloudMissions}</strong></p>
              </div>
              {deletePreview.warnings.map((warning, index) =>
                <p key={index} className="mt-2 text-xs text-red-900">{warning}</p>)}
              <p className="mt-4 text-sm font-semibold text-red-900">Zum Löschen PIN eingeben:</p>
              <input className="mt-2 w-full rounded-lg border border-red-400 bg-white p-2 text-gray-900"
                type="password" inputMode="numeric" autoComplete="off" minLength={4} maxLength={64}
                aria-label="Admin-PIN zum Löschen" placeholder="PIN"
                value={deletePin} onChange={(e) => setDeletePin(e.target.value)} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={performTestDeletion}
                  disabled={deleteBusy || deletePin.length < 4}
                  className="rounded-lg bg-red-800 px-4 py-2 font-bold text-white disabled:opacity-50">
                  {deleteBusy ? "Bitte warten …" : "TEST-Daten endgültig löschen"}
                </button>
                <button type="button" onClick={clearDeletePreview} disabled={deleteBusy}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-900">
                  Abbrechen
                </button>
              </div>
            </div>
          )}
          {deleteMessage && <p className="mt-2 text-sm text-gray-900" role="status">{deleteMessage}</p>}
        </section>
      </div>
    </main>
  );
}
