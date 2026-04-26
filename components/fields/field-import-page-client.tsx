"use client";

import { useState } from "react";

type ImportResult = {
  success?: boolean;
  importedCount?: number;
  skippedCount?: number;
  duplicateCount?: number;
  fileCount?: number;
  files?: Array<{
    fileName: string;
    importedCount: number;
    skippedCount: number;
    duplicateCount: number;
    meetingPointImported: boolean;
    error?: string;
  }>;
  message?: string;
  error?: string;
};

export default function FieldImportPageClient() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleUpload() {
    if (files.length === 0) {
      alert("Bitte zuerst mindestens eine KML- oder KMZ-Datei auswählen.");
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();

      for (const file of files) {
        formData.append("files", file);
      }

      const res = await fetch("/api/fields/import-kml", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Import fehlgeschlagen.");
      }

      setResult(data);
      setFiles([]);
    } catch (error: any) {
      console.error("Fehler beim KML/KMZ-Import:", error);
      setResult({
        error: error?.message || "Import fehlgeschlagen.",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-2xl border-2 border-slate-900 bg-slate-900 p-6 shadow">
          <h1 className="text-2xl font-bold text-white">
            KML / KMZ Felder importieren
          </h1>
          <p className="mt-2 text-sm text-slate-100">
            Polygone aus KML- oder KMZ-Dateien werden als neue Felder angelegt.
            Bei DJI-KMZ wird der Takeoff Point automatisch als Treffpunkt übernommen.
          </p>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow space-y-4">
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">Hinweis</div>
            <p className="mt-1">
              Du kannst mehrere KML- oder KMZ-Dateien gleichzeitig auswählen.
              Dubletten werden automatisch übersprungen.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-900">
              Dateien auswählen
            </label>
            <input
              type="file"
              accept=".kml,.kmz"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="block w-full rounded-xl border bg-white px-3 py-3 text-sm"
            />
          </div>

          {files.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">
                Ausgewählt: {files.length} Datei(en)
              </div>

              <div className="mt-3 max-h-56 space-y-2 overflow-auto">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    {file.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || files.length === 0}
              className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {uploading ? "Import läuft..." : "Dateien importieren"}
            </button>
          </div>
        </section>

        {result && (
          <section className="rounded-2xl bg-white p-6 shadow space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Import-Ergebnis
            </h2>

            {result.error ? (
              <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                {result.error}
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800">
                  {result.message || "Import abgeschlossen."}
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Dateien
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                      {result.fileCount || 0}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Importiert
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                      {result.importedCount || 0}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Übersprungen
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                      {result.skippedCount || 0}
                    </div>
                  </div>

                  <div className="rounded-xl border bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Dubletten
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                      {result.duplicateCount || 0}
                    </div>
                  </div>
                </div>

                {result.files && result.files.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-gray-900">
                      Details pro Datei
                    </div>

                    {result.files.map((item, index) => (
                      <div
                        key={`${item.fileName}-${index}`}
                        className="rounded-xl border p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-gray-900">
                            {item.fileName}
                          </div>

                          {item.meetingPointImported ? (
                            <span className="rounded-full border border-green-300 bg-green-100 px-3 py-1 text-xs font-semibold text-green-900">
                              Treffpunkt übernommen
                            </span>
                          ) : (
                            <span className="rounded-full border border-orange-300 bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-900">
                              Kein DJI-Treffpunkt gefunden
                            </span>
                          )}
                        </div>

                        {item.error ? (
                          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {item.error}
                          </div>
                        ) : (
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
                              Importiert: <b>{item.importedCount}</b>
                            </div>
                            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
                              Übersprungen: <b>{item.skippedCount}</b>
                            </div>
                            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
                              Dubletten: <b>{item.duplicateCount}</b>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
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