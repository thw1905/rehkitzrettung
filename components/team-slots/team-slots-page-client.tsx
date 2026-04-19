"use client";

import { useEffect, useMemo, useState } from "react";

type TeamSlot = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type EditableTeamSlot = TeamSlot & {
  editedName: string;
  editedSortOrder: string;
  editedIsActive: boolean;
};

function hasChanges(slot: EditableTeamSlot) {
  return (
    slot.name !== slot.editedName ||
    String(slot.sortOrder) !== slot.editedSortOrder ||
    slot.isActive !== slot.editedIsActive
  );
}

export default function TeamSlotsPageClient() {
  const [slots, setSlots] = useState<EditableTeamSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [newName, setNewName] = useState("");
  const [newSortOrder, setNewSortOrder] = useState("");
  const [newIsActive, setNewIsActive] = useState(true);

  async function loadSlots() {
    setLoading(true);

    try {
      const res = await fetch("/api/team-slots", {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Team-Slots konnten nicht geladen werden.");
      }

      const prepared = (Array.isArray(data) ? data : []).map((slot: TeamSlot) => ({
        ...slot,
        editedName: slot.name,
        editedSortOrder: String(slot.sortOrder),
        editedIsActive: slot.isActive,
      }));

      setSlots(prepared);
    } catch (error: any) {
      console.error("Fehler beim Laden der Team-Slots:", error);
      alert(error?.message || "Team-Slots konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSlots();
  }, []);

  const nextSuggestedSortOrder = useMemo(() => {
    if (slots.length === 0) return 1;
    return Math.max(...slots.map((slot) => slot.sortOrder || 0)) + 1;
  }, [slots]);

  function updateLocalSlot(
    id: string,
    changes: Partial<
      Pick<EditableTeamSlot, "editedName" | "editedSortOrder" | "editedIsActive">
    >
  ) {
    setSlots((prev) =>
      prev.map((slot) =>
        slot.id === id
          ? {
              ...slot,
              ...changes,
            }
          : slot
      )
    );
  }

  async function createSlot() {
    const name = newName.trim();

    if (!name) {
      alert("Bitte einen Namen eingeben.");
      return;
    }

    setCreating(true);

    try {
      const res = await fetch("/api/team-slots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          sortOrder: newSortOrder === "" ? nextSuggestedSortOrder : Number(newSortOrder),
          isActive: newIsActive,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Team-Slot konnte nicht angelegt werden.");
      }

      setNewName("");
      setNewSortOrder("");
      setNewIsActive(true);
      await loadSlots();
      alert("Team-Slot angelegt.");
    } catch (error: any) {
      console.error("Fehler beim Anlegen:", error);
      alert(error?.message || "Team-Slot konnte nicht angelegt werden.");
    } finally {
      setCreating(false);
    }
  }

  async function saveSlot(slot: EditableTeamSlot) {
    const name = slot.editedName.trim();

    if (!name) {
      alert("Bitte einen Namen eingeben.");
      return;
    }

    setSavingId(slot.id);

    try {
      const res = await fetch(`/api/team-slots/${slot.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          sortOrder: Number(slot.editedSortOrder),
          isActive: slot.editedIsActive,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Team-Slot konnte nicht gespeichert werden.");
      }

      await loadSlots();
      alert("Team-Slot gespeichert.");
    } catch (error: any) {
      console.error("Fehler beim Speichern:", error);
      alert(error?.message || "Team-Slot konnte nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteSlot(slot: EditableTeamSlot) {
    const confirmed = window.confirm(
      `Möchtest du den Team-Slot "${slot.name}" wirklich löschen?`
    );

    if (!confirmed) return;

    setSavingId(slot.id);

    try {
      const res = await fetch(`/api/team-slots/${slot.id}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Team-Slot konnte nicht gelöscht werden.");
      }

      await loadSlots();
      alert("Team-Slot gelöscht.");
    } catch (error: any) {
      console.error("Fehler beim Löschen:", error);
      alert(error?.message || "Team-Slot konnte nicht gelöscht werden.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-4 md:px-6 md:py-8">
      <div className="mx-auto max-w-5xl space-y-4 md:space-y-6">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-7">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
            Team-Slots
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600 md:text-base">
            Hier verwaltest du die festen Team-Slots wie Team 1, Team 2 oder Team 3.
            Die Besetzung erfolgt später pro Einsatztag in der Teamplanung.
          </p>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Neuen Team-Slot anlegen
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_0.7fr_auto]">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Name
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                placeholder="z. B. Team 1"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Reihenfolge
              </label>
              <input
                type="number"
                value={newSortOrder}
                onChange={(e) => setNewSortOrder(e.target.value)}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                placeholder={String(nextSuggestedSortOrder)}
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 rounded-2xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-800">
                <input
                  type="checkbox"
                  checked={newIsActive}
                  onChange={(e) => setNewIsActive(e.target.checked)}
                />
                Aktiv
              </label>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={createSlot}
              disabled={creating}
              className="rounded-2xl bg-black px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
            >
              {creating ? "Speichert..." : "Team-Slot anlegen"}
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Vorhandene Team-Slots
          </h2>

          {loading ? (
            <div className="mt-4 text-sm text-gray-600">Team-Slots werden geladen...</div>
          ) : slots.length === 0 ? (
            <div className="mt-4 text-sm text-gray-600">
              Noch keine Team-Slots vorhanden.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className="rounded-3xl border border-gray-200 p-4 md:p-5"
                >
                  <div className="grid gap-4 md:grid-cols-[1.4fr_0.7fr_auto]">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">
                        Name
                      </label>
                      <input
                        value={slot.editedName}
                        onChange={(e) =>
                          updateLocalSlot(slot.id, { editedName: e.target.value })
                        }
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">
                        Reihenfolge
                      </label>
                      <input
                        type="number"
                        value={slot.editedSortOrder}
                        onChange={(e) =>
                          updateLocalSlot(slot.id, {
                            editedSortOrder: e.target.value,
                          })
                        }
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                      />
                    </div>

                    <div className="flex items-end">
                      <label className="flex items-center gap-2 rounded-2xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-800">
                        <input
                          type="checkbox"
                          checked={slot.editedIsActive}
                          onChange={(e) =>
                            updateLocalSlot(slot.id, {
                              editedIsActive: e.target.checked,
                            })
                          }
                        />
                        Aktiv
                      </label>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => saveSlot(slot)}
                      disabled={savingId === slot.id || !hasChanges(slot)}
                      className="rounded-2xl bg-black px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
                    >
                      {savingId === slot.id ? "Speichert..." : "Speichern"}
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteSlot(slot)}
                      disabled={savingId === slot.id}
                      className="rounded-2xl border border-red-300 px-5 py-3 text-base font-semibold text-red-700 disabled:opacity-50"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}