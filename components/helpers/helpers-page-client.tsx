"use client";

import { useEffect, useMemo, useState } from "react";

type Helper = {
  id: string;
  firstName: string;
  lastName: string;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  phone?: string | null;
  email: string;
  role: "PILOT" | "SUCHER";
  isAdmin: boolean;
  isApproved?: boolean;
  createdAt?: string;
  autoAssignPriority?: number;
  isPrimaryPilot?: boolean;
};

type FilterStatus = "ALLE" | "WARTET" | "FREIGEGEBEN";
type FilterRole = "ALLE" | "PILOT" | "SUCHER";

function fullName(helper: Helper) {
  return `${helper.firstName || ""} ${helper.lastName || ""}`.trim();
}

function formatDate(dateString?: string) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function statusBadge(isApproved?: boolean) {
  if (isApproved) {
    return "border-green-300 bg-green-100 text-green-900";
  }

  return "border-amber-300 bg-amber-100 text-amber-900";
}

function roleBadge(role: Helper["role"]) {
  if (role === "PILOT") {
    return "border-blue-300 bg-blue-100 text-blue-900";
  }

  return "border-slate-300 bg-slate-100 text-slate-900";
}

export default function HelpersPageClient() {
  const [helpers, setHelpers] = useState<Helper[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("ALLE");
  const [roleFilter, setRoleFilter] = useState<FilterRole>("ALLE");
  const [adminOnly, setAdminOnly] = useState(false);
  const [openHelperId, setOpenHelperId] = useState<string | null>(null);

  async function loadHelpers() {
    setLoading(true);

    try {
      const res = await fetch("/api/helpers", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Helfer konnten nicht geladen werden.");
      }

      const loaded = Array.isArray(data) ? data : [];
      setHelpers(loaded);

      setOpenHelperId((prev) => {
        if (prev && loaded.some((h) => h.id === prev)) return prev;
        const firstPending = loaded.find((h) => !h.isApproved);
        return firstPending?.id || loaded[0]?.id || null;
      });
    } catch (error: any) {
      console.error("Fehler beim Laden der Helfer:", error);
      alert(error?.message || "Helfer konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHelpers();
  }, []);

  async function updateHelper(
  helper: Helper,
  changes: Partial<
    Pick<
      Helper,
      "role" | "isAdmin" | "isApproved" | "autoAssignPriority" | "isPrimaryPilot"
    >
  >
) {
    setSavingId(helper.id);

    try {
      const res = await fetch(`/api/helpers/${helper.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
       body: JSON.stringify({
  firstName: helper.firstName,
  lastName: helper.lastName,
  street: helper.street || "",
  zip: helper.zip || "",
  city: helper.city || "",
  phone: helper.phone || "",
  email: helper.email,
  role: changes.role ?? helper.role,
  isAdmin: changes.isAdmin ?? helper.isAdmin,
  isApproved:
    changes.isApproved ??
    (typeof helper.isApproved === "boolean" ? helper.isApproved : false),
  autoAssignPriority:
    changes.autoAssignPriority ??
    (typeof helper.autoAssignPriority === "number"
      ? helper.autoAssignPriority
      : 0),
  isPrimaryPilot:
    changes.isPrimaryPilot ??
    (typeof helper.isPrimaryPilot === "boolean"
      ? helper.isPrimaryPilot
      : false),
}),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Speichern fehlgeschlagen.");
      }

      await loadHelpers();
    } catch (error: any) {
      console.error("Fehler beim Aktualisieren:", error);
      alert(error?.message || "Speichern fehlgeschlagen.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteHelper(helper: Helper) {
    const confirmed = window.confirm(
      `Möchtest du ${fullName(helper)} wirklich löschen?`
    );

    if (!confirmed) return;

    setSavingId(helper.id);

    try {
      const res = await fetch(`/api/helpers/${helper.id}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Löschen fehlgeschlagen.");
      }

      await loadHelpers();
    } catch (error: any) {
      console.error("Fehler beim Löschen:", error);
      alert(error?.message || "Löschen fehlgeschlagen.");
    } finally {
      setSavingId(null);
    }
  }

  async function resetPassword(helper: Helper) {
    const password = window.prompt(
      `Neues Passwort für ${fullName(helper)} eingeben:`
    );

    if (!password) return;

    setSavingId(helper.id);

    try {
      const res = await fetch(`/api/helpers/${helper.id}/reset-password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Passwort konnte nicht gesetzt werden.");
      }

      alert("Passwort wurde zurückgesetzt.");
    } catch (error: any) {
      console.error("Fehler beim Passwort-Reset:", error);
      alert(error?.message || "Passwort konnte nicht gesetzt werden.");
    } finally {
      setSavingId(null);
    }
  }

  const filteredHelpers = useMemo(() => {
    const term = search.trim().toLowerCase();

    let result = [...helpers];

    result.sort((a, b) => {
      const aPending = a.isApproved ? 1 : 0;
      const bPending = b.isApproved ? 1 : 0;

      if (aPending !== bPending) {
        return aPending - bPending;
      }

      return fullName(a).localeCompare(fullName(b), "de");
    });

    if (statusFilter === "WARTET") {
      result = result.filter((helper) => !helper.isApproved);
    } else if (statusFilter === "FREIGEGEBEN") {
      result = result.filter((helper) => !!helper.isApproved);
    }

    if (roleFilter !== "ALLE") {
      result = result.filter((helper) => helper.role === roleFilter);
    }

    if (adminOnly) {
      result = result.filter((helper) => helper.isAdmin);
    }

    if (!term) return result;

    return result.filter((helper) =>
      [
        helper.firstName,
        helper.lastName,
        helper.email,
        helper.phone || "",
        helper.city || "",
        helper.zip || "",
        helper.street || "",
        helper.role,
        helper.isAdmin ? "admin" : "",
        helper.isApproved ? "freigegeben" : "wartet",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [helpers, search, statusFilter, roleFilter, adminOnly]);

  const pendingCount = useMemo(
    () => helpers.filter((helper) => !helper.isApproved).length,
    [helpers]
  );

  const approvedCount = useMemo(
    () => helpers.filter((helper) => !!helper.isApproved).length,
    [helpers]
  );

  return (
    <main className="min-h-screen bg-gray-50 p-3 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-5">
        <section className="page-card p-4 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Helfer</h1>
              <p className="mt-2 text-sm text-gray-700">
                Freigaben, Rollen und Admin-Rechte verwalten.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 md:w-auto">
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Wartet
                </div>
                <div className="mt-1 text-xl font-bold text-amber-900">
                  {pendingCount}
                </div>
              </div>

              <div className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-center">
                <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
                  Freigegeben
                </div>
                <div className="mt-1 text-xl font-bold text-green-900">
                  {approvedCount}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="page-card p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Suche
              </label>
              <input
                type="text"
                placeholder="Name, E-Mail, Ort, Telefon ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
                className="w-full rounded-xl border px-3 py-3"
              >
                <option value="ALLE">Alle</option>
                <option value="WARTET">Wartet auf Freigabe</option>
                <option value="FREIGEGEBEN">Freigegeben</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Rolle
              </label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as FilterRole)}
                className="w-full rounded-xl border px-3 py-3"
              >
                <option value="ALLE">Alle</option>
                <option value="PILOT">Pilot</option>
                <option value="SUCHER">Sucher</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              id="adminOnly"
              type="checkbox"
              checked={adminOnly}
              onChange={(e) => setAdminOnly(e.target.checked)}
            />
            <label htmlFor="adminOnly" className="text-sm font-medium text-gray-800">
              Nur Admins anzeigen
            </label>
          </div>
        </section>

        {loading ? (
          <section className="page-card p-6 text-sm text-gray-700">
            Helfer werden geladen...
          </section>
        ) : filteredHelpers.length === 0 ? (
          <section className="page-card p-6 text-sm text-gray-700">
            Keine passenden Helfer gefunden.
          </section>
        ) : (
          <div className="space-y-3">
            {filteredHelpers.map((helper) => {
              const isSaving = savingId === helper.id;
              const isOpen = openHelperId === helper.id;

              return (
                <section key={helper.id} className="page-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenHelperId((prev) => (prev === helper.id ? null : helper.id))
                    }
                    className="flex w-full items-start justify-between gap-3 p-4 text-left md:p-5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-900 md:text-xl">
                          {fullName(helper)}
                        </h2>

                        <span
                          className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusBadge(
                            helper.isApproved
                          )}`}
                        >
                          {helper.isApproved ? "Freigegeben" : "Wartet auf Freigabe"}
                        </span>

                        <span
                          className={`rounded-full border px-3 py-1 text-sm font-semibold ${roleBadge(
                            helper.role
                          )}`}
                        >
                          {helper.role === "PILOT" ? "Pilot" : "Sucher"}
                        </span>

                        {helper.isAdmin && (
                          <span className="rounded-full border border-purple-300 bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-900">
                            Admin
                          </span>
                        )}
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="page-card-muted px-3 py-2 text-sm text-gray-900">
                          <span className="font-semibold">E-Mail:</span>{" "}
                          {helper.email}
                        </div>

                        <div className="page-card-muted px-3 py-2 text-sm text-gray-900">
                          <span className="font-semibold">Telefon:</span>{" "}
                          {helper.phone || "-"}
                        </div>

                        <div className="page-card-muted px-3 py-2 text-sm text-gray-900">
                          <span className="font-semibold">Ort:</span>{" "}
                          {[helper.zip || "", helper.city || ""].join(" ").trim() || "-"}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 rounded-full border border-gray-300 px-3 py-1 text-sm font-semibold text-gray-700">
                      {isOpen ? "−" : "+"}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-200 px-4 pb-4 pt-4 md:px-5 md:pb-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 xl:flex-1">
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="page-card-muted px-3 py-2 text-sm text-gray-900 sm:col-span-2 lg:col-span-3">
                              <span className="font-semibold">Adresse:</span>{" "}
                              {helper.street || "-"}
                            </div>

                            <div className="page-card-muted px-3 py-2 text-sm text-gray-900">
                              <span className="font-semibold">Registriert:</span>{" "}
                              {formatDate(helper.createdAt)}
                            </div>
                          </div>
                        </div>

                        <div className="w-full xl:max-w-sm">
                          <div className="grid gap-3">
                            <div className="page-card-muted p-3">
                              <label className="mb-2 block text-sm font-semibold text-gray-900">
                                Rolle
                              </label>
                              <select
                                value={helper.role}
                                onChange={(e) =>
                                  updateHelper(helper, {
                                    role: e.target.value as "PILOT" | "SUCHER",
                                  })
                                }
                                disabled={isSaving}
                                className="w-full rounded-xl border px-3 py-3"
                              >
                                <option value="PILOT">Pilot</option>
                                <option value="SUCHER">Sucher</option>
                              </select>
                            </div>

                            <div className="page-card-muted p-3">
  <label className="mb-2 block text-sm font-semibold text-gray-900">
    Auto-Verteilungs-Priorität
  </label>
  <select
    value={helper.autoAssignPriority ?? 0}
    onChange={(e) =>
      updateHelper(helper, {
        autoAssignPriority: Number(e.target.value),
      })
    }
    disabled={isSaving}
    className="w-full rounded-xl border px-3 py-3"
  >
    <option value={0}>Normal</option>
    <option value={1}>Bevorzugt</option>
    <option value={2}>Wichtig</option>
    <option value={3}>Sehr wichtig</option>
  </select>
</div>

{helper.role === "PILOT" && (
  <label className="page-card-muted flex items-center gap-3 p-3">
    <input
      type="checkbox"
      checked={!!helper.isPrimaryPilot}
      onChange={(e) =>
        updateHelper(helper, {
          isPrimaryPilot: e.target.checked,
        })
      }
      disabled={isSaving}
    />
    <span className="text-sm font-semibold text-gray-900">
      Hauptpilot
    </span>
  </label>
)}

                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="page-card-muted flex items-center gap-3 p-3">
                                <input
                                  type="checkbox"
                                  checked={!!helper.isApproved}
                                  onChange={(e) =>
                                    updateHelper(helper, {
                                      isApproved: e.target.checked,
                                    })
                                  }
                                  disabled={isSaving}
                                />
                                <span className="text-sm font-semibold text-gray-900">
                                  Freigegeben
                                </span>
                              </label>

                              <label className="page-card-muted flex items-center gap-3 p-3">
                                <input
                                  type="checkbox"
                                  checked={!!helper.isAdmin}
                                  onChange={(e) =>
                                    updateHelper(helper, {
                                      isAdmin: e.target.checked,
                                    })
                                  }
                                  disabled={isSaving}
                                />
                                <span className="text-sm font-semibold text-gray-900">
                                  Admin
                                </span>
                              </label>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <button
                                type="button"
                                onClick={() =>
                                  updateHelper(helper, {
                                    isApproved: !helper.isApproved,
                                  })
                                }
                                disabled={isSaving}
                                className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                {helper.isApproved
                                  ? "Freigabe entfernen"
                                  : "Freigeben"}
                              </button>

                              <button
                                type="button"
                                onClick={() => resetPassword(helper)}
                                disabled={isSaving}
                                className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 disabled:opacity-50"
                              >
                                Passwort setzen
                              </button>

                              <button
                                type="button"
                                onClick={() => deleteHelper(helper)}
                                disabled={isSaving}
                                className="sm:col-span-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 disabled:opacity-50"
                              >
                                Helfer löschen
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}