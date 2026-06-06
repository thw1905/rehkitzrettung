"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

type AreaFeature =
  | GeoJSON.Feature<GeoJSON.Polygon>
  | GeoJSON.Feature<GeoJSON.MultiPolygon>;

type Owner = {
  id: string;
  firstName: string;
  lastName: string;
  street: string;
  zip: string;
  city: string;
  phone: string;
  email?: string | null;
  label: string;
};

type FieldItem = {
  id: string;
  name: string;
  displayName?: string | null;
  notes?: string | null;
  areaGeoJson: AreaFeature;
  areaSqm: number;
  areaHa: number;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationNote?: string | null;
};

type LandwirtFieldMapProps = {
  fields: FieldItem[];
  selectedFieldIds: string[];
  onToggleField: (fieldId: string) => void;
};

const LandwirtFieldMap = dynamic<LandwirtFieldMapProps>(
  () => import("./landwirt-field-map"),
  { ssr: false }
);

type LandwirtData = {
  owner: Owner | null;
  fields: FieldItem[];
};

type SubmitResult = {
  success?: boolean;
  message?: string;
  error?: string;
  request?: {
    id: string;
    fields: Array<{
      id: string;
      displayName?: string | null;
      name: string;
    }>;
  };
};

function getTodayDateInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatHa(value: number) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function getFieldLabel(field: Pick<FieldItem, "displayName" | "name">) {
  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} · ${name}`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

export default function LandwirtRequestPageClient({ token }: { token: string }) {
  const [data, setData] = useState<LandwirtData>({ owner: null, fields: [] });
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [mowingDate, setMowingDate] = useState(getTodayDateInputValue());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const selectedFields = useMemo(() => {
    const selected = new Set(selectedFieldIds);
    return data.fields.filter((field) => selected.has(field.id));
  }, [data.fields, selectedFieldIds]);

  const filteredFields = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return data.fields;

    return data.fields.filter((field) =>
      [
        field.displayName || "",
        field.name || "",
        field.notes || "",
        field.locationNote || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [data.fields, search]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/landwirt/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Landwirt-Seite konnte nicht geladen werden.");
      }

      setData({
        owner: json.owner || null,
        fields: Array.isArray(json.fields) ? json.fields : [],
      });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Landwirt-Seite konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function toggleField(fieldId: string) {
    setSelectedFieldIds((prev) => {
      if (prev.includes(fieldId)) {
        return prev.filter((id) => id !== fieldId);
      }

      return [...prev, fieldId];
    });
  }

  function selectAllFiltered() {
    setSelectedFieldIds((prev) => {
      const next = new Set(prev);
      for (const field of filteredFields) {
        next.add(field.id);
      }
      return Array.from(next);
    });
  }

  function clearSelection() {
    setSelectedFieldIds([]);
  }

  async function submitRequest() {
    setResult(null);

    if (selectedFieldIds.length === 0) {
      setResult({ error: "Bitte mindestens eine Fläche auswählen." });
      return;
    }

    if (!mowingDate) {
      setResult({ error: "Bitte ein Mähdatum auswählen." });
      return;
    }

    const confirmed = window.confirm(
      `Möchtest Du ${selectedFieldIds.length} Fläche(n) für den ${mowingDate} melden?`
    );

    if (!confirmed) return;

    setSubmitting(true);

    try {
      const res = await fetch(`/api/landwirt/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fieldIds: selectedFieldIds,
          mowingDate,
          note,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Anfrage konnte nicht gesendet werden.");
      }

      setResult(json);
      setSelectedFieldIds([]);
      setNote("");
    } catch (err: any) {
      console.error(err);
      setResult({ error: err?.message || "Anfrage konnte nicht gesendet werden." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          Landwirt-Seite wird geladen...
        </div>
      </main>
    );
  }

  if (error || !data.owner) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm">
          <h1 className="text-xl font-bold">Link nicht verfügbar</h1>
          <p className="mt-2 text-sm">{error || "Dieser Link ist ungültig oder nicht mehr aktiv."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-3 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Mähflächen melden
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            Hallo {data.owner.label}, bitte wähle die Flächen aus, die gemäht
            und vorher abgesucht werden sollen.
          </p>
          <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Wichtig: Die Anfrage erzeugt noch keinen festen Einsatztermin. Das
            Rehkitzrettungs-Team prüft die Meldung und plant danach den Einsatz.
          </div>
        </section>

        {data.fields.length === 0 ? (
          <section className="rounded-3xl bg-white p-5 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Für diesen Besitzer sind noch keine Flächen hinterlegt.
          </section>
        ) : (
          <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-gray-100 md:p-4">
                <div className="h-[58vh] min-h-[420px] overflow-hidden rounded-2xl">
                  <LandwirtFieldMap
                    fields={data.fields}
                    selectedFieldIds={selectedFieldIds}
                    onToggleField={toggleField}
                  />
                </div>
              </div>

              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div className="flex-1">
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      Fläche suchen
                    </label>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="FL-Nummer oder Flächenname..."
                      className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllFiltered}
                      className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900"
                    >
                      Sichtbare auswählen
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900"
                    >
                      Auswahl löschen
                    </button>
                  </div>
                </div>

                <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
                  {filteredFields.map((field) => {
                    const checked = selectedFieldIds.includes(field.id);

                    return (
                      <label
                        key={field.id}
                        className={`flex cursor-pointer gap-3 rounded-2xl border p-3 text-sm transition ${
                          checked
                            ? "border-green-400 bg-green-50"
                            : "border-gray-200 bg-white hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleField(field.id)}
                          className="mt-1 h-5 w-5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-gray-900">
                            {getFieldLabel(field)}
                          </div>
                          <div className="mt-1 text-gray-700">
                            {formatHa(field.areaHa)} ha
                            {field.locationNote ? ` · ${field.locationNote}` : ""}
                          </div>
                          {field.notes ? (
                            <div className="mt-1 text-gray-500">{field.notes}</div>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <aside className="h-fit rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                Anfrage senden
              </h2>

              <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-900">
                Ausgewählte Flächen: {selectedFieldIds.length}
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-900">
                    Mähdatum
                  </label>
                  <input
                    type="date"
                    value={mowingDate}
                    onChange={(event) => setMowingDate(event.target.value)}
                    className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-900">
                    Hinweis optional
                  </label>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={4}
                    placeholder="z. B. Zufahrt, Reihenfolge, Kontakt vor Ort..."
                    className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                  />
                </div>

                <button
                  type="button"
                  onClick={submitRequest}
                  disabled={submitting || selectedFieldIds.length === 0}
                  className="w-full rounded-2xl bg-black px-5 py-3 font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? "Wird gesendet..." : "Mähanfrage senden"}
                </button>
              </div>

              {selectedFields.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-bold text-gray-900">
                    Ausgewählte Flächen
                  </h3>
                  <div className="mt-2 max-h-48 space-y-2 overflow-auto pr-1">
                    {selectedFields.map((field) => (
                      <div
                        key={field.id}
                        className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
                      >
                        {getFieldLabel(field)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result && (
                <div
                  className={`mt-5 rounded-2xl border p-4 text-sm ${
                    result.error
                      ? "border-red-300 bg-red-50 text-red-900"
                      : "border-green-300 bg-green-50 text-green-900"
                  }`}
                >
                  <div className="font-bold">
                    {result.error || result.message || "Anfrage gesendet."}
                  </div>
                  {result.request?.fields?.length ? (
                    <div className="mt-2">
                      Gemeldete Flächen: {result.request.fields.length}
                    </div>
                  ) : null}
                </div>
              )}
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}