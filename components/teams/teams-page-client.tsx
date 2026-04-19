"use client";

import { useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  firstName: string;
  lastName: string;
  role: "PILOT" | "SUCHER";
  isAdmin: boolean;
};

type Team = {
  id: string;
  name: string;
  pilot: User;
  copilot: User | null;
  members: {
    id: string;
    user: User;
  }[];
};

type EditableTeam = Team & {
  editedName: string;
  editedPilotId: string;
  editedSearcherIds: string[];
};

type AvailableUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "PILOT" | "SUCHER";
  isAdmin: boolean;
  availabilityStatus: "OFFEN" | "ZUGESAGT" | "ABGESAGT" | "VIELLEICHT";
  availabilityNote?: string | null;
};

type AvailableUsersResponse = {
  date: string;
  pilots: AvailableUser[];
  searchers: AvailableUser[];
};

function hasAvailabilityStatus(
  user: User | AvailableUser
): user is AvailableUser {
  return "availabilityStatus" in user;
}

function getAssignedUserIds(teams: EditableTeam[], excludeTeamId?: string) {
  const assigned = new Set<string>();

  teams.forEach((team) => {
    if (excludeTeamId && team.id === excludeTeamId) return;

    assigned.add(team.editedPilotId || team.pilot.id);

    team.editedSearcherIds.forEach((userId) => {
      assigned.add(userId);
    });
  });

  return assigned;
}

function formatAvailabilityStatus(status: AvailableUser["availabilityStatus"]) {
  if (status === "ZUGESAGT") return "Zugesagt";
  if (status === "VIELLEICHT") return "Vielleicht";
  if (status === "ABGESAGT") return "Abgesagt";
  return "Offen";
}

