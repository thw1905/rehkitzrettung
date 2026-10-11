"use client";

import { useEffect, useMemo, useState } from "react";

type AvailabilityStatus = "OFFEN" | "ZUGESAGT" | "ABGESAGT" | "VIELLEICHT";

type HelperRole = "PILOT" | "SUCHER";

type HelperOption = {
  id: string;
  name: string;
  role: HelperRole;
  isAdmin: boolean;
};

type AvailabilityRow = {
  id: string;
  date: string;
  userId: string;
  helperName: string;
  helperRole: HelperRole;
  isAdmin: boolean;
  status: AvailabilityStatus;
  note: string | null;
  hasEntry: boolean;
  updatedAt: string | null;
  createdAt: string | null;
};

type AssignmentOrder = {
  id: string;
  orderCode?: string | null;
  title: string;
  status: string;
  mowingDate?: string | null;
  executionDate?: string | null;
  fieldLabel: string;
  label: string;
};

type AssignmentRow = {
  id: string;
  date: string;
  operationDayTeamId: string;
  teamId: string;
  teamName: string;
  userId: string;
  helperName: string;
  helperRole: HelperRole;
  roleInTeam: "PILOT" | "SUCHER";
  assignedAt: string | null;
  assignmentCreatedAt: string | null;
  assignmentUpdatedAt: string | null;
  orders: AssignmentOrder[];
};

type HelperStatisticsResponse = {
  range: {
    from: string;
    to: string;
  };
  users: HelperOption[];
  summary: {
    helpers: number;
    availabilityRows: number;
    availabilityCounts: Record<AvailabilityStatus, number>;
    assignmentRows: number;
    assignedHelpers: number;
    assignedTeams: number;
  };
  availabilityRows: AvailabilityRow[];
  assignmentRows: AssignmentRow[];
};

