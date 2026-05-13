"use client";

import { useEffect, useState } from "react";

type RevierLite = {
  id: string;
  name: string;
  nummer?: string | null;
};

type RevierPachter = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  notes?: string | null;
  reviere?: RevierLite[];
};

type FormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  street: string;
  zip: string;
  city: string;
  notes: string;
};

const emptyForm: FormState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  street: "",
  zip: "",
  city: "",
  notes: "",
};

function getPachterName(pachter: RevierPachter) {
  return `${pachter.firstName} ${pachter.lastName}`.trim();
}

function getRevierLabel(revier: RevierLite) {
  const nummer = (revier.nummer || "").trim();
  const name = (revier.name || "").trim();

  if (nummer && name) return `${nummer} · ${name}`;
  if (nummer) return nummer;
  if (name) return name;
  return "Unbekanntes Revier";
}
export default function RevierPaechterPageClient() {
  const [paechter, setPaechter] = useState<RevierPachter[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function updateForm(key: keyof FormState, value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function loadPaechter() {
    setLoading(true);

    try {
      const res = await fetch("/api/revier-paechter", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Revierpächter konnten nicht geladen werden.");
      }

      setPaechter(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Revierpächter konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPaechter();
  }, []);

  function startEdit(pachter: RevierPachter) {
    setEditingId(pachter.id);
    setForm({
      firstName: pachter.firstName || "",
      lastName: pachter.lastName || "",
      phone: pachter.phone || "",
      email: pachter.email || "",
      street: pachter.street || "",
      zip: pachter.zip || "",
      city: pachter.city || "",
      notes: pachter.notes || "",
    });
  }
async function savePachter() {
    if (!form.firstName.trim()) {
      alert("Bitte Vorname eingeben.");
      return;
    }

    if (!form.lastName.trim()) {
      alert("Bitte Nachname eingeben.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch(
        editingId ? `/api/revier-paechter/${editingId}` : "/api/revier-paechter",
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Revierpächter konnte nicht gespeichert werden.");
      }

      resetForm();
      await loadPaechter();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Revierpächter konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePachter(pachter: RevierPachter) {
    const confirmed = window.confirm(
      `Möchtest du ${getPachterName(pachter)} wirklich löschen?`
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/revier-paechter/${pachter.id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Revierpächter konnte nicht gelöscht werden.");
      }

      if (editingId === pachter.id) {
        resetForm();
      }

      await loadPaechter();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Revierpächter konnte nicht gelöscht werden.");
    }
  }
return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Revierpächter
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Verwalte hier die jagdlichen Ansprechpartner und ordne sie später den Revieren zu.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-lg font-bold text-gray-900">
              {editingId ? "Pächter bearbeiten" : "Pächter anlegen"}
            </h2>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-900">
                  Vorname
                </label>
                <input
                  value={form.firstName}
                  onChange={(e) => updateForm("firstName", e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-900">
                  Nachname
                </label>
                <input
                  value={form.lastName}
                  onChange={(e) => updateForm("lastName", e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-900">
                  Telefon
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => updateForm("phone", e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-900">
                  E-Mail
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-900">
                  Straße
                </label>
                <input
                  value={form.street}
                  onChange={(e) => updateForm("street", e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-[100px_1fr] gap-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-900">
                    PLZ
                  </label>
                  <input
                    value={form.zip}
                    onChange={(e) => updateForm("zip", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-900">
                    Ort
                  </label>
                  <input
                    value={form.city}
                    onChange={(e) => updateForm("city", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-900">
                  Notiz
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2"
                />
              </div>

              <button
                type="button"
                onClick={savePachter}
                disabled={saving}
                className="w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Speichert..." : editingId ? "Änderungen speichern" : "Pächter anlegen"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-900"
                >
                  Abbrechen
                </button>
              )}
            </div>
          </div>
<div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-lg font-bold text-gray-900">
              Gespeicherte Revierpächter
            </h2>

            {loading ? (
              <div className="mt-4 text-sm text-gray-600">
                Revierpächter werden geladen...
              </div>
            ) : paechter.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                Noch keine Revierpächter angelegt.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {paechter.map((pachter) => (
                  <div
                    key={pachter.id}
                    className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-base font-bold text-gray-900">
                          {getPachterName(pachter)}
                        </div>

                        <div className="mt-2 space-y-1 text-sm text-gray-700">
                          {pachter.phone && <div>📞 {pachter.phone}</div>}
                          {pachter.email && <div>✉️ {pachter.email}</div>}

                          {(pachter.street || pachter.zip || pachter.city) && (
                            <div>
                              📍 {[pachter.street, pachter.zip, pachter.city]
                                .filter(Boolean)
                                .join(", ")}
                            </div>
                          )}

                          {pachter.notes && (
                            <div className="text-gray-500">
                              {pachter.notes}
                            </div>
                          )}
                        </div>

                        {pachter.reviere && pachter.reviere.length > 0 && (
                          <div className="mt-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Zugeordnete Reviere
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {pachter.reviere.map((revier) => (
                                <span
                                  key={revier.id}
                                  className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-900"
                                >
                                  {getRevierLabel(revier)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
<div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(pachter)}
                          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                        >
                          Bearbeiten
                        </button>

                        <button
                          type="button"
                          onClick={() => deletePachter(pachter)}
                          className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 hover:bg-red-100"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}