function getAvailabilityBadgeClass(status: AvailableUser["availabilityStatus"]) {
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

function getTodayDateInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

export default function TeamsPageClient() {
  const [teams, setTeams] = useState<EditableTeam[]>([]);
  const [name, setName] = useState("");
  const [pilotId, setPilotId] = useState("");
  const [searcherIds, setSearcherIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(getTodayDateInputValue());
  const [availablePilots, setAvailablePilots] = useState<AvailableUser[]>([]);
  const [availableSearchers, setAvailableSearchers] = useState<AvailableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAvailableUsers, setLoadingAvailableUsers] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function loadTeams() {
    const teamsRes = await fetch("/api/teams", { cache: "no-store" });
    const teamsData: Team[] = await teamsRes.json();

    const preparedTeams: EditableTeam[] = teamsData.map((team) => ({
      ...team,
      editedName: team.name,
      editedPilotId: team.pilot.id,
      editedSearcherIds: team.members.map((member) => member.user.id),
    }));

    setTeams(preparedTeams);
  }

  async function loadAvailableUsers(date: string) {
    if (!date) {
      setAvailablePilots([]);
      setAvailableSearchers([]);
      return;
    }

    setLoadingAvailableUsers(true);

    try {
      const res = await fetch(
        `/api/teams/available-users?date=${encodeURIComponent(date)}`,
        { cache: "no-store" }
      );
      const data: AvailableUsersResponse & { error?: string } = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || "Verfügbare Benutzer konnten nicht geladen werden."
        );
      }

      setAvailablePilots(Array.isArray(data.pilots) ? data.pilots : []);
      setAvailableSearchers(Array.isArray(data.searchers) ? data.searchers : []);
    } catch (error: any) {
      console.error("Fehler beim Laden verfügbarer Benutzer:", error);
      alert(error?.message || "Verfügbare Benutzer konnten nicht geladen werden.");
      setAvailablePilots([]);
      setAvailableSearchers([]);
    } finally {
      setLoadingAvailableUsers(false);
    }
  }

  async function loadData() {
    setLoading(true);

    try {
      await Promise.all([loadTeams(), loadAvailableUsers(selectedDate)]);
    } catch (error) {
      console.error("Fehler beim Laden:", error);
      alert("Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadAvailableUsers(selectedDate);
  }, [selectedDate]);

  const assignedForCreate = useMemo(() => getAssignedUserIds(teams), [teams]);

  const availablePilotsForCreate = useMemo(
    () => availablePilots.filter((user) => !assignedForCreate.has(user.id)),
    [availablePilots, assignedForCreate]
  );

  const availableSearchersForCreate = useMemo(
    () =>
      availableSearchers.filter(
        (user) =>
          (!assignedForCreate.has(user.id) || searcherIds.includes(user.id)) &&
          user.id !== pilotId
      ),
    [availableSearchers, assignedForCreate, searcherIds, pilotId]
  );

  function getAvailablePilotsForEdit(teamId: string, team: EditableTeam) {
    const assigned = getAssignedUserIds(teams, teamId);

    const base = availablePilots.filter((user) => !assigned.has(user.id));

    const currentPilot =
      availablePilots.find((u) => u.id === team.editedPilotId) ||
      (team.pilot.id === team.editedPilotId ? team.pilot : null);

    if (currentPilot && !base.some((u) => u.id === currentPilot.id)) {
      return [...base, currentPilot];
    }

    return base;
  }

  function getAvailableSearchersForEdit(teamId: string, team: EditableTeam) {
    const assigned = getAssignedUserIds(teams, teamId);

    const base = availableSearchers.filter(
      (user) =>
        (!assigned.has(user.id) || team.editedSearcherIds.includes(user.id)) &&
        user.id !== team.editedPilotId
    );

    const currentMembers = team.members.map((m) => m.user);

    for (const user of currentMembers) {
      if (
        user.id !== team.editedPilotId &&
        team.editedSearcherIds.includes(user.id) &&
        !base.some((u) => u.id === user.id)
      ) {
        base.push({
          ...user,
          email: "",
          availabilityStatus: "OFFEN",
          availabilityNote: "Aktuell nicht verfügbar oder ohne Rückmeldung",
        });
      }
    }

    return base;
  }

  function toggleCreateSearcher(id: string) {
    setSearcherIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }

      if (prev.length >= 6) {
        alert("Maximal 6 Sucher pro Team.");
        return prev;
      }

      return [...prev, id];
    });
  }

  function toggleEditSearcher(teamId: string, userId: string) {
    setTeams((prev) =>
      prev.map((team) => {
        if (team.id !== teamId) return team;

        const exists = team.editedSearcherIds.includes(userId);

        if (exists) {
          return {
            ...team,
            editedSearcherIds: team.editedSearcherIds.filter((id) => id !== userId),
          };
        }

        if (team.editedSearcherIds.length >= 6) {
          alert("Maximal 6 Sucher pro Team.");
          return team;
        }

        return {
          ...team,
          editedSearcherIds: [...team.editedSearcherIds, userId],
        };
      })
    );
  }

  function updateLocalTeam(
    id: string,
    changes: Partial<
      Pick<EditableTeam, "editedName" | "editedPilotId" | "editedSearcherIds">
    >
  ) {
    setTeams((prev) =>
      prev.map((team) =>
        team.id === id
          ? {
              ...team,
              ...changes,
            }
          : team
      )
    );
  }

  async function createTeam() {
    if (!selectedDate) {
      alert("Bitte zuerst einen Einsatztag auswählen.");
      return;
    }

    if (!name.trim()) {
      alert("Bitte Teamname eingeben.");
      return;
    }

    if (!pilotId) {
      alert("Bitte Pilot auswählen.");
      return;
    }

    if (searcherIds.length < 1) {
      alert("Bitte mindestens einen Sucher auswählen.");
      return;
    }

    setCreating(true);

    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          pilotId,
          copilotId: "",
          searcherIds,
          planningDate: selectedDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Team konnte nicht gespeichert werden.");
        return;
      }

      setName("");
      setPilotId("");
      setSearcherIds([]);
      await loadData();
      alert("Team gespeichert");
    } catch (error) {
      console.error("Fehler beim Speichern:", error);
      alert("Technischer Fehler beim Erstellen des Teams.");
    } finally {
      setCreating(false);
    }
  }

  async function saveTeam(team: EditableTeam) {
    if (!selectedDate) {
      alert("Bitte zuerst einen Einsatztag auswählen.");
      return;
    }

    if (!team.editedName.trim()) {
      alert("Bitte Teamname eingeben.");
      return;
    }

    if (!team.editedPilotId) {
      alert("Bitte Pilot auswählen.");
      return;
    }

    if (team.editedSearcherIds.length < 1) {
      alert("Bitte mindestens einen Sucher auswählen.");
      return;
    }

    setSavingId(team.id);

    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: team.editedName,
          pilotId: team.editedPilotId,
          copilotId: "",
          searcherIds: team.editedSearcherIds,
          planningDate: selectedDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Speichern fehlgeschlagen");
        return;
      }

      await loadData();
      alert("Team gespeichert");
    } catch (error) {
      console.error("Fehler beim Speichern:", error);
      alert("Technischer Fehler beim Speichern des Teams.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteTeam(id: string, name: string) {
    const confirmed = window.confirm(
      `Möchtest du das Team "${name}" wirklich löschen?`
    );

    if (!confirmed) return;

    setSavingId(id);

    try {
      const res = await fetch(`/api/teams/${id}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        alert(data?.error || "Löschen fehlgeschlagen");
        return;
      }

      await loadData();
      alert("Team gelöscht");
    } catch (error) {
      console.error("Fehler beim Löschen:", error);
      alert("Technischer Fehler beim Löschen des Teams.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-4 md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-7">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">Teams</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600 md:text-base">
            Teams werden für einen ausgewählten Tag geplant. In der Auswahl
            erscheinen nur Personen mit Zusage oder Vielleicht. Ein Pilot kann
            auch als Sucher eingesetzt werden.
          </p>

          <div className="mt-5 max-w-sm">
            <label className="mb-2 block text-sm font-semibold text-gray-900">
              Einsatztag
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-base"
            />
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Neues Team anlegen
          </h2>

          {!selectedDate ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Bitte zuerst einen Einsatztag auswählen.
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Teamname
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                placeholder="z. B. Team Nord"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Pilot
              </label>
              <select
                value={pilotId}
                onChange={(e) => setPilotId(e.target.value)}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                disabled={!selectedDate || loadingAvailableUsers}
              >
                <option value="">
                  {loadingAvailableUsers
                    ? "Verfügbare Piloten werden geladen..."
                    : "Bitte auswählen"}
                </option>

                {availablePilotsForCreate.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.lastName}, {user.firstName}
                    {user.availabilityStatus === "VIELLEICHT" ? " (vielleicht)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-900">
                Sucher auswählen (1 bis 6)
              </label>

              {!selectedDate ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  Bitte zuerst einen Einsatztag auswählen.
                </div>
              ) : loadingAvailableUsers ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  Verfügbare Personen werden geladen...
                </div>
              ) : availableSearchersForCreate.length === 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Für diesen Tag gibt es keine verfügbaren Personen.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {availableSearchersForCreate.map((user) => (
                    <PersonOptionCard
                      key={user.id}
                      user={user}
                      checked={searcherIds.includes(user.id)}
                      onChange={() => toggleCreateSearcher(user.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={createTeam}
                className="rounded-2xl bg-black px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
                disabled={creating || !selectedDate}
              >
                {creating ? "Speichert..." : "Team speichern"}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Vorhandene Teams
          </h2>

          {loading ? (
            <p className="mt-4 text-sm text-gray-600">Teams werden geladen...</p>
          ) : teams.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">Noch keine Teams vorhanden.</p>
          ) : (
            <div className="mt-4 space-y-6">
              {teams.map((team) => {
                const originalSearcherIds = team.members.map((m) => m.user.id).sort();
                const editedSearcherIdsSorted = [...team.editedSearcherIds].sort();

                const hasChanges =
                  team.name !== team.editedName ||
                  team.pilot.id !== team.editedPilotId ||
                  JSON.stringify(originalSearcherIds) !==
                    JSON.stringify(editedSearcherIdsSorted);

                const availablePilotsForEdit = getAvailablePilotsForEdit(team.id, team);
                const availableSearchersForEdit = getAvailableSearchersForEdit(
                  team.id,
                  team
                );

                return (
                  <div
                    key={team.id}
                    className="space-y-4 rounded-3xl border border-gray-200 p-4 md:p-5"
                  >
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">
                        Teamname
                      </label>
                      <input
                        value={team.editedName}
                        onChange={(e) =>
                          updateLocalTeam(team.id, { editedName: e.target.value })
                        }
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">
                        Pilot
                      </label>
                      <select
                        value={team.editedPilotId}
                        onChange={(e) =>
                          updateLocalTeam(team.id, {
                            editedPilotId: e.target.value,
                          })
                        }
                        className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                        disabled={!selectedDate || loadingAvailableUsers}
                      >
                        <option value="">Bitte auswählen</option>

                        {availablePilotsForEdit.map((user) => (
  <option key={user.id} value={user.id}>
    {user.lastName}, {user.firstName}
    {hasAvailabilityStatus(user) && user.availabilityStatus === "VIELLEICHT"
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

                      {!selectedDate ? (
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                          Bitte zuerst einen Einsatztag auswählen.
                        </div>
                      ) : loadingAvailableUsers ? (
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                          Verfügbare Personen werden geladen...
                        </div>
                      ) : availableSearchersForEdit.length === 0 ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          Für diesen Tag gibt es keine passenden Personen.
                        </div>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                          {availableSearchersForEdit.map((user) => (
                            <PersonOptionCard
                              key={user.id}
                              user={user}
                              checked={team.editedSearcherIds.includes(user.id)}
                              onChange={() => toggleEditSearcher(team.id, user.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => saveTeam(team)}
                        className="rounded-2xl bg-black px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
                        disabled={savingId === team.id || !hasChanges || !selectedDate}
                      >
                        {savingId === team.id ? "Speichert..." : "Speichern"}
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteTeam(team.id, team.name)}
                        className="rounded-2xl border border-red-300 px-5 py-3 text-base font-semibold text-red-700"
                        disabled={savingId === team.id}
                      >
                        Löschen
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}