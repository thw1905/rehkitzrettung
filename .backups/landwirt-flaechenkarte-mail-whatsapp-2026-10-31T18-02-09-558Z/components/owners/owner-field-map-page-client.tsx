"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const OwnerFieldMapLeaflet = dynamic(
  () => import("@/components/owners/owner-field-map-leaflet"),
  { ssr: false }
);

type AreaFeature =
  | GeoJSON.Feature<GeoJSON.Polygon>
  | GeoJSON.Feature<GeoJSON.MultiPolygon>;

type Owner = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  label: string;
  fieldCount?: number;
};

type FieldItem = {
  id: string;
  name: string;
  displayName?: string | null;
  areaGeoJson: AreaFeature;
  areaSqm: number;
  areaHa: number;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationNote?: string | null;
  notes?: string | null;
};

type OwnerFieldMapResponse = {
  owners: Owner[];
  selectedOwner: Owner | null;
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

  if (displayName && name) return `${displayName} · ${name}`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function getOwnerName(owner?: Owner | null) {
  if (!owner) return "-";

  return (
    owner.label ||
    [owner.firstName || "", owner.lastName || ""].join(" ").trim() ||
    "-"
  );
}

export default function OwnerFieldMapPageClient() {
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [data, setData] = useState<OwnerFieldMapResponse>({
    owners: [],
    selectedOwner: null,
    fields: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadingMap, setLoadingMap] = useState(false);

  const generatedAt = useMemo(() => formatDateTime(new Date()), []);

  async function loadData(ownerId?: string) {
    if (ownerId) {
      setLoadingMap(true);
    } else {
      setLoading(true);
    }

    try {
      const url = ownerId
        ? `/api/owner-field-map?ownerId=${encodeURIComponent(ownerId)}`
        : "/api/owner-field-map";

      const res = await fetch(url, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(
          json?.error || "Besitzer-Flächenkarte konnte nicht geladen werden."
        );
      }

      setData({
        owners: Array.isArray(json.owners) ? json.owners : [],
        selectedOwner: json.selectedOwner || null,
        fields: Array.isArray(json.fields) ? json.fields : [],
      });
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Besitzer-Flächenkarte konnte nicht geladen werden.");
    } finally {
      setLoading(false);
      setLoadingMap(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectOwner(ownerId: string) {
    setSelectedOwnerId(ownerId);

    if (ownerId) {
      loadData(ownerId);
    } else {
      setData((prev) => ({
        ...prev,
        selectedOwner: null,
        fields: [],
      }));
    }
  }

  async function printPage() {
    window.dispatchEvent(new Event("prepare-owner-field-map-print"));
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    window.print();
  }

  const totalAreaHa = data.fields.reduce(
    (sum, field) => sum + (Number.isFinite(field.areaHa) ? field.areaHa : 0),
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
                Landwirt-Flächenkarte
              </h1>
              <p className="mt-2 text-sm text-gray-700">
                Landwirt auswählen, Flächenkarte prüfen und als PDF oder Papierkarte
                drucken.
              </p>
              <p className="mt-2 text-sm font-medium text-gray-900">
                Erstellt am: {generatedAt}
              </p>
            </div>

            <button
              type="button"
              onClick={printPage}
              disabled={!data.selectedOwner || loading || loadingMap}
              className="no-print rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Drucken / als PDF speichern
            </button>
          </div>
        </section>

        <section className="no-print rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:p-5">
          <label className="mb-2 block text-sm font-semibold text-gray-900">
            Landwirt auswählen
          </label>

          {loading ? (
            <div className="text-sm text-gray-700">Landwirt werden geladen...</div>
          ) : data.owners.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Noch keine Landwirt vorhanden.
            </div>
          ) : (
            <select
              value={selectedOwnerId}
              onChange={(event) => handleSelectOwner(event.target.value)}
              className="w-full max-w-xl rounded-xl border border-gray-300 bg-white px-3 py-3"
            >
              <option value="">Bitte Landwirt auswählen</option>
              {data.owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.label}
                  {typeof owner.fieldCount === "number"
                    ? ` · ${owner.fieldCount} Fläche(n)`
                    : ""}
                </option>
              ))}
            </select>
          )}
        </section>

        {!data.selectedOwner && !loading && !loadingMap && (
          <section className="rounded-3xl bg-white p-5 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Bitte zuerst einen Landwirt auswählen. Danach werden Karte und Flächenliste angezeigt.
          </section>
        )}

        {loadingMap && (
          <section className="rounded-3xl bg-white p-5 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Landwirt-Flächenkarte wird geladen...
          </section>
        )}

        {data.selectedOwner && !loadingMap && (
          <>
            <section className="print-card rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {getOwnerName(data.selectedOwner)}
                  </h2>

                  <div className="mt-2 text-sm text-gray-700">
                    {[data.selectedOwner.street, data.selectedOwner.zip, data.selectedOwner.city]
                      .filter(Boolean)
                      .join(", ") || "Keine Adresse hinterlegt"}
                  </div>

                  <div className="mt-2 text-sm text-gray-700">
                    Telefon: {data.selectedOwner.phone || "-"} · E-Mail: {data.selectedOwner.email || "-"}
                  </div>

                  <div className="mt-2 text-sm text-gray-700">
                    Flächen: {data.fields.length} · Gesamtfläche: {formatHa(totalAreaHa)} ha
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
                  <div className="font-bold">Legende</div>
                  <div className="mt-1">Orange: angelegte Fläche</div>
                  <div>Große Beschriftung: FL-Nummer</div>
                  <div>Grün: Treffpunkt</div>
                </div>
              </div>
            </section>

            <section className="print-card rounded-3xl bg-white p-3 shadow-sm ring-1 ring-gray-100 md:p-4">
              {data.fields.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  Für diesen Landwirt sind keine Flächen vorhanden.
                </div>
              ) : (
                <OwnerFieldMapLeaflet fields={data.fields} />
              )}
            </section>

            <section className="print-card rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:p-5">
              <h2 className="text-lg font-bold text-gray-900">
                Flächen des Landwirts
              </h2>

              {data.fields.length === 0 ? (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                  Keine Flächen vorhanden.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto print:overflow-visible">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="px-3 py-2">FL-Nummer</th>
                        <th className="px-3 py-2">Flächenname</th>
                        <th className="px-3 py-2 text-right">Größe</th>
                        <th className="px-3 py-2">Treffpunkt</th>
                        <th className="px-3 py-2">Notiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fields.map((field) => (
                        <tr key={field.id} className="border-b">
                          <td className="px-3 py-2 font-bold text-gray-900">
                            {field.displayName || "-"}
                          </td>
                          <td className="px-3 py-2">{field.name || "-"}</td>
                          <td className="px-3 py-2 text-right">
                            {formatHa(field.areaHa)} ha
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