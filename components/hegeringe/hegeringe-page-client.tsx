"use client";

import { useEffect, useMemo, useState } from "react";

type RevierItem = {
  id: string;
  name: string;
  nummer?: string | null;
  isActive: boolean;
};

type Hegering = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  reviere?: RevierItem[];
};

type EditableHegering = Hegering & {
  editedName: string;
  editedIsActive: boolean;
};

const emptyForm = {
  name: "",
  isActive: true,
};

function getRevierLabel(revier: RevierItem) {
  const name = (revier.name || "").trim();
  const nummer = (revier.nummer || "").trim();

  if (name && nummer) return `${name} (${nummer})`;
  if (name) return name;
  if (nummer) return nummer;

  return "Unbekanntes Revier";
}

export default function HegeringePageClient() {
  const [hegeringe, setHegeringe] = useState<EditableHegering[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function loadHegeringe() {
    setLoading(true);

    try {
      const res = await fetch("/api/hegeringe", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Hegeringe konnten nicht geladen werden.");
      }

      const prepared: EditableHegering[] = Array.isArray(data)
        ? data.map((item: Hegering) => ({
            ...item,
            editedName: item.name,
            editedIsActive: item.isActive,
          }))
        : [];

      setHegeringe(prepared);

      setOpenId((prev) => {
        if (prev && prepared.some((item) => item.id === prev)) {
          return prev;
        }

        return prepared[0]?.id || null;
      });
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Hegeringe konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHegeringe();
  }, []);

  function updateLocalHegering(
    id: string,
    changes: Partial<Pick<EditableHegering, "editedName" | "editedIsActive">>
  ) {
    setHegeringe((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              ...changes,
            }
          : item
      )
    );
  }

  async function createHegering() {
    const name = form.name.trim();

    if (!name) {
      alert("Bitte einen Namen eingeben.");
      return;
    }

    setCreating(true);

    try {
      const res = await fetch("/api/hegeringe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          isActive: form.isActive,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Hegering konnte nicht angelegt werden.");
      }

      setForm(emptyForm);
      await loadHegeringe();
      alert("Hegering wurde angelegt.");
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Hegering konnte nicht angelegt werden.");
    } finally {
      setCreating(false);
    }
  }

  async function saveHegering(item: EditableHegering) {
    const name = item.editedName.trim();

    if (!name) {
      alert("Bitte einen Namen eingeben.");
      return;
    }

    setSavingId(item.id);

    try {
      const res = await fetch(`/api/hegeringe/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          isActive: item.editedIsActive,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Hegering konnte nicht gespeichert werden.");
      }

      await loadHegeringe();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Hegering konnte nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteHegering(item: EditableHegering) {
    const confirmed = window.confirm(
      `Hegering "${item.name}" wirklich löschen?`
    );

    if (!confirmed) return;

    setSavingId(item.id);

    try {
      const res = await fetch(`/api/hegeringe/${item.id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Hegering konnte nicht gelöscht werden.");
      }

      await loadHegeringe();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Hegering konnte nicht gelöscht werden.");
    } finally {
      setSavingId(null);
    }
  }

  const filteredHegeringe = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return hegeringe;

    return hegeringe.filter((item) => {
      const text = [
        item.name,
        item.isActive ? "aktiv" : "inaktiv",
        ...(item.reviere || []).map((revier) => getRevierLabel(revier)),
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(term);
    });
  }, [hegeringe, search]);

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="rounded-3xl bg-slate-900 p-5 text-white shadow md:p-6">
          <h1 className="text-2xl font-bold md:text-3xl">Hegeringe</h1>
          <p className="mt-2 text-sm text-slate-100">
            Reviere können einem Hegering zugeordnet werden. So kannst du später
            nur die Reviere vom Hegering Hittfeld anzeigen.
          </p>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h2 className="text-xl font-bold text-gray-900">
            Neuen Hegering anlegen
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_auto]">
            <input
              value={form.name}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }
              placeholder="z. B. Hittfeld"
              className="rounded-xl border border-gray-300 px-3 py-3"
            />

            <label className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-800">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    isActive: event.target.checked,
                  }))
                }
              />
              Aktiv
            </label>

            <button
              type="button"
              onClick={createHegering}
              disabled={creating}
              className="rounded-xl bg-black px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {creating ? "Speichert..." : "Anlegen"}
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <label className="mb-2 block text-sm font-semibold text-gray-900">
            Suche
          </label>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Hegering, Revier, aktiv, inaktiv ..."
            className="w-full rounded-xl border border-gray-300 px-3 py-3"
          />
        </section>

        {loading ? (
          <section className="rounded-3xl bg-white p-6 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Hegeringe werden geladen...
          </section>
        ) : filteredHegeringe.length === 0 ? (
          <section className="rounded-3xl bg-white p-6 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Keine Hegeringe gefunden.
          </section>
        ) : (
          <section className="space-y-3">
            {filteredHegeringe.map((item) => {
              const isOpen = openId === item.id;
              const revierCount = item.reviere?.length || 0;

              const hasChanges =
                item.name !== item.editedName ||
                item.isActive !== item.editedIsActive;

              return (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-100"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenId((prev) => (prev === item.id ? null : item.id))
                    }
                    className="flex w-full flex-col gap-2 p-4 text-left md:flex-row md:items-center md:justify-between md:p-5"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-900">
                          {item.name}
                        </h2>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-bold ${
                            item.isActive
                              ? "border-green-300 bg-green-50 text-green-900"
                              : "border-gray-300 bg-gray-50 text-gray-700"
                          }`}
                        >
                          {item.isActive ? "aktiv" : "inaktiv"}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-gray-600">
                        {revierCount} Revier(e) zugeordnet
                      </div>
                    </div>

                    <div className="text-xl text-gray-500">
                      {isOpen ? "−" : "+"}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 p-4 md:p-5">
                      <div className="grid gap-3 md:grid-cols-[1fr_160px]">
                        <input
                          value={item.editedName}
                          onChange={(event) =>
                            updateLocalHegering(item.id, {
                              editedName: event.target.value,
                            })
                          }
                          className="rounded-xl border border-gray-300 px-3 py-3"
                        />

                        <label className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-800">
                          <input
                            type="checkbox"
                            checked={item.editedIsActive}
                            onChange={(event) =>
                              updateLocalHegering(item.id, {
                                editedIsActive: event.target.checked,
                              })
                            }
                          />
                          Aktiv
                        </label>
                      </div>

                      <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <div className="font-bold text-gray-900">
                          Zugeordnete Reviere
                        </div>

                        {revierCount === 0 ? (
                          <div className="mt-2 text-sm text-gray-600">
                            Noch keine Reviere zugeordnet.
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(item.reviere || []).map((revier) => (
                              <span
                                key={revier.id}
                                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                  revier.isActive
                                    ? "border-green-200 bg-green-50 text-green-900"
                                    : "border-gray-200 bg-white text-gray-600"
                                }`}
                              >
                                {getRevierLabel(revier)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => saveHegering(item)}
                          disabled={savingId === item.id || !hasChanges}
                          className="rounded-xl bg-black px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {savingId === item.id ? "Speichert..." : "Speichern"}
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteHegering(item)}
                          disabled={savingId === item.id || revierCount > 0}
                          className="rounded-xl border border-red-300 bg-white px-5 py-3 text-sm font-bold text-red-700 disabled:opacity-50"
                        >
                          Löschen
                        </button>
                      </div>

                      {revierCount > 0 && (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                          Dieser Hegering kann erst gelöscht werden, wenn keine
                          Reviere mehr zugeordnet sind.
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}