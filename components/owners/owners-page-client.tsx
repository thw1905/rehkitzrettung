"use client";

import { useEffect, useMemo, useState } from "react";

type Owner = {
  id: string;
  firstName: string;
  lastName: string;
  street: string;
  zip: string;
  city: string;
  phone: string;
  email: string | null;
};

type EditableOwner = Owner & {
  editedFirstName: string;
  editedLastName: string;
  editedStreet: string;
  editedZip: string;
  editedCity: string;
  editedPhone: string;
  editedEmail: string;
};

const emptyForm = {
  firstName: "",
  lastName: "",
  street: "",
  zip: "",
  city: "",
  phone: "",
  email: "",
};

export default function OwnersPage() {
  const [owners, setOwners] = useState<EditableOwner[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [openOwnerId, setOpenOwnerId] = useState<string | null>(null);

  async function loadOwners() {
    setLoading(true);
    try {
      const res = await fetch("/api/owners");
      const data: Owner[] = await res.json();

      const preparedOwners: EditableOwner[] = data.map((owner) => ({
        ...owner,
        editedFirstName: owner.firstName,
        editedLastName: owner.lastName,
        editedStreet: owner.street,
        editedZip: owner.zip,
        editedCity: owner.city,
        editedPhone: owner.phone,
        editedEmail: owner.email || "",
      }));

      setOwners(preparedOwners);
      setOpenOwnerId((prev) => {
        if (prev && preparedOwners.some((owner) => owner.id === prev)) {
          return prev;
        }
        return preparedOwners[0]?.id || null;
      });
    } catch (error) {
      console.error("Fehler beim Laden der Ansprechpartner:", error);
      alert("Ansprechpartner konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOwners();
  }, []);

  function updateLocalOwner(
    id: string,
    changes: Partial<
      Pick<
        EditableOwner,
        | "editedFirstName"
        | "editedLastName"
        | "editedStreet"
        | "editedZip"
        | "editedCity"
        | "editedPhone"
        | "editedEmail"
      >
    >
  ) {
    setOwners((prev) =>
      prev.map((owner) =>
        owner.id === id
          ? {
              ...owner,
              ...changes,
            }
          : owner
      )
    );
  }

  async function createOwner() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      alert("Vorname und Nachname sind Pflicht.");
      return;
    }

    setCreating(true);

    try {
      const res = await fetch("/api/owners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        throw new Error("Anlegen fehlgeschlagen");
      }

      setForm(emptyForm);
      await loadOwners();
      alert("Ansprechpartner angelegt");
    } catch (error) {
      console.error("Fehler beim Anlegen:", error);
      alert("Ansprechpartner konnte nicht angelegt werden.");
    } finally {
      setCreating(false);
    }
  }

  async function saveOwner(owner: EditableOwner) {
    setSavingId(owner.id);

    try {
      const res = await fetch(`/api/owners/${owner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: owner.editedFirstName,
          lastName: owner.editedLastName,
          street: owner.editedStreet,
          zip: owner.editedZip,
          city: owner.editedCity,
          phone: owner.editedPhone,
          email: owner.editedEmail,
        }),
      });

      if (!res.ok) {
        throw new Error("Speichern fehlgeschlagen");
      }

      await loadOwners();
    } catch (error) {
      console.error("Fehler beim Speichern:", error);
      alert("Ansprechpartner konnte nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteOwner(id: string, name: string) {
    const confirmed = window.confirm(
      `Möchtest du ${name} wirklich löschen?`
    );

    if (!confirmed) return;

    setSavingId(id);

    try {
      const res = await fetch(`/api/owners/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Löschen fehlgeschlagen");
      }

      await loadOwners();
    } catch (error) {
      console.error("Fehler beim Löschen:", error);
      alert("Ansprechpartner konnte nicht gelöscht werden.");
    } finally {
      setSavingId(null);
    }
  }

  const filteredOwners = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return owners;

    return owners.filter((owner) => {
      const fullText = [
        owner.firstName,
        owner.lastName,
        owner.street,
        owner.zip,
        owner.city,
        owner.phone,
        owner.email || "",
      ]
        .join(" ")
        .toLowerCase();

      return fullText.includes(term);
    });
  }, [owners, search]);

  return (
    <main className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5 md:space-y-6">
        <div className="rounded-2xl border-2 border-slate-900 bg-slate-900 p-4 shadow sm:p-5 md:p-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Ansprechpartnerverwaltung
          </h1>
          <p className="mt-2 text-sm text-slate-100 sm:text-base">
            Ansprechpartner anlegen, bearbeiten und löschen.
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border-2 border-blue-800 bg-blue-50 p-4 shadow sm:p-5 md:p-6">
          <div className="rounded-xl bg-blue-800 px-4 py-3">
            <h2 className="text-lg font-extrabold text-white sm:text-xl">
              Neuen Ansprechpartner anlegen
            </h2>
            <p className="mt-1 text-sm text-blue-100 sm:text-base">
              Stammdaten für Ansprechpartner erfassen.
            </p>
          </div>

          <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
            <input
              placeholder="Vorname"
              value={form.firstName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, firstName: e.target.value }))
              }
              className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
            />
            <input
              placeholder="Nachname"
              value={form.lastName}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, lastName: e.target.value }))
              }
              className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
            />
            <input
              placeholder="Straße"
              value={form.street}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, street: e.target.value }))
              }
              className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:col-span-2 md:text-sm"
            />
            <input
              placeholder="PLZ"
              value={form.zip}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, zip: e.target.value }))
              }
              className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
            />
            <input
              placeholder="Ort"
              value={form.city}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, city: e.target.value }))
              }
              className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
            />
            <input
              placeholder="Telefon"
              value={form.phone}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, phone: e.target.value }))
              }
              className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
            />
            <input
              placeholder="E-Mail"
              value={form.email}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, email: e.target.value }))
              }
              className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
            />
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={createOwner}
              className="min-h-11 rounded-xl bg-black px-4 py-2.5 text-white disabled:opacity-50"
              disabled={creating}
            >
              {creating ? "Speichert..." : "Ansprechpartner anlegen"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow sm:p-5">
          <label className="mb-2 block text-sm font-medium">Suche</label>
          <input
            type="text"
            placeholder="Name, Adresse, Ort, Telefon, E-Mail ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
          />
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-5 shadow sm:p-6">
            Ansprechpartner werden geladen...
          </div>
        ) : filteredOwners.length === 0 ? (
          <div className="rounded-2xl bg-white p-5 shadow sm:p-6">
            Keine Ansprechpartner gefunden.
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {filteredOwners.map((owner) => {
              const fullName = `${owner.firstName} ${owner.lastName}`;

              const hasChanges =
                owner.firstName !== owner.editedFirstName ||
                owner.lastName !== owner.editedLastName ||
                owner.street !== owner.editedStreet ||
                owner.zip !== owner.editedZip ||
                owner.city !== owner.editedCity ||
                owner.phone !== owner.editedPhone ||
                (owner.email || "") !== owner.editedEmail;

              const isOpen = openOwnerId === owner.id;

              return (
                <div
                  key={owner.id}
                  className="overflow-hidden rounded-2xl bg-white shadow"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenOwnerId((prev) => (prev === owner.id ? null : owner.id))
                    }
                    className="flex w-full items-start justify-between gap-3 p-4 text-left sm:items-center sm:p-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold text-slate-900 sm:text-lg">
                        {owner.editedFirstName || owner.firstName}{" "}
                        {owner.editedLastName || owner.lastName}
                      </div>

                      <div className="mt-1 text-sm text-slate-600">
                        {[owner.editedZip || owner.zip, owner.editedCity || owner.city]
                          .filter(Boolean)
                          .join(" ")}
                      </div>

                      <div className="mt-1 text-sm text-slate-500">
                        {owner.editedPhone || owner.phone || "Kein Telefon"}
                      </div>
                    </div>

                    <div className="shrink-0 text-xl text-slate-500">
                      {isOpen ? "−" : "+"}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">
                            Vorname
                          </label>
                          <input
                            value={owner.editedFirstName}
                            onChange={(e) =>
                              updateLocalOwner(owner.id, {
                                editedFirstName: e.target.value,
                              })
                            }
                            className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">
                            Nachname
                          </label>
                          <input
                            value={owner.editedLastName}
                            onChange={(e) =>
                              updateLocalOwner(owner.id, {
                                editedLastName: e.target.value,
                              })
                            }
                            className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-sm font-medium text-slate-700">
                            Straße
                          </label>
                          <input
                            value={owner.editedStreet}
                            onChange={(e) =>
                              updateLocalOwner(owner.id, {
                                editedStreet: e.target.value,
                              })
                            }
                            className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">
                            PLZ
                          </label>
                          <input
                            value={owner.editedZip}
                            onChange={(e) =>
                              updateLocalOwner(owner.id, {
                                editedZip: e.target.value,
                              })
                            }
                            className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">
                            Ort
                          </label>
                          <input
                            value={owner.editedCity}
                            onChange={(e) =>
                              updateLocalOwner(owner.id, {
                                editedCity: e.target.value,
                              })
                            }
                            className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">
                            Telefon
                          </label>
                          <input
                            value={owner.editedPhone}
                            onChange={(e) =>
                              updateLocalOwner(owner.id, {
                                editedPhone: e.target.value,
                              })
                            }
                            className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-700">
                            E-Mail
                          </label>
                          <input
                            value={owner.editedEmail}
                            onChange={(e) =>
                              updateLocalOwner(owner.id, {
                                editedEmail: e.target.value,
                              })
                            }
                            className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                        <button
                          type="button"
                          onClick={() => saveOwner(owner)}
                          className="min-h-11 rounded-xl bg-black px-4 py-2.5 text-white disabled:opacity-50"
                          disabled={savingId === owner.id || !hasChanges}
                        >
                          {savingId === owner.id ? "Speichert..." : "Speichern"}
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteOwner(owner.id, fullName)}
                          className="min-h-11 rounded-xl border border-red-300 px-4 py-2.5 text-red-700"
                          disabled={savingId === owner.id}
                        >
                          Löschen
                        </button>
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