type Props = {
  from: string;
  to: string;
};

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAvailabilityStatus(status: AvailabilityStatus) {
  if (status === "ZUGESAGT") return "Verfügbar";
  if (status === "VIELLEICHT") return "Vielleicht";
  if (status === "ABGESAGT") return "Nicht verfügbar";
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

function getRoleLabel(role: string) {
  if (role === "PILOT") return "Pilot";
  if (role === "SUCHER") return "Sucher";
  return role || "-";
}

function includesText(text: string, search: string) {
  if (!search.trim()) return true;

  return text.toLowerCase().includes(search.trim().toLowerCase());
}

function StatBox({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "green" | "amber" | "red" | "blue" | "purple";
}) {
  const toneClasses = {
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    green: "border-green-200 bg-green-50 text-green-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    purple: "border-purple-200 bg-purple-50 text-purple-900",
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <div className="text-xs font-bold uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-2xl font-extrabold">{value}</div>
    </div>
  );
}

export default function HelperStatisticsSection({ from, to }: Props) {
  const [data, setData] = useState<HelperStatisticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const [helperFrom, setHelperFrom] = useState(from);
  const [helperTo, setHelperTo] = useState(to);

  const [activeTab, setActiveTab] = useState<"availability" | "assignments">(
    "availability"
  );

  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [helperRole, setHelperRole] = useState("");
  const [availabilityStatus, setAvailabilityStatus] = useState("");
  const [teamId, setTeamId] = useState("");
  const [roleInTeam, setRoleInTeam] = useState("");

  async function loadHelperStatistics(customFrom?: string, customTo?: string) {
    const fromValue = customFrom ?? helperFrom;
    const toValue = customTo ?? helperTo;

    if (!fromValue || !toValue) {
      alert("Bitte Von- und Bis-Datum auswählen.");
      return;
    }

    if (fromValue > toValue) {
      alert("Das Von-Datum darf nicht nach dem Bis-Datum liegen.");
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams({
        from: fromValue,
        to: toValue,
      });

      const res = await fetch(`/api/statistics/helpers?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(
          json?.error || "Helfer-Statistik konnte nicht geladen werden."
        );
      }

      setData(json);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Helfer-Statistik konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setHelperFrom(from);
    setHelperTo(to);
  }, [from, to]);

  useEffect(() => {
    if (!isOpen) return;
    if (!helperFrom || !helperTo) return;
    if (helperFrom > helperTo) return;

    const timeout = window.setTimeout(() => {
      loadHelperStatistics(helperFrom, helperTo);
    }, 400);

    return () => {
      window.clearTimeout(timeout);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, helperFrom, helperTo]);

  const users = data?.users || [];

  const teamOptions = useMemo(() => {
    const map = new Map<string, string>();

    for (const row of data?.assignmentRows || []) {
      map.set(row.teamId, row.teamName);
    }

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [data]);

  const assignmentKeySet = useMemo(() => {
    const result = new Set<string>();

    for (const row of data?.assignmentRows || []) {
      result.add(`${row.date}|${row.userId}`);
    }

    return result;
  }, [data]);

  const filteredAvailabilityRows = useMemo(() => {
    const rows = data?.availabilityRows || [];

    return rows.filter((row) => {
      if (userId && row.userId !== userId) return false;
      if (helperRole && row.helperRole !== helperRole) return false;
      if (availabilityStatus && row.status !== availabilityStatus) return false;

      const isAssigned = assignmentKeySet.has(`${row.date}|${row.userId}`);

      const haystack = [
        row.date,
        row.helperName,
        row.helperRole,
        row.status,
        row.note || "",
        row.hasEntry
          ? "rückmeldung ja gemeldet eingetragen"
          : "rückmeldung nein nicht gemeldet kein eintrag",
        isAssigned ? "eingeteilt ja" : "eingeteilt nein",
      ].join(" ");

      return includesText(haystack, search);
    });
  }, [
    data,
    search,
    userId,
    helperRole,
    availabilityStatus,
    assignmentKeySet,
  ]);

  const filteredAssignmentRows = useMemo(() => {
    const rows = data?.assignmentRows || [];

    return rows.filter((row) => {
      if (userId && row.userId !== userId) return false;
      if (helperRole && row.helperRole !== helperRole) return false;
      if (teamId && row.teamId !== teamId) return false;
      if (roleInTeam && row.roleInTeam !== roleInTeam) return false;

      const haystack = [
        row.date,
        row.helperName,
        row.helperRole,
        row.roleInTeam,
        row.teamName,
        row.orders.map((order) => order.label).join(" "),
      ].join(" ");

      return includesText(haystack, search);
    });
  }, [data, search, userId, helperRole, teamId, roleInTeam]);

  function resetFilters() {
    setSearch("");
    setUserId("");
    setHelperRole("");
    setAvailabilityStatus("");
    setTeamId("");
    setRoleInTeam("");
  }

  function toggleOpen() {
    setIsOpen((prev) => !prev);
  }

  return (
    <section className="print-section rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:p-5">
      <button
        type="button"
        onClick={toggleOpen}
        className="flex w-full flex-col gap-3 text-left md:flex-row md:items-start md:justify-between"
      >
        <div>
          <h2 className="text-xl font-extrabold text-gray-900">
            Helfer-Auswertung
          </h2>

          <p className="mt-1 text-sm text-gray-600">
            Verfügbarkeit pro Tag und Team-Einteilungen im gewählten Zeitraum.
          </p>
        </div>

        <div className="no-print flex items-center gap-2 rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-900">
          <span>{isOpen ? "Zuklappen" : "Aufklappen"}</span>
          <span className="text-lg leading-none">{isOpen ? "▲" : "▼"}</span>
        </div>
      </button>

      {isOpen && (
        <>
          <div className="no-print mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => loadHelperStatistics()}
              disabled={
                loading || !helperFrom || !helperTo || helperFrom > helperTo
              }
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-900 disabled:opacity-50"
            >
              {loading ? "Lade..." : "Neu laden"}
            </button>
          </div>

          {!data ? (
            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              {loading
                ? "Helfer-Auswertung wird geladen..."
                : "Keine Daten geladen."}
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <StatBox
                  label="Helfer"
                  value={data.summary.helpers}
                  tone="slate"
                />

                <StatBox
                  label="Verfügbar"
                  value={data.summary.availabilityCounts.ZUGESAGT}
                  tone="green"
                />

                <StatBox
                  label="Vielleicht"
                  value={data.summary.availabilityCounts.VIELLEICHT}
                  tone="amber"
                />

                <StatBox
                  label="Nicht verfügbar"
                  value={data.summary.availabilityCounts.ABGESAGT}
                  tone="red"
                />

                <StatBox
                  label="Offen"
                  value={data.summary.availabilityCounts.OFFEN}
                  tone="blue"
                />

                <StatBox
                  label="Team-Einteilungen"
                  value={data.summary.assignmentRows}
                  tone="purple"
                />
              </div>

              <div className="no-print mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-4 grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      Von
                    </label>

                    <input
                      type="date"
                      value={helperFrom}
                      onChange={(event) => setHelperFrom(event.target.value)}
                      className="w-full rounded-xl border px-3 py-3"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      Bis
                    </label>

                    <input
                      type="date"
                      value={helperTo}
                      onChange={(event) => setHelperTo(event.target.value)}
                      className="w-full rounded-xl border px-3 py-3"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => loadHelperStatistics()}
                      disabled={
                        loading ||
                        !helperFrom ||
                        !helperTo ||
                        helperFrom > helperTo
                      }
                      className="w-full rounded-xl bg-black px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {loading ? "Lade..." : "Zeitraum laden"}
                    </button>
                  </div>
                </div>

                {helperFrom > helperTo && (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
                    Das Von-Datum darf nicht nach dem Bis-Datum liegen.
                  </div>
                )}

                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("availability")}
                    className={`rounded-xl px-4 py-2 text-sm font-bold ${
                      activeTab === "availability"
                        ? "bg-black text-white"
                        : "bg-white text-gray-900 ring-1 ring-gray-200"
                    }`}
                  >
                    Verfügbarkeit
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("assignments")}
                    className={`rounded-xl px-4 py-2 text-sm font-bold ${
                      activeTab === "assignments"
                        ? "bg-black text-white"
                        : "bg-white text-gray-900 ring-1 ring-gray-200"
                    }`}
                  >
                    Team-Einteilungen
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
                  <div className="lg:col-span-2">
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      Suche
                    </label>

                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Name, Team, Auftrag, Notiz ..."
                      className="w-full rounded-xl border px-3 py-3"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      Helfer
                    </label>

                    <select
                      value={userId}
                      onChange={(event) => setUserId(event.target.value)}
                      className="w-full rounded-xl border px-3 py-3"
                    >
                      <option value="">Alle</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      Rolle
                    </label>

                    <select
                      value={helperRole}
                      onChange={(event) => setHelperRole(event.target.value)}
                      className="w-full rounded-xl border px-3 py-3"
                    >
                      <option value="">Alle</option>
                      <option value="PILOT">Pilot</option>
                      <option value="SUCHER">Sucher</option>
                    </select>
                  </div>

                  {activeTab === "availability" ? (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">
                        Status
                      </label>

                      <select
                        value={availabilityStatus}
                        onChange={(event) =>
                          setAvailabilityStatus(event.target.value)
                        }
                        className="w-full rounded-xl border px-3 py-3"
                      >
                        <option value="">Alle</option>
                        <option value="ZUGESAGT">Verfügbar</option>
                        <option value="VIELLEICHT">Vielleicht</option>
                        <option value="ABGESAGT">Nicht verfügbar</option>
                        <option value="OFFEN">Offen</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-900">
                        Team
                      </label>

                      <select
                        value={teamId}
                        onChange={(event) => setTeamId(event.target.value)}
                        className="w-full rounded-xl border px-3 py-3"
                      >
                        <option value="">Alle</option>
                        {teamOptions.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-900"
                    >
                      Filter zurücksetzen
                    </button>
                  </div>
                </div>

                {activeTab === "assignments" && (
                  <div className="mt-3 max-w-xs">
                    <label className="mb-2 block text-sm font-semibold text-gray-900">
                      Rolle im Team
                    </label>

                    <select
                      value={roleInTeam}
                      onChange={(event) => setRoleInTeam(event.target.value)}
                      className="w-full rounded-xl border px-3 py-3"
                    >
                      <option value="">Alle</option>
                      <option value="PILOT">Pilot</option>
                      <option value="SUCHER">Sucher</option>
                    </select>
                  </div>
                )}
              </div>

              {activeTab === "availability" ? (
                <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200">
                  <div className="bg-gray-100 px-4 py-3 text-sm font-bold text-gray-900">
                    Verfügbarkeit: {filteredAvailabilityRows.length} Einträge
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[950px] text-left text-sm text-gray-900">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-700">
                        <tr>
                          <th className="px-4 py-3">Datum</th>
                          <th className="px-4 py-3">Helfer</th>
                          <th className="px-4 py-3">Rolle</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Notiz</th>
                          <th className="px-4 py-3">Rückmeldung</th>
                          <th className="px-4 py-3">Eingeteilt</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-200 bg-white">
                        {filteredAvailabilityRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-4 py-5 text-center text-gray-600"
                            >
                              Keine Verfügbarkeiten gefunden.
                            </td>
                          </tr>
                        ) : (
                          filteredAvailabilityRows.map((row) => {
                            const isAssigned = assignmentKeySet.has(
                              `${row.date}|${row.userId}`
                            );

                            return (
                              <tr key={row.id}>
                                <td className="px-4 py-3 font-semibold">
                                  {formatDate(row.date)}
                                </td>

                                <td className="px-4 py-3 font-semibold">
                                  {row.helperName}
                                </td>

                                <td className="px-4 py-3">
                                  {getRoleLabel(row.helperRole)}
                                  {row.isAdmin ? " · Admin" : ""}
                                </td>

                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getAvailabilityBadgeClass(
                                      row.status
                                    )}`}
                                  >
                                    {formatAvailabilityStatus(row.status)}
                                  </span>
                                </td>

                                <td className="px-4 py-3">
                                  {row.note || (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  {row.hasEntry ? (
                                    <span className="font-semibold text-green-800">
                                      Ja
                                    </span>
                                  ) : (
                                    <span className="font-semibold text-gray-500">
                                      Nein
                                    </span>
                                  )}
                                </td>

                                <td className="px-4 py-3">
                                  {isAssigned ? (
                                    <span className="font-semibold text-blue-800">
                                      Ja
                                    </span>
                                  ) : (
                                    <span className="font-semibold text-gray-500">
                                      Nein
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200">
                  <div className="bg-gray-100 px-4 py-3 text-sm font-bold text-gray-900">
                    Team-Einteilungen: {filteredAssignmentRows.length} Einträge
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] text-left text-sm text-gray-900">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-700">
                        <tr>
                          <th className="px-4 py-3">Datum</th>
                          <th className="px-4 py-3">Helfer</th>
                          <th className="px-4 py-3">Rolle im Team</th>
                          <th className="px-4 py-3">Team</th>
                          <th className="px-4 py-3">Aufträge</th>
                          <th className="px-4 py-3">Eingeteilt am</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-gray-200 bg-white">
                        {filteredAssignmentRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-4 py-5 text-center text-gray-600"
                            >
                              Keine Team-Einteilungen gefunden.
                            </td>
                          </tr>
                        ) : (
                          filteredAssignmentRows.map((row) => (
                            <tr key={row.id}>
                              <td className="px-4 py-3 font-semibold">
                                {formatDate(row.date)}
                              </td>

                              <td className="px-4 py-3 font-semibold">
                                {row.helperName}
                              </td>

                              <td className="px-4 py-3">
                                {getRoleLabel(row.roleInTeam)}
                              </td>

                              <td className="px-4 py-3 font-semibold">
                                {row.teamName}
                              </td>

                              <td className="px-4 py-3">
                                {row.orders.length === 0 ? (
                                  <span className="text-gray-400">
                                    Noch kein Auftrag zugeordnet
                                  </span>
                                ) : (
                                  <div className="space-y-1">
                                    {row.orders.map((order) => (
                                      <div key={order.id}>
                                        <span className="font-semibold">
                                          {order.orderCode || order.title}
                                        </span>
                                        {order.fieldLabel ? (
                                          <span className="text-gray-600">
                                            {" "}
                                            · {order.fieldLabel}
                                          </span>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>

                              <td className="px-4 py-3">
                                {formatDateTime(row.assignedAt)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}