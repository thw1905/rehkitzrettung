"use client";

import { useEffect, useMemo, useState } from "react";

type ImportResult = {
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  totalFeatures: number;
  message: string;
};

type Hegering = {
  id: string;
  name: string;
  isActive: boolean;
};

type RevierPachter = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
};

type RevierPachterAssignment = {
  id: string;
  pachterId: string;
  revierId: string;
  pachter: RevierPachter;
};

type Revier = {
  id: string;
  externalId?: string | null;
  name: string;
  nummer?: string | null;
  hegeringId?: string | null;
  hegering?: Hegering | null;
  isActive: boolean;
  paechter?: RevierPachterAssignment[];
};

function getRevierLabel(revier: Revier) {
  const nummer = (revier.nummer || "").trim();
  const name = (revier.name || "").trim();

  if (nummer && name) return `${nummer} · ${name}`;
  if (nummer) return nummer;
  if (name) return name;
  return "Unbekanntes Revier";
}

function getPachterName(pachter: RevierPachter) {
  return `${pachter.firstName} ${pachter.lastName}`.trim();
}

export default function RevierePageClient() {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const [reviere, setReviere] = useState<Revier[]>([]);
  const [paechter, setPaechter] = useState<RevierPachter[]>([]);
  const [hegeringe, setHegeringe] = useState<Hegering[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingRevierId, setSavingRevierId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [hegeringDrafts, setHegeringDrafts] = useState<Record<string, string>>(
    {}
  );
  const [activeDrafts, setActiveDrafts] = useState<Record<string, boolean>>({});

  const [selectedPachterByRevier, setSelectedPachterByRevier] = useState<
    Record<string, string>
  >({});

  const filteredReviere = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return reviere;

    return reviere.filter((revier) => {
      const label = getRevierLabel(revier).toLowerCase();
      const hegeringText = revier.hegering?.name?.toLowerCase() || "";
      const activeText = revier.isActive ? "aktiv" : "inaktiv";

      const paechterText = (revier.paechter || [])
        .map((item) => getPachterName(item.pachter))
        .join(" ")
        .toLowerCase();

      return (
        label.includes(q) ||
        hegeringText.includes(q) ||
        activeText.includes(q) ||
        paechterText.includes(q)
      );
    });
  }, [reviere, search]);

  async function loadData() {
    setLoading(true);

    try {
      const [reviereRes, paechterRes, hegeringeRes] = await Promise.all([
        fetch("/api/reviere", { cache: "no-store" }),
        fetch("/api/revier-paechter", { cache: "no-store" }),
        fetch("/api/hegeringe", { cache: "no-store" }),
      ]);

      const reviereData = await reviereRes.json();
      const paechterData = await paechterRes.json();
      const hegeringeData = await hegeringeRes.json();

      if (!reviereRes.ok) {
        throw new Error(
          reviereData?.error || "Reviere konnten nicht geladen werden."
        );
      }

      if (!paechterRes.ok) {
        throw new Error(
          paechterData?.error || "Revierpächter konnten nicht geladen werden."
        );
      }

      if (!hegeringeRes.ok) {
        throw new Error(
          hegeringeData?.error || "Hegeringe konnten nicht geladen werden."
        );
      }

      const normalizedReviere: Revier[] = Array.isArray(reviereData)
        ? reviereData
        : [];

      setReviere(normalizedReviere);
      setPaechter(Array.isArray(paechterData) ? paechterData : []);
      setHegeringe(Array.isArray(hegeringeData) ? hegeringeData : []);

      const nameNext: Record<string, string> = {};
      const hegeringNext: Record<string, string> = {};
      const activeNext: Record<string, boolean> = {};

      for (const revier of normalizedReviere) {
        nameNext[revier.id] = revier.name || "";
        hegeringNext[revier.id] = revier.hegeringId || "";
        activeNext[revier.id] = revier.isActive !== false;
      }

      setNameDrafts(nameNext);
      setHegeringDrafts(hegeringNext);
      setActiveDrafts(activeNext);
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

  async function importReviere() {
    const confirmed = window.confirm(
      "Möchtest du die Jagdbezirke/Reviere vom Landkreis Harburg importieren oder aktualisieren?"
    );

    if (!confirmed) return;

    setImporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/reviere/import-lk-harburg", {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error || "Reviere konnten nicht importiert werden."
        );
      }

      setResult(data);
      alert(data?.message || "Reviere wurden importiert.");

      await loadData();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Reviere konnten nicht importiert werden.");
    } finally {
      setImporting(false);
    }
  }

  async function saveRevier(revier: Revier) {
    const nextName = (nameDrafts[revier.id] || "").trim();

    if (!nextName) {
      alert("Bitte einen Reviernamen eingeben.");
      return;
    }

    setSavingRevierId(revier.id);

    try {
      const res = await fetch(`/api/reviere/${revier.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: nextName,
          hegeringId: hegeringDrafts[revier.id] || null,
          isActive: activeDrafts[revier.id] !== false,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Revier konnte nicht gespeichert werden.");
      }

      await loadData();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Revier konnte nicht gespeichert werden.");
    } finally {
      setSavingRevierId(null);
    }
  }

  async function addPachter(revier: Revier) {
    const pachterId = selectedPachterByRevier[revier.id] || "";

    if (!pachterId) {
      alert("Bitte einen Revierpächter auswählen.");
      return;
    }

    setSavingRevierId(revier.id);

    try {
      const res = await fetch(`/api/reviere/${revier.id}/paechter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pachterId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error || "Revierpächter konnte nicht hinzugefügt werden."
        );
      }

      setSelectedPachterByRevier((prev) => ({
        ...prev,
        [revier.id]: "",
      }));

      await loadData();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Revierpächter konnte nicht hinzugefügt werden.");
    } finally {
      setSavingRevierId(null);
    }
  }

  async function removePachter(revier: Revier, pachter: RevierPachter) {
    const confirmed = window.confirm(
      `Möchtest du ${getPachterName(pachter)} aus ${getRevierLabel(
        revier
      )} entfernen?`
    );

    if (!confirmed) return;

    setSavingRevierId(revier.id);

    try {
      const res = await fetch(
        `/api/reviere/${revier.id}/paechter/${pachter.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error || "Revierpächter konnte nicht entfernt werden."
        );
      }

      await loadData();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Revierpächter konnte nicht entfernt werden.");
    } finally {
      setSavingRevierId(null);
    }
  }

  const unassignedCount = reviere.filter(
    (revier) => !revier.paechter || revier.paechter.length === 0
  ).length;

  const noHegeringCount = reviere.filter((revier) => !revier.hegeringId).length;
  const activeCount = reviere.filter((revier) => revier.isActive !== false).length;
  const inactiveCount = reviere.length - activeCount;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Reviere / Jagdbezirke
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Hier kannst du die Reviergrenzen importieren, eigene Reviernamen
            vergeben, Hegeringe zuordnen, Reviere aktiv/inaktiv setzen und
            mehrere Revierpächter zuordnen.
          </p>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Landkreis Harburg importieren
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            Die Daten werden aus dem öffentlichen WFS-Dienst geladen. Die
            Reviernummer kommt aus ART_NR. Eigene Reviernamen bleiben bei
            späteren Importen erhalten.
          </p>

          <button
            type="button"
            onClick={importReviere}
            disabled={importing}
            className="mt-5 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {importing
              ? "Import läuft..."
              : "Reviere importieren / aktualisieren"}
          </button>

          {result && (
            <div className="mt-5 rounded-2xl border border-green-300 bg-green-50 p-4 text-sm text-green-900">
              <div className="font-semibold">{result.message}</div>
              <div className="mt-2">
                Gesamt: {result.totalFeatures} · Neu: {result.imported} ·
                Aktualisiert: {result.updated} · Übersprungen: {result.skipped}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Reviere verwalten
              </h2>

              <p className="mt-2 text-sm text-gray-600">
                ART_NR ist die Reviernummer. Der Name kann frei vergeben werden.
              </p>

              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-gray-700">
                  Gesamt: {reviere.length}
                </span>
                <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-green-900">
                  Aktiv: {activeCount}
                </span>
                <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-gray-700">
                  Inaktiv: {inactiveCount}
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">
                  Ohne Hegering: {noHegeringCount}
                </span>
                <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-orange-900">
                  Ohne Pächter: {unassignedCount}
                </span>
              </div>
            </div>

            <div className="w-full md:w-80">
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Suche
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Reviernummer, Name, Hegering oder Pächter..."
                className="w-full rounded-2xl border border-gray-300 px-4 py-3"
              />
            </div>
          </div>

          {loading ? (
            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Reviere werden geladen...
            </div>
          ) : reviere.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Noch keine Reviere vorhanden. Bitte zuerst importieren.
            </div>
          ) : paechter.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Es sind noch keine Revierpächter angelegt. Lege zuerst unter
              „Revierpächter“ Personen an.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {filteredReviere.map((revier) => {
                const assignedIds = new Set(
                  (revier.paechter || []).map((item) => item.pachterId)
                );

                const availablePaechter = paechter.filter(
                  (pachter) => !assignedIds.has(pachter.id)
                );

                const hegeringId = hegeringDrafts[revier.id] || "";
                const isActive = activeDrafts[revier.id] !== false;

                return (
                  <div
                    key={revier.id}
                    className={`rounded-2xl border p-4 ${
                      isActive
                        ? "border-gray-200 bg-gray-50"
                        : "border-gray-200 bg-white opacity-70"
                    }`}
                  >
                    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Reviername
                        </div>

                        <div className="mt-1 text-2xl font-bold text-gray-900">
                          {nameDrafts[revier.id] ||
                            revier.name ||
                            "Unbenanntes Revier"}
                        </div>

                        <div className="mt-1 text-sm font-semibold text-gray-500">
                          Reviernummer: {revier.nummer || "-"}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-bold ${
                              isActive
                                ? "border-green-200 bg-green-50 text-green-900"
                                : "border-gray-200 bg-white text-gray-700"
                            }`}
                          >
                            {isActive ? "aktiv" : "inaktiv"}
                          </span>

                          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-900">
                            Hegering:{" "}
                            {revier.hegering?.name || "nicht zugeordnet"}
                          </span>
                        </div>

                        <div className="mt-4 space-y-3">
                          <div>
                            <label className="mb-1 block text-sm font-semibold text-gray-900">
                              Reviername bearbeiten
                            </label>

                            <input
                              value={nameDrafts[revier.id] || ""}
                              onChange={(e) =>
                                setNameDrafts((prev) => ({
                                  ...prev,
                                  [revier.id]: e.target.value,
                                }))
                              }
                              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-semibold text-gray-900">
                              Hegering
                            </label>

                            <select
                              value={hegeringId}
                              onChange={(e) =>
                                setHegeringDrafts((prev) => ({
                                  ...prev,
                                  [revier.id]: e.target.value,
                                }))
                              }
                              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3"
                            >
                              <option value="">Kein Hegering</option>
                              {hegeringe.map((hegering) => (
                                <option key={hegering.id} value={hegering.id}>
                                  {hegering.name}
                                  {hegering.isActive ? "" : " (inaktiv)"}
                                </option>
                              ))}
                            </select>
                          </div>

                          <label className="flex items-center gap-2 rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900">
                            <input
                              type="checkbox"
                              checked={isActive}
                              onChange={(e) =>
                                setActiveDrafts((prev) => ({
                                  ...prev,
                                  [revier.id]: e.target.checked,
                                }))
                              }
                            />
                            Revier aktiv anzeigen
                          </label>

                          <button
                            type="button"
                            onClick={() => saveRevier(revier)}
                            disabled={savingRevierId === revier.id}
                            className="w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            {savingRevierId === revier.id
                              ? "Speichert..."
                              : "Revier speichern"}
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          Zugeordnete Pächter
                        </div>

                        {(revier.paechter || []).length === 0 ? (
                          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            Noch kein Pächter zugeordnet.
                          </div>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(revier.paechter || []).map((assignment) => (
                              <div
                                key={assignment.id}
                                className="flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-900"
                              >
                                <span>
                                  {getPachterName(assignment.pachter)}
                                </span>

                                <button
                                  type="button"
                                  onClick={() =>
                                    removePachter(revier, assignment.pachter)
                                  }
                                  disabled={savingRevierId === revier.id}
                                  className="rounded-full px-2 text-orange-900 hover:bg-orange-100 disabled:opacity-50"
                                  title="Pächter entfernen"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="mt-4">
                          <label className="mb-1 block text-sm font-semibold text-gray-900">
                            Pächter hinzufügen
                          </label>

                          <div className="flex gap-2">
                            <select
                              value={selectedPachterByRevier[revier.id] || ""}
                              onChange={(e) =>
                                setSelectedPachterByRevier((prev) => ({
                                  ...prev,
                                  [revier.id]: e.target.value,
                                }))
                              }
                              disabled={
                                savingRevierId === revier.id ||
                                availablePaechter.length === 0
                              }
                              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3"
                            >
                              <option value="">
                                {availablePaechter.length === 0
                                  ? "Alle Pächter zugeordnet"
                                  : "Bitte auswählen"}
                              </option>

                              {availablePaechter.map((pachter) => (
                                <option key={pachter.id} value={pachter.id}>
                                  {getPachterName(pachter)}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={() => addPachter(revier)}
                              disabled={
                                savingRevierId === revier.id ||
                                availablePaechter.length === 0
                              }
                              className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Hinzufügen
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredReviere.length === 0 && (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  Keine Reviere zur Suche gefunden.
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}