"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const RevierMapLeaflet = dynamic(
  () => import("@/components/reviere/revier-map-leaflet"),
  { ssr: false }
);

type Pachter = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
};

type Revier = {
  id: string;
  externalId?: string | null;
  name: string;
  nummer?: string | null;
  label: string;
  areaGeoJson: GeoJSON.Feature<GeoJSON.Polygon>;
  paechter?: {
    id: string;
    pachter: Pachter;
  }[];
};

type FieldItem = {
  id: string;
  name: string;
  displayName?: string | null;
  areaGeoJson: GeoJSON.Feature<GeoJSON.Polygon>;
  areaSqm: number;
  areaHa: number;
  overlapSqm: number;
  overlapHa: number;
  overlapPercent: number;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationNote?: string | null;
  notes?: string | null;
  owner?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
};

type RevierMapResponse = {
  reviere: Revier[];
  selectedRevier: Revier | null;
  fields: FieldItem[];
};

function formatDateTime(date: Date) {
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

  if (displayName && name) return `${displayName} (${name})`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function getOwnerName(field: FieldItem) {
  if (!field.owner) return "-";

  return (
    [field.owner.firstName || "", field.owner.lastName || ""].join(" ").trim() ||
    "-"
  );
}

function getPachterName(pachter?: Pachter | null) {
  if (!pachter) return "-";

  return (
    [pachter.firstName || "", pachter.lastName || ""].join(" ").trim() || "-"
  );
}

export default function RevierMapPageClient() {
  const [selectedRevierId, setSelectedRevierId] = useState("");
  const [data, setData] = useState<RevierMapResponse>({
    reviere: [],
    selectedRevier: null,
    fields: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadingMap, setLoadingMap] = useState(false);

  const generatedAt = useMemo(() => formatDateTime(new Date()), []);

  async function loadData(revierId?: string) {
    if (revierId) {
      setLoadingMap(true);
    } else {
      setLoading(true);
    }

    try {
      const url = revierId
        ? `/api/revier-map?revierId=${encodeURIComponent(revierId)}`
        : "/api/revier-map";

      const res = await fetch(url, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Revierkarte konnte nicht geladen werden.");
      }

      setData(json);

      if (!revierId && Array.isArray(json.reviere) && json.reviere.length > 0) {
        const firstId = json.reviere[0].id;
        setSelectedRevierId(firstId);
        await loadData(firstId);
      }
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Revierkarte konnte nicht geladen werden.");
    } finally {
      setLoading(false);
      setLoadingMap(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectRevier(revierId: string) {
    setSelectedRevierId(revierId);

    if (revierId) {
      loadData(revierId);
    } else {
      setData((prev) => ({
        ...prev,
        selectedRevier: null,
        fields: [],
      }));
    }
  }

  function printPage() {
    window.print();
  }

  const totalFieldAreaHa = data.fields.reduce(
    (sum, field) => sum + (Number.isFinite(field.areaHa) ? field.areaHa : 0),
    0
  );

  const totalOverlapHa = data.fields.reduce(
    (sum, field) => sum + (Number.isFinite(field.overlapHa) ? field.overlapHa : 0),
    0
  );

  return (
    <main className="min-h-screen bg-gray-50 p-3 md:p-6 print:bg-white print:p-0">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          html,
          body {
            background: white !important;
            font-size: 12px !important;
          }

          .no-print {
            display: none !important;
          }

          .print-page {
            max-width: none !important;
            width: 100% !important;
            margin: 0 !important;
          }

          .print-card {
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
            break-inside: avoid;
          }

          table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 11px !important;
          }

          th,
          td {
            border: 1px solid #d1d5db !important;
            padding: 5px !important;
            vertical-align: top !important;
          }

          th {
            background: #f3f4f6 !important;
          }

          .leaflet-control-container {
            display: none !important;
          }
        }
      `}</style>

      <div className="print-page mx-auto max-w-7xl space-y-4">
        <section className="print-card rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Revierkarte
              </h1>
              <p className="mt-2 text-sm text-gray-700">
                Revier auswählen, Karte prüfen und als PDF oder Papierkarte
                drucken.
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900">
                Erstellt am: {generatedAt}
              </p>
            </div>

            <button
              type="button"
              onClick={printPage}
              disabled={!data.selectedRevier || loading || loadingMap}
              className="no-print rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Drucken / als PDF speichern
            </button>
          </div>
        </section>

        <section className="no-print rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:p-5">
          <label className="mb-2 block text-sm font-semibold text-gray-900">
            Revier auswählen
          </label>

          {loading ? (
            <div className="text-sm text-gray-700">Reviere werden geladen...</div>
          ) : data.reviere.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Noch keine Reviere vorhanden.
            </div>
          ) : (
            <select
              value={selectedRevierId}
              onChange={(event) => handleSelectRevier(event.target.value)}
              className="w-full max-w-xl rounded-xl border border-gray-300 bg-white px-3 py-3"
            >
              {data.reviere.map((revier) => (
                <option key={revier.id} value={revier.id}>
                  {revier.label}
                </option>
              ))}
            </select>
          )}
        </section>

        {loadingMap && (
          <section className="rounded-3xl bg-white p-5 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Revierkarte wird geladen...
          </section>
        )}

        {data.selectedRevier && !loadingMap && (
          <>
            <section className="print-card rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {data.selectedRevier.label}
                  </h2>

                  <div className="mt-2 text-sm text-gray-700">
                    Flächen im Revier: {data.fields.length} · Fläche gesamt: {" "}
                    {formatHa(totalFieldAreaHa)} ha · Anteil im Revier: {" "}
                    {formatHa(totalOverlapHa)} ha
                  </div>

                  <div className="mt-2 text-sm text-gray-700">
                    Pächter: {" "}
                    {data.selectedRevier.paechter &&
                    data.selectedRevier.paechter.length > 0
                      ? data.selectedRevier.paechter
                          .map((item) => getPachterName(item.pachter))
                          .join(", ")
                      : "-"}
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
                  <div className="font-bold">Legende</div>
                  <div className="mt-1">Blau: Reviergrenze</div>
                  <div>Orange: angelegte Flächen</div>
                  <div>Grün: Treffpunkt</div>
                </div>
              </div>
            </section>

            <section className="print-card rounded-3xl bg-white p-3 shadow-sm ring-1 ring-gray-100 md:p-4">
              <RevierMapLeaflet
                revier={data.selectedRevier}
                fields={data.fields}
              />
            </section>

            <section className="print-card rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:p-5">
              <h2 className="text-lg font-bold text-gray-900">
                Flächen im Revier
              </h2>

              {data.fields.length === 0 ? (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  Keine angelegten Flächen schneiden dieses Revier.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto print:overflow-visible">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="px-3 py-2">Fläche</th>
                        <th className="px-3 py-2">Besitzer</th>
                        <th className="px-3 py-2 text-right">Gesamtfläche</th>
                        <th className="px-3 py-2 text-right">Im Revier</th>
                        <th className="px-3 py-2 text-right">Anteil</th>
                        <th className="px-3 py-2">Treffpunkt</th>
                        <th className="px-3 py-2">Notiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fields.map((field) => (
                        <tr key={field.id} className="border-b">
                          <td className="px-3 py-2 font-semibold text-gray-900">
                            {getFieldLabel(field)}
                          </td>
                          <td className="px-3 py-2">{getOwnerName(field)}</td>
                          <td className="px-3 py-2 text-right">
                            {formatHa(field.areaHa)} ha
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatHa(field.overlapHa)} ha
                          </td>
                          <td className="px-3 py-2 text-right">
                            {field.overlapPercent.toFixed(1)} %
                          </td>
                          <td className="px-3 py-2">
                            {typeof field.locationLatitude === "number" &&
                            typeof field.locationLongitude === "number"
                              ? field.locationNote || "gesetzt"
                              : "fehlt"}
                          </td>
                          <td className="px-3 py-2">{field.notes || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}