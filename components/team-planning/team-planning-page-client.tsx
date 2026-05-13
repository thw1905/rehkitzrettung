"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type AvailabilityStatus = "OFFEN" | "ZUGESAGT" | "ABGESAGT" | "VIELLEICHT";

type AvailableUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "PILOT" | "SUCHER";
  isAdmin: boolean;
  availabilityStatus: AvailabilityStatus;
  availabilityNote?: string | null;
};

type Assignment = {
  teamId: string;
  teamName: string;
  sortOrder: number;
  operationDayTeamId: string | null;
  pilot: {
    id: string;
    firstName: string;
    lastName: string;
    role: "PILOT" | "SUCHER";
    isAdmin: boolean;
  } | null;
  searchers: {
    id: string;
    firstName: string;
    lastName: string;
    role: "PILOT" | "SUCHER";
    isAdmin: boolean;
  }[];
  note: string;
};

type TeamPlanningResponse = {
  operationDay: {
    id: string;
    date: string;
    status: string;
    note: string;
  };
  pilots: AvailableUser[];
  searchers: AvailableUser[];
  assignments: Assignment[];
};

type EditableAssignment = Assignment & {
  editedPilotId: string;
  editedSearcherIds: string[];
  editedNote: string;
};

function getTodayDateInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatAvailabilityStatus(status: AvailabilityStatus) {
  if (status === "ZUGESAGT") return "Zugesagt";
  if (status === "VIELLEICHT") return "Vielleicht";
  if (status === "ABGESAGT") return "Abgesagt";
  return "Offen";
}

function getAvailabilityBadgeClass(status: AvailabilityStatus) {
  if (status === "ZUGESAGT") {
    return "border-green-300 bg-green-50 text-green-900";
  }

  if (status === "VIELLEICHT") {
    return "border-amber-300 bg-amber-50 text-amber-900";
  }

  if (status === "ABGESAGT") {
    return "border-red-300 bg-red-50 text-red-900";
  }

  return "border-gray-300 bg-gray-100 text-gray-800";
}

function hasChanges(team: EditableAssignment) {
  const originalSearcherIds = team.searchers.map((s) => s.id).sort();
  const editedSearcherIds = [...team.editedSearcherIds].sort();

  return (
    (team.pilot?.id || "") !== team.editedPilotId ||
    JSON.stringify(originalSearcherIds) !== JSON.stringify(editedSearcherIds) ||
    (team.note || "") !== team.editedNote
  );
}

