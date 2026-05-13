"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

const FieldOrderMapLeaflet = dynamic(
  () => import("@/components/orders/field-order-map-leaflet"),
  { ssr: false }
);

type RevierItem = {
  id: string;
  name: string;
  nummer?: string | null;
  areaGeoJson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  pachter?: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    email?: string | null;
  } | null;
};

type Owner = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
};

type FieldItem = {
  id: string;
  name: string;
  displayName?: string | null;
  areaGeoJson: GeoJSON.Feature<GeoJSON.Polygon>;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationNote?: string | null;
};

function getTodayDateInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getFieldLabel(field: FieldItem) {
  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} (${name})`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function getOwnerLabel(owner: Owner) {
  return `${owner.firstName} ${owner.lastName}`.trim();
}

export default function FieldOrderMapClient() {
  const [fields, setFields] = useState<FieldItem[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [mowingDate, setMowingDate] = useState(getTodayDateInputValue());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviere, setReviere] = useState<RevierItem[]>([]);
  const [creating, setCreating] = useState(false);
  const selectedFields = useMemo(() => {
    const selected = new Set(selectedFieldIds);
    return fields.filter((field) => selected.has(field.id));
  }, [fields, selectedFieldIds]);

  function toggleField(fieldId: string) {
    setSelectedFieldIds((prev) => {
      if (prev.includes(fieldId)) {
        return prev.filter((id) => id !== fieldId);
      }

      return [...prev, fieldId];
    });
  }

  function clearSelection() {
    setSelectedFieldIds([]);
  }

  async function loadData() {
    setLoading(true);

    try {
      const [fieldsRes, ownersRes, reviereRes] = await Promise.all([
  fetch("/api/fields", { cache: "no-store" }),
  fetch("/api/owners", { cache: "no-store" }),
  fetch("/api/reviere", { cache: "no-store" }),
]);

      const fieldsData = await fieldsRes.json();
      const ownersData = await ownersRes.json();
      const reviereData = await reviereRes.json();

      if (!fieldsRes.ok) {
        throw new Error(fieldsData?.error || "Flächen konnten nicht geladen werden.");
      }

      if (!ownersRes.ok) {
        throw new Error(ownersData?.error || "Ansprechpartner konnten nicht geladen werden.");
      }

      if (!reviereRes.ok) {
  throw new Error(reviereData?.error || "Reviere konnten nicht geladen werden.");
}

      setFields(Array.isArray(fieldsData) ? fieldsData : []);
      setOwners(Array.isArray(ownersData) ? ownersData : []);
      setReviere(Array.isArray(reviereData) ? reviereData : []);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function createOrders() {
    if (selectedFieldIds.length === 0) {
      alert("Bitte mindestens eine Fläche auswählen.");
      return;
    }

    if (!ownerId) {
      alert("Bitte einen Ansprechpartner auswählen.");
      return;
    }

    if (!mowingDate) {
      alert("Bitte ein Mähdatum auswählen.");
      return;
    }

    const confirmed = window.confirm(
      `Möchtest du ${selectedFieldIds.length} Auftrag/Aufträge für den ${mowingDate} erstellen?`
    );

    if (!confirmed) return;

    setCreating(true);
    try {
      const res = await fetch("/api/orders/bulk-create-from-fields", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fieldIds: selectedFieldIds,
          ownerId,
          mowingDate,
          notes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Aufträge konnten nicht erstellt werden.");
      }

      alert(data?.message || "Aufträge wurden erstellt.");
      clearSelection();
      setNotes("");
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Aufträge konnten nicht erstellt werden.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-3 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Aufträge per Karte erstellen
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Wähle mehrere Flächen auf der Karte aus und erstelle daraus automatisch Aufträge.
            Der Ansprechpartner wird nur für die neuen Aufträge gespeichert.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-3xl bg-white p-3 shadow-sm ring-1 ring-gray-100 md:p-4">
            {loading ? (
              <div className="p-6 text-sm text-gray-600">
                Karte wird geladen...
              </div>
            ) : fields.length === 0 ? (
              <div className="p-6 text-sm text-gray-600">
                Keine Flächen vorhanden.
              </div>
            ) : (
              <div className="h-[65vh] overflow-hidden rounded-2xl">
                <FieldOrderMapLeaflet
                  fields={fields}
                  reviere={reviere}
                  selectedFieldIds={selectedFieldIds}
                  onToggleField={toggleField}
                />
              </div>
            )}
          </div>
          <aside className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-lg font-bold text-gray-900">
              Auftragserstellung
            </h2>

            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">
              Ausgewählte Flächen: {selectedFieldIds.length}
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Ansprechpartner
                </label>

                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                >
                  <option value="">Bitte auswählen</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {getOwnerLabel(owner)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Mähdatum
                </label>

                <input
                  type="date"
                  value={mowingDate}
                  onChange={(e) => setMowingDate(e.target.value)}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-900">
                  Notiz optional
                </label>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                  placeholder="Hinweise für alle ausgewählten Aufträge"
                />
              </div>

              <button
                type="button"
                onClick={createOrders}
                disabled={creating || selectedFieldIds.length === 0}
                className="w-full rounded-2xl bg-black px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {creating
                  ? "Erstelle..."
                  : `${selectedFieldIds.length} Auftrag/Aufträge erstellen`}
              </button>

              <button
                type="button"
                onClick={clearSelection}
                disabled={selectedFieldIds.length === 0}
                className="w-full rounded-2xl border border-gray-300 px-5 py-3 font-semibold text-gray-900 disabled:opacity-50"
              >
                Auswahl zurücksetzen
              </button>
            </div>
            {selectedFields.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-bold text-gray-900">
                  Ausgewählte Flächen
                </h3>

                <div className="mt-2 max-h-64 space-y-2 overflow-auto pr-1">
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
          </aside>
        </section>
      </div>
    </main>
  );
}