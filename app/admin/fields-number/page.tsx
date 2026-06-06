"use client";

import { useState } from "react";

type Result = {
  success?: boolean;
  dryRun?: boolean;
  totalFields?: number;
  changeCount?: number;
  updatedCount?: number;
  message?: string;
  preview?: Array<{
    id: string;
    name: string;
    oldDisplayName: string | null;
    newDisplayName: string;
  }>;
  updated?: Array<{
    id: string;
    name: string;
    oldDisplayName: string | null;
    newDisplayName: string;
  }>;
  error?: string;
};

export default function FieldsNumberPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function runNumbering(dryRun: boolean) {
    if (!dryRun) {
      const ok = window.confirm(
        "Bestehende Flächen wirklich endgültig nummerieren? Vorher sollte ein Backup der Datenbank gemacht sein."
      );

      if (!ok) return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/fields/number-existing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dryRun,
        }),
      });

      const json = await res.json();

      setResult(json);
    } catch (error: any) {
      setResult({
        error: error?.message || "Fehler beim Nummerieren.",
      });
    } finally {
      setLoading(false);
    }
  }

  const items = result?.preview || result?.updated || [];

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <h1 className="text-2xl font-bold text-gray-900">
            Bestehende Flächen nummerieren
          </h1>

          <p className="mt-2 text-sm text-gray-700">
            Diese Seite vergibt für vorhandene Flächen automatische Anzeigenamen
            wie FL-0001, FL-0002 usw. Alte Anzeigenamen werden in der Notiz
            gesichert.
          </p>

          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Wichtig: Vor dem endgültigen Nummerieren bitte ein Datenbank-Backup
            machen.
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => runNumbering(true)}
              disabled={loading}
              className="rounded-2xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 disabled:opacity-50"
            >
              {loading ? "Bitte warten..." : "Testlauf starten"}
            </button>

            <button
              type="button"
              onClick={() => runNumbering(false)}
              disabled={loading}
              className="rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Endgültig nummerieren
            </button>
          </div>
        </section>

        {result && (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Ergebnis</h2>

            {result.error ? (
              <div className="mt-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
                {result.error}
              </div>
            ) : (
              <>
                <div className="mt-3 rounded-2xl border border-green-300 bg-green-50 p-4 text-sm text-green-900">
                  <div className="font-semibold">
                    {result.message || "Vorgang abgeschlossen."}
                  </div>
                  <div className="mt-1">
                    Gesamt: {result.totalFields ?? "-"} · Änderungen:{" "}
                    {result.changeCount ?? result.updatedCount ?? "-"}
                  </div>
                  <div className="mt-1">
                    Modus: {result.dryRun ? "Testlauf" : "Endgültig gespeichert"}
                  </div>
                </div>

                {items.length > 0 && (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="px-3 py-2">Fläche</th>
                          <th className="px-3 py-2">Alter Anzeigename</th>
                          <th className="px-3 py-2">Neuer Anzeigename</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id} className="border-b">
                            <td className="px-3 py-2">{item.name}</td>
                            <td className="px-3 py-2">
                              {item.oldDisplayName || "-"}
                            </td>
                            <td className="px-3 py-2 font-bold">
                              {item.newDisplayName}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}