function PersonOptionCard({
  user,
  checked,
  onChange,
}: {
  user: AvailableUser;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-1"
      />

      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900">
          {user.firstName} {user.lastName}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-600">
            {user.role === "PILOT" ? "Pilot" : "Sucher"}
            {user.isAdmin ? " · Admin" : ""}
          </span>

          <span
            className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${getAvailabilityBadgeClass(
              user.availabilityStatus
            )}`}
          >
            {formatAvailabilityStatus(user.availabilityStatus)}
          </span>
        </div>

        {user.availabilityNote && (
          <div className="mt-2 text-xs text-gray-500">
            Notiz: {user.availabilityNote}
          </div>
        )}
      </div>
    </label>
  );
}

export default function TeamPlanningPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialDate = searchParams.get("date") || getTodayDateInputValue();

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [operationDayId, setOperationDayId] = useState<string | null>(null);
  const [pilots, setPilots] = useState<AvailableUser[]>([]);
  const [searchers, setSearchers] = useState<AvailableUser[]>([]);
  const [assignments, setAssignments] = useState<EditableAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTeamId, setSavingTeamId] = useState<string | null>(null);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<
    string | null
  >(null);
  const [autoAssigning, setAutoAssigning] = useState(false);

  function handleDateChange(date: string) {
    setSelectedDate(date);
    router.replace(`/team-planning?date=${date}`);
  }

  async function loadPlanning(date: string) {
    setLoading(true);

    try {
      const res = await fetch(
        `/api/team-planning?date=${encodeURIComponent(date)}`,
        { cache: "no-store" }
      );

      const data: TeamPlanningResponse & { error?: string } = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Teamplanung konnte nicht geladen werden.");
      }

      setOperationDayId(data.operationDay.id);
      setPilots(Array.isArray(data.pilots) ? data.pilots : []);
      setSearchers(Array.isArray(data.searchers) ? data.searchers : []);
      setAssignments(
        (Array.isArray(data.assignments) ? data.assignments : []).map(
          (item) => ({
            ...item,
            editedPilotId: item.pilot?.id || "",
            editedSearcherIds: item.searchers.map((s) => s.id),
            editedNote: item.note || "",
          })
        )
      );
    } catch (error: any) {
      console.error("Fehler beim Laden der Teamplanung:", error);
      alert(error?.message || "Teamplanung konnte nicht geladen werden.");
      setOperationDayId(null);
      setPilots([]);
      setSearchers([]);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const nextDate = searchParams.get("date") || getTodayDateInputValue();

    if (nextDate !== selectedDate) {
      setSelectedDate(nextDate);
    }
  }, [searchParams, selectedDate]);

  useEffect(() => {
    loadPlanning(selectedDate);
  }, [selectedDate]);

  function updateAssignment(
    teamId: string,
    changes: Partial<
      Pick<
        EditableAssignment,
        "editedPilotId" | "editedSearcherIds" | "editedNote"
      >
    >
  ) {
    setAssignments((prev) =>
      prev.map((item) =>
        item.teamId === teamId
          ? {
              ...item,
              ...changes,
            }
          : item
      )
    );
  }

  function toggleSearcher(teamId: string, userId: string) {
    setAssignments((prev) =>
      prev.map((item) => {
        if (item.teamId !== teamId) return item;

        const exists = item.editedSearcherIds.includes(userId);

        if (exists) {
          return {
            ...item,
            editedSearcherIds: item.editedSearcherIds.filter(
              (id) => id !== userId
            ),
          };
        }

        if (item.editedSearcherIds.length >= 6) {
          alert("Maximal 6 Sucher pro Team.");
          return item;
        }

        return {
          ...item,
          editedSearcherIds: [...item.editedSearcherIds, userId],
        };
      })
    );
  }

  const globallyAssigned = useMemo(() => {
    const result = new Set<string>();

    for (const item of assignments) {
      if (item.editedPilotId) {
        result.add(item.editedPilotId);
      }

      for (const id of item.editedSearcherIds) {
        result.add(id);
      }
    }

    return result;
  }, [assignments]);

  function getAvailablePilotsForTeam(team: EditableAssignment) {
    return pilots.filter(
      (user) =>
        (!globallyAssigned.has(user.id) || user.id === team.editedPilotId) &&
        !team.editedSearcherIds.includes(user.id)
    );
  }

  function getAvailableSearchersForTeam(team: EditableAssignment) {
    const result = searchers.filter(
      (user) =>
        (!globallyAssigned.has(user.id) ||
          team.editedSearcherIds.includes(user.id)) &&
        user.id !== team.editedPilotId
    );

    const currentSearchers = team.searchers;

    for (const current of currentSearchers) {
      if (
        current.id !== team.editedPilotId &&
        team.editedSearcherIds.includes(current.id) &&
        !result.some((user) => user.id === current.id)
      ) {
        result.push({
          ...current,
          email: "",
          availabilityStatus: "OFFEN",
          availabilityNote: "Aktuell nicht verfügbar oder ohne Rückmeldung",
        });
      }
    }

    return result;
  }

  async function saveAssignment(team: EditableAssignment) {
    if (!selectedDate) {
      alert("Bitte zuerst ein Datum auswählen.");
      return;
    }

    if (!team.editedPilotId) {
      alert("Bitte einen Pilot auswählen.");
      return;
    }

    if (team.editedSearcherIds.length < 1) {
      alert("Bitte mindestens einen Sucher auswählen.");
      return;
    }

    setSavingTeamId(team.teamId);

    try {
      const res = await fetch("/api/team-planning", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: selectedDate,
          teamId: team.teamId,
          pilotId: team.editedPilotId,
          searcherIds: team.editedSearcherIds,
          note: team.editedNote,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Team konnte nicht gespeichert werden.");
      }

      await loadPlanning(selectedDate);
    } catch (error: any) {
      console.error("Fehler beim Speichern der Teamplanung:", error);
      alert(error?.message || "Team konnte nicht gespeichert werden.");
    } finally {
      setSavingTeamId(null);
    }
  }

  async function clearAssignment(team: EditableAssignment) {
    if (!team.operationDayTeamId) {
      updateAssignment(team.teamId, {
        editedPilotId: "",
        editedSearcherIds: [],
        editedNote: "",
      });
      return;
    }

    const confirmed = window.confirm(
      `Möchtest du die Besetzung von "${team.teamName}" für diesen Tag wirklich leeren?`
    );

    if (!confirmed) return;

    setDeletingAssignmentId(team.operationDayTeamId);

    try {
      const res = await fetch(`/api/team-planning/${team.operationDayTeamId}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Tages-Team konnte nicht gelöscht werden.");
      }

      await loadPlanning(selectedDate);
    } catch (error: any) {
      console.error("Fehler beim Löschen des Tages-Teams:", error);
      alert(error?.message || "Tages-Team konnte nicht gelöscht werden.");
    } finally {
      setDeletingAssignmentId(null);
    }
  }

  async function resetPlanning() {
    if (!selectedDate) {
      alert("Bitte zuerst ein Datum auswählen.");
      return;
    }

    const confirmed = window.confirm(
      "Möchtest du die komplette Tagesplanung wirklich löschen? Dabei werden Team-Zuordnungen und Auftrags-Zuordnungen für diesen Tag entfernt."
    );

    if (!confirmed) return;

    try {
      const res = await fetch("/api/team-planning/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: selectedDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Tagesplanung konnte nicht gelöscht werden.");
      }

      alert(data?.message || "Tagesplanung gelöscht.");

      if (selectedDate) {
        await loadPlanning(selectedDate);
      }
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Tagesplanung konnte nicht gelöscht werden.");
    }
  }

  async function autoAssignTeams() {
    if (!selectedDate) {
      alert("Bitte zuerst ein Datum auswählen.");
      return;
    }

    const confirmed = window.confirm(
      "Sollen die Teams für diesen Tag automatisch verteilt werden? Bereits vorhandene Tages-Teams und Auftragszuordnungen werden dabei überschrieben."
    );

    if (!confirmed) return;

    setAutoAssigning(true);

    try {
      const res = await fetch("/api/team-planning/auto-assign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: selectedDate,
          maxSearchersPerTeam: 6,
          minSearchersPerTeam: 1,
          includeVielleicht: true,
          overwriteExisting: true,
          assignOrders: true,
        }),
      });

      const contentType = res.headers.get("content-type") || "";

      let data: any = null;

      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || "Server liefert keine gültige JSON-Antwort.");
      }

      if (!res.ok) {
        throw new Error(
          data?.error || "Automatische Teamverteilung fehlgeschlagen."
        );
      }

      await loadPlanning(selectedDate);

      const warningText =
        Array.isArray(data?.warnings) && data.warnings.length > 0
          ? `\n\nHinweise:\n- ${data.warnings.join("\n- ")}`
          : "";

      const unassignedText =
        Array.isArray(data?.unassignedUsers) && data.unassignedUsers.length > 0
          ? `\n\nNicht zugeteilt:\n- ${data.unassignedUsers
              .map((u: any) => `${u.firstName} ${u.lastName}`)
              .join("\n- ")}`
          : "";

      alert(
        `Teams wurden automatisch verteilt.\n\nVerwendete Teams: ${
          data?.summary?.totalTeamsUsed ?? 0
        }\nZugewiesene Personen: ${
          data?.summary?.totalAssignedUsers ?? 0
        }\nZugewiesene Aufträge: ${
          data?.summary?.totalAssignedOrders ?? 0
        }${warningText}${unassignedText}`
      );
    } catch (error: any) {
      console.error("Fehler bei der automatischen Teamverteilung:", error);
      alert(error?.message || "Automatische Teamverteilung fehlgeschlagen.");
    } finally {
      setAutoAssigning(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-4 md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-7">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
            Teamplanung
          </h1>

          <p className="mt-2 text-sm leading-6 text-gray-600 md:text-base">
            Plane hier die Besetzung der Team-Slots für einen bestimmten
            Einsatztag. Es werden nur Personen mit Zusage oder Vielleicht
            berücksichtigt. Piloten können auch als Sucher eingesetzt werden.
          </p>

          <div className="mt-5 max-w-sm">
            <label className="mb-2 block text-sm font-semibold text-gray-900">
              Einsatztag
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-base"
            />
          </div>

          {operationDayId && (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              Einsatztag aktiv: {selectedDate}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={autoAssignTeams}
              disabled={autoAssigning}
              className="rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {autoAssigning ? "Verteilt..." : "Teams automatisch verteilen"}
            </button>

            <button
              type="button"
              onClick={resetPlanning}
              className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800"
            >
              Tagesplanung löschen
            </button>

            <Link
              href={`/day-assignments?date=${selectedDate}`}
              className="rounded-2xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
            >
              Weiter zur Auftragszuordnung
            </Link>
          </div>
        </section>

        {loading ? (
          <section className="rounded-3xl bg-white p-5 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Teamplanung wird geladen...
          </section>
        ) : assignments.length === 0 ? (
          <section className="rounded-3xl bg-white p-5 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Keine Team-Slots vorhanden.
          </section>
        ) : (
          <div className="space-y-4">
            {assignments.map((team) => {
              const availablePilots = getAvailablePilotsForTeam(team);
              const availableSearchers = getAvailableSearchersForTeam(team);

              return (
                <section
                  key={team.teamId}
                  className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        {team.teamName}
                      </h2>
                      <p className="mt-1 text-sm text-gray-600">
                        Tagesbesetzung für {selectedDate}
                      </p>
                    </div>

                    {team.operationDayTeamId && (
                      <span className="rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-semibold text-green-900">
                        Bereits geplant
                      </span>
                    )}
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">
                        Pilot
                      </label>
                      <select
                        value={team.editedPilotId}
                        onChange={(e) =>
                          updateAssignment(team.teamId, {
                            editedPilotId: e.target.value,
                          })
                        }
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                      >
                        <option value="">Bitte auswählen</option>
                        {availablePilots.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.lastName}, {user.firstName}
                            {user.availabilityStatus === "VIELLEICHT"
                              ? " (vielleicht)"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">
                        Sucher auswählen (1 bis 6)
                      </label>

                      {availableSearchers.length === 0 ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          Für diesen Tag gibt es keine verfügbaren Personen.
                        </div>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                          {availableSearchers.map((user) => (
                            <PersonOptionCard
                              key={user.id}
                              user={user}
                              checked={team.editedSearcherIds.includes(user.id)}
                              onChange={() =>
                                toggleSearcher(team.teamId, user.id)
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">
                        Notiz
                      </label>
                      <textarea
                        value={team.editedNote}
                        onChange={(e) =>
                          updateAssignment(team.teamId, {
                            editedNote: e.target.value,
                          })
                        }
                        className="min-h-[100px] w-full rounded-2xl border border-gray-300 px-4 py-3"
                        placeholder="Optional, z. B. besondere Hinweise zur Teamplanung"
                      />
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => clearAssignment(team)}
                        disabled={
                          deletingAssignmentId === team.operationDayTeamId ||
                          savingTeamId === team.teamId
                        }
                        className="rounded-2xl border border-red-300 px-5 py-3 text-base font-semibold text-red-700 disabled:opacity-50"
                      >
                        {deletingAssignmentId === team.operationDayTeamId
                          ? "Löscht..."
                          : "Leeren"}
                      </button>

                      <button
                        type="button"
                        onClick={() => saveAssignment(team)}
                        disabled={
                          savingTeamId === team.teamId || !hasChanges(team)
                        }
                        className="rounded-2xl bg-black px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
                      >
                        {savingTeamId === team.teamId
                          ? "Speichert..."
                          : "Speichern"}
                      </button>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}