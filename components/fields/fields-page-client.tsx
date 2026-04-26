"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import area from "@turf/area";

const FieldEditor = dynamic(
  () => import("@/components/map/field-editor"),
  { ssr: false }
);

type Team = {
  id: string;
  name: string;
};

type FieldOrder = {
  id: string;
  teamId?: string | null;
  team: Team | null;
  status?: "OFFEN" | "IN_ARBEIT" | "ERLEDIGT";
};

type FieldItem = {
  id: string;
  name: string;
  displayName: string;
  ownerId?: string | null;
  areaGeoJson: GeoJSON.Feature<GeoJSON.Polygon>;
  notes?: string | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationNote?: string | null;
  orders: FieldOrder[];
};

type PolygonFeature = GeoJSON.Feature<GeoJSON.Polygon> | null;

type FieldEditorValue = {
  polygon: PolygonFeature;
  location: { lat: number; lng: number } | null;
};

type MeetingPointFilter = "ALLE" | "MIT_TREFFPUNKT" | "OHNE_TREFFPUNKT";

function formatArea(squareMeters: number) {
  if (!Number.isFinite(squareMeters) || squareMeters <= 0) {
    return {
      sqm: "0 m²",
      ha: "0,00 ha",
    };
  }

  return {
    sqm: `${new Intl.NumberFormat("de-DE", {
      maximumFractionDigits: 0,
    }).format(squareMeters)} m²`,
    ha: `${new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(squareMeters / 10000)} ha`,
  };
}

function getFieldLabel(field: Pick<FieldItem, "displayName" | "name">) {
  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} (${name})`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function hasMeetingPoint(field: {
  locationLatitude?: number | null;
  locationLongitude?: number | null;
}) {
  return (
    typeof field.locationLatitude === "number" &&
    typeof field.locationLongitude === "number"
  );
}

function getMeetingPointBadgeClasses(field: {
  locationLatitude?: number | null;
  locationLongitude?: number | null;
}) {
  if (hasMeetingPoint(field)) {
    return "border-green-300 bg-green-100 text-green-900";
  }

  return "border-orange-300 bg-orange-100 text-orange-900";
}

function getMeetingPointBadgeText(field: {
  locationLatitude?: number | null;
  locationLongitude?: number | null;
}) {
  return hasMeetingPoint(field) ? "Treffpunkt gesetzt" : "Treffpunkt fehlt";
}

export default function FieldsPageClient({ isAdmin }: { isAdmin: boolean }) {
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  const [geoJson, setGeoJson] = useState<PolygonFeature>(null);
  const [fieldLocation, setFieldLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locationNote, setLocationNote] = useState("");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [notes, setNotes] = useState("");

  const [fields, setFields] = useState<FieldItem[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [openFieldId, setOpenFieldId] = useState<string | null>(null);
  const [meetingPointFilter, setMeetingPointFilter] =
    useState<MeetingPointFilter>("ALLE");



  async function loadFields() {
    setLoadingFields(true);
    try {
      const res = await fetch("/api/fields");
      const data = await res.json();
      setFields(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Flächen konnten nicht geladen werden:", error);
      alert("Flächen konnten nicht geladen werden.");
    } finally {
      setLoadingFields(false);
    }
  }

  useEffect(() => {
    loadFields();
  }, []);

  const areaInSquareMeters = useMemo(() => {
    if (!geoJson) return 0;

    try {
      return area(geoJson);
    } catch (error) {
      console.error("Fläche konnte nicht berechnet werden:", error);
      return 0;
    }
  }, [geoJson]);

  const formattedArea = formatArea(areaInSquareMeters);

  const fieldsWithoutMeetingPointCount = useMemo(
    () => fields.filter((field) => !hasMeetingPoint(field)).length,
    [fields]
  );

  const fieldsWithMeetingPointCount = useMemo(
    () => fields.filter((field) => hasMeetingPoint(field)).length,
    [fields]
  );

  const filteredFields = useMemo(() => {
    const term = search.trim().toLowerCase();

    let result = [...fields];

    result.sort((a, b) => {
      const aHasMeetingPoint = hasMeetingPoint(a) ? 1 : 0;
      const bHasMeetingPoint = hasMeetingPoint(b) ? 1 : 0;

      if (aHasMeetingPoint !== bHasMeetingPoint) {
        return aHasMeetingPoint - bHasMeetingPoint;
      }

      return getFieldLabel(a).localeCompare(getFieldLabel(b), "de");
    });

    if (meetingPointFilter === "MIT_TREFFPUNKT") {
      result = result.filter((field) => hasMeetingPoint(field));
    }

    if (meetingPointFilter === "OHNE_TREFFPUNKT") {
      result = result.filter((field) => !hasMeetingPoint(field));
    }

    if (!term) return result;

    return result.filter((field) =>
      [
        field.name,
        field.displayName,
        field.notes || "",
        field.locationNote || "",
        field.orders.map((o) => o.team?.name || "").join(" "),
        hasMeetingPoint(field) ? "treffpunkt gesetzt" : "treffpunkt fehlt",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [fields, search, meetingPointFilter]);

  function handleFieldEditorChange(value: FieldEditorValue) {
    setGeoJson(value.polygon);
    setFieldLocation(value.location);
  }

  function resetForm() {
    setEditingFieldId(null);
    setGeoJson(null);
    setFieldLocation(null);
    setLocationNote("");
    setName("");
    setDisplayName("");
    setNotes("");
  }

  function startEditField(field: FieldItem) {
    setEditingFieldId(field.id);
    setGeoJson(field.areaGeoJson || null);
    setFieldLocation(
      typeof field.locationLatitude === "number" &&
        typeof field.locationLongitude === "number"
        ? {
            lat: field.locationLatitude,
            lng: field.locationLongitude,
          }
        : null
    );
    setLocationNote(field.locationNote || "");
    setName(field.name || "");
    setDisplayName(field.displayName || "");
    setNotes(field.notes || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteField(field: FieldItem) {
  const confirmed = window.confirm(
    `Möchtest du die Fläche "${getFieldLabel(field)}" wirklich löschen?`
  );

  if (!confirmed) return;

  try {
    const res = await fetch(`/api/fields/${field.id}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "Fläche konnte nicht gelöscht werden.");
    }

    if (editingFieldId === field.id) {
      resetForm();
    }

    if (openFieldId === field.id) {
      setOpenFieldId(null);
    }

    await loadFields();
    alert("Fläche gelöscht.");
  } catch (error: any) {
    console.error("Fehler beim Löschen der Fläche:", error);
    alert(error?.message || "Fläche konnte nicht gelöscht werden.");
  }
}

  async function saveField() {
    if (!displayName.trim()) {
      alert("Bitte einen Anzeigenamen für die Fläche eingeben.");
      return;
    }

    if (!name.trim()) {
      alert("Bitte einen Flächennamen eingeben.");
      return;
    }

    if (!geoJson) {
      alert("Bitte eine Fläche zeichnen.");
      return;
    }

    if (!fieldLocation) {
      alert("Bitte einen Treffpunkt auf der Karte setzen.");
      return;
    }

    setSaving(true);

    try {
      const url = editingFieldId ? `/api/fields/${editingFieldId}` : "/api/fields";
      const method = editingFieldId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          displayName,
          notes,
          areaGeoJson: geoJson,
          locationLatitude: fieldLocation.lat,
          locationLongitude: fieldLocation.lng,
          locationNote,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Fehler beim Speichern");
      }

      alert(editingFieldId ? "Fläche aktualisiert" : "Fläche gespeichert");
      resetForm();
      await loadFields();
    } catch (error) {
      console.error("Fehler beim Speichern:", error);
      alert("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="mt-1 text-sm text-gray-700">
          <h1 className="text-2xl font-bold">Flächen</h1>
          <p className="mt-1 text-sm text-gray-600">
            {isAdmin
              ? "Flächen anlegen, zeichnen und verwalten."
              : "Hier siehst du die Flächen deiner Teams."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:max-w-md">
          <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-orange-700">
              Treffpunkt fehlt
            </div>
            <div className="mt-1 text-xl font-bold text-orange-900">
              {fieldsWithoutMeetingPointCount}
            </div>
          </div>

          <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
              Treffpunkt gesetzt
            </div>
            <div className="mt-1 text-xl font-bold text-green-900">
              {fieldsWithMeetingPointCount}
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <div className="mt-1 text-sm text-gray-700">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {editingFieldId ? "Fläche bearbeiten" : "1. Stammdaten"}
                    </h2>
                    <p className="text-sm text-gray-600">
                      {editingFieldId
                        ? "Bearbeite die bestehende Fläche."
                        : "Vergib zuerst einen Anzeigenamen und den internen Flächennamen."}
                    </p>
                  </div>

                  {editingFieldId && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="rounded-xl border px-3 py-2 text-sm"
                    >
                      Neue Fläche
                    </button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mt-1 text-sm text-gray-700">
                      Anzeigename
                    </label>
                    <input
                      placeholder="z. B. Meyer Nord"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="mt-1 text-sm text-gray-700">
                      Flächenname
                    </label>
                    <input
                      placeholder="z. B. Schlag 12"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mt-1 text-sm text-gray-700">Notiz</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-[90px] w-full rounded-xl border px-3 py-2"
                      placeholder="Optionale Hinweise zur Fläche"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-1 text-sm text-gray-700">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">2. Fläche zeichnen</h2>
                  <p className="text-sm text-gray-600">
                    Zeichne die Fläche auf der Karte. Danach kannst du die
                    Eckpunkte weiter anpassen.
                  </p>
                </div>

                <FieldEditor
                  value={{
                    polygon: geoJson,
                    location: fieldLocation,
                  }}
                  onChange={handleFieldEditorChange}
                />
              </div>

              <div className="mt-1 text-sm text-gray-700">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">3. Treffpunkt setzen</h2>
                  <p className="text-sm text-gray-600">
                    Klicke auf der Karte auf den Treffpunkt oder Startpunkt für
                    das Team. Der Marker kann danach verschoben werden.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      Treffpunkt Koordinaten
                    </div>
                    <div className="mt-1 text-sm text-gray-900">
                      {fieldLocation
                        ? `${fieldLocation.lat.toFixed(6)}, ${fieldLocation.lng.toFixed(6)}`
                        : "Noch kein Treffpunkt gesetzt"}
                    </div>
                  </div>

                  <div>
                    <label className="mt-1 text-sm text-gray-700">
                      Treffpunkt-Notiz
                    </label>
                    <input
                      value={locationNote}
                      onChange={(e) => setLocationNote(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2"
                      placeholder="z. B. Einfahrt am Feldweg / Parkplatz am Tor"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="mt-1 text-sm text-gray-700">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold">4. Vorschau</h2>
                  <p className="text-sm text-gray-600">
                    Kontrolliere hier die wichtigsten Angaben vor dem Speichern.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      Anzeige
                    </div>
                    <div className="mt-1 text-base font-medium text-gray-900">
                      {displayName || "-"}
                      {name ? ` (${name})` : ""}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500">
                        Quadratmeter
                      </div>
                      <div className="mt-1 text-xl font-bold text-gray-900">
                        {formattedArea.sqm}
                      </div>
                    </div>

                    <div className="rounded-xl border p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500">
                        Hektar
                      </div>
                      <div className="mt-1 text-xl font-bold text-gray-900">
                        {formattedArea.ha}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      Treffpunkt
                    </div>
                    <div className="mt-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getMeetingPointBadgeClasses(
                          {
                            locationLatitude: fieldLocation?.lat ?? null,
                            locationLongitude: fieldLocation?.lng ?? null,
                          }
                        )}`}
                      >
                        {getMeetingPointBadgeText({
                          locationLatitude: fieldLocation?.lat ?? null,
                          locationLongitude: fieldLocation?.lng ?? null,
                        })}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-gray-700">
                      {fieldLocation
                        ? `${fieldLocation.lat.toFixed(6)}, ${fieldLocation.lng.toFixed(6)}`
                        : "-"}
                    </div>
                    <div className="mt-2 text-sm text-gray-700">
                      {locationNote || "-"}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      Notiz
                    </div>
                    <div className="mt-1 text-sm text-gray-700">
                      {notes || "-"}
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t pt-4">
                  <button
                    onClick={saveField}
                    className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
                    disabled={saving}
                  >
                    {saving
                      ? "Speichert..."
                      : editingFieldId
                      ? "Fläche aktualisieren"
                      : "Fläche speichern"}
                  </button>
                </div>
              </div>

              <div className="mt-1 text-sm text-gray-700">
                <h2 className="text-lg font-semibold">Hinweis</h2>
                <p className="mt-2 text-sm text-gray-600">
                  Der Anzeigename wird später überall zuerst angezeigt, der
                  Flächenname steht in Klammern dahinter.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 rounded-2xl bg-white p-4 shadow md:grid-cols-[1fr_260px]">
          <div className="mt-1 text-sm text-gray-600">
            <label className="mb-2 block text-sm font-medium">Suche</label>
            <input
              type="text"
              placeholder="Fläche, Anzeigename, Team, Treffpunkt ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
            />
          </div>

          <div className="mt-1 text-sm text-gray-600">
            <label className="mb-2 block text-sm font-medium">Treffpunkt</label>
            <select
              value={meetingPointFilter}
              onChange={(e) =>
                setMeetingPointFilter(e.target.value as MeetingPointFilter)
              }
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="ALLE">Alle</option>
              <option value="MIT_TREFFPUNKT">Nur mit Treffpunkt</option>
              <option value="OHNE_TREFFPUNKT">Nur ohne Treffpunkt</option>
            </select>
          </div>
        </div>

        {loadingFields ? (
          <div className="rounded-2xl bg-white p-6 shadow">
            Flächen werden geladen...
          </div>
        ) : filteredFields.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 shadow">
            Keine Flächen gefunden.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFields.map((field) => {
              let squareMeters = 0;

              try {
                squareMeters = area(field.areaGeoJson);
              } catch {
                squareMeters = 0;
              }

              const fieldArea = formatArea(squareMeters);
              const isOpen = openFieldId === field.id;
              const meetingPointSet = hasMeetingPoint(field);

              return (
                <div
                  key={field.id}
                  className="overflow-hidden rounded-2xl bg-white shadow"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenFieldId((prev) => (prev === field.id ? null : field.id))
                    }
                    className="flex w-full items-center justify-between gap-4 p-4 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-base font-semibold text-gray-900">
                          {getFieldLabel(field)}
                        </div>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getMeetingPointBadgeClasses(
                            field
                          )}`}
                        >
                          {getMeetingPointBadgeText(field)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="hidden text-right text-sm text-gray-600 sm:block">
                        <div>{fieldArea.ha}</div>
                        <div>{field.orders.length} Auftrag/ Aufträge</div>
                      </div>
                      <div className="text-xl text-gray-500">
                        {isOpen ? "−" : "+"}
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t px-4 pb-4 pt-4">
                      <div className="mb-4 flex justify-end gap-2">
  {isAdmin && (
    <>
      <button
        type="button"
        onClick={() => startEditField(field)}
        className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm"
      >
        Bearbeiten
      </button>

      <button
        type="button"
        onClick={() => deleteField(field)}
        className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50"
      >
        Löschen
      </button>
    </>
  )}
</div>

                      {!meetingPointSet && (
                        <div className="mb-4 rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900">
                          Für diese Fläche ist noch kein Treffpunkt gesetzt.
                          Nach KML-Importen sollte dieser Punkt geprüft und manuell
                          ergänzt werden.
                        </div>
                      )}

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3">
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                              Fläche
                            </div>
                            <div className="mt-1 text-sm text-gray-900">
                              {getFieldLabel(field)}
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border p-3">
                              <div className="text-xs uppercase tracking-wide text-gray-500">
                                Quadratmeter
                              </div>
                              <div className="mt-1 text-base font-semibold text-gray-900">
                                {fieldArea.sqm}
                              </div>
                            </div>

                            <div className="rounded-xl border p-3">
                              <div className="text-xs uppercase tracking-wide text-gray-500">
                                Hektar
                              </div>
                              <div className="mt-1 text-base font-semibold text-gray-900">
                                {fieldArea.ha}
                              </div>
                            </div>
                          </div>

                          <div className="rounded-xl border p-3">
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                              Treffpunkt
                            </div>
                            <div className="mt-2">
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-semibold ${getMeetingPointBadgeClasses(
                                  field
                                )}`}
                              >
                                {getMeetingPointBadgeText(field)}
                              </span>
                            </div>
                            <div className="mt-3 text-sm text-gray-700">
                              {meetingPointSet
                                ? `${field.locationLatitude!.toFixed(6)}, ${field.locationLongitude!.toFixed(6)}`
                                : "-"}
                            </div>
                            <div className="mt-2 text-sm text-gray-700">
                              {field.locationNote || "-"}
                            </div>
                          </div>

                          <div className="rounded-xl border p-3">
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                              Notiz
                            </div>
                            <div className="mt-1 text-sm text-gray-700">
                              {field.notes || "-"}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-xl border p-3">
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                              Zugeordnete Teams
                            </div>

                            {field.orders.length > 0 ? (
                              <div className="mt-2 space-y-2">
                                {field.orders.map((order) => (
                                  <div
                                    key={order.id}
                                    className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800"
                                  >
                                    {order.team ? order.team.name : "Kein Team"}
                                    {order.status ? ` · ${order.status}` : ""}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-1 text-sm text-gray-700">
                                Kein Auftrag zugeordnet
                              </div>
                            )}
                          </div>

                          <div className="rounded-xl border p-3">
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                              Zusammenfassung
                            </div>
                            <div className="mt-2 text-sm text-gray-700">
                              {field.orders.length > 0
                                ? `${field.orders.length} Auftrag/Aufträge zugeordnet`
                                : "Noch kein Auftrag vorhanden"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}