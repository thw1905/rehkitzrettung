"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";




const OrdersMapView = dynamic(
  () => import("@/components/orders/orders-map-view"),
  { ssr: false }
);

type Props = {
  isAdmin: boolean;
};

type Stats = {
  orders: {
    total: number;
    open: number;
    inProgress: number;
    done: number;
  };
};

type Pinpoint = {
  id: string;
  latitude: number;
  longitude: number;
  status: "OFFEN" | "ERREICHT" | "ERLEDIGT";
};

type Order = {
  id: string;
  title: string;
  orderCode?: string | null;
  status: "OFFEN" | "IN_ARBEIT" | "ERLEDIGT";
  notes: string | null;
  mowingDate: string | null;
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
  };
  team: {
    id: string;
    name: string;
  } | null;
  field: {
    id: string;
    name: string;
    displayName?: string | null;
    areaGeoJson: any;
    locationLatitude?: number | null;
    locationLongitude?: number | null;
  };
  pinpoints?: Pinpoint[];
};

type User = {
  id: string;
  firstName: string;
  lastName: string;
  role: "PILOT" | "SUCHER";
};

type DashboardTeam = {
  id: string;
  name: string;
  pilot: User | null;
  members: {
    id: string;
    user: User;
  }[];
};

type TeamPerformance = {
  teamName: string;
  pilotName: string | null;
  searchersText: string | null;
  orderCount: number;
  totalAreaSqm: number;
  totalMinutes: number;
  totalHa: number;
  avgMinPerHa: number;
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
};

type AssignmentReasonItem = {
  reason: string;
};

type AssignmentReasons = {
  date: string;
  pilotAssignments: AssignmentReasonItem[];
  helperAssignments: AssignmentReasonItem[];
  orderAssignments: AssignmentReasonItem[];
};

async function readJsonResponse<T>(res: Response, label: string): Promise<T> {
  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await res.text();
    console.error(`Keine JSON Antwort bei ${label}:`, text);
    throw new Error(`${label} liefert keine JSON-Antwort.`);
  }

  return (await res.json()) as T;
}

function isToday(dateString: string | null) {
  if (!dateString) return false;

  const date = new Date(dateString);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPerson(user: User | null, roleLabel: string) {
  if (!user) return null;
  return `${user.firstName} ${user.lastName} (${roleLabel})`;
}

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function normalizeTeamsFromPlanningResponse(data: any): DashboardTeam[] {
  const rawTeams = Array.isArray(data)
    ? data
    : Array.isArray(data?.assignments)
      ? data.assignments
      : Array.isArray(data?.operationDayTeams)
        ? data.operationDayTeams
        : Array.isArray(data?.teams)
          ? data.teams
          : [];

  return rawTeams.map((item: any, index: number) => {
    const rawMembers = Array.isArray(item.members)
      ? item.members
      : Array.isArray(item.searchers)
        ? item.searchers
        : Array.isArray(item.helpers)
          ? item.helpers
          : [];

    return {
      id: item.id || item.teamId || item.team?.id || `team-${index}`,
      name:
        item.name ||
        item.teamName ||
        item.team?.name ||
        `Team ${index + 1}`,
      pilot: item.pilot
        ? {
            id: item.pilot.id,
            firstName: item.pilot.firstName,
            lastName: item.pilot.lastName,
            role: item.pilot.role || "PILOT",
          }
        : null,
      members: rawMembers
        .map((member: any, memberIndex: number) => {
          const user =
            member.user ||
            member.helper ||
            member.searcher ||
            member;

          if (!user?.id && !member?.userId) return null;

          return {
            id:
              member.id ||
              member.userId ||
              `${item.id || item.teamId || index}-${memberIndex}`,
            user: {
              id: user.id || member.userId,
              firstName: user.firstName || "",
              lastName: user.lastName || "",
              role: user.role || "SUCHER",
            },
          };
        })
        .filter(Boolean) as DashboardTeam["members"],
    };
  });
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "slate" | "red" | "yellow" | "green";
}) {
  const toneClasses = {
    slate: "border-slate-200 bg-slate-50 text-slate-900",
    red: "border-red-200 bg-red-50 text-red-800",
    yellow: "border-yellow-200 bg-yellow-50 text-yellow-800",
    green: "border-green-200 bg-green-50 text-green-800",
  };

  return (
    <div className={`page-card-muted p-4 ${toneClasses[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function sortReasonItems(items: AssignmentReasonItem[]) {
  return [...items].sort((a, b) => a.reason.localeCompare(b.reason, "de"));
}

function getVisibleReasonItems(items: AssignmentReasonItem[], limit = 5) {
  const sorted = sortReasonItems(items);
  return {
    visible: sorted.slice(0, limit),
    hiddenCount: Math.max(0, sorted.length - limit),
  };
}

export default function DashboardPageClient({ isAdmin }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [teams, setTeams] = useState<DashboardTeam[]>([]);
  const [performance, setPerformance] = useState<TeamPerformance[]>([]);
  const [loadingStats, setLoadingStats] = useState(isAdmin);
  const [loadingMap, setLoadingMap] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(isAdmin);
  const [loadingPerformance, setLoadingPerformance] = useState(isAdmin);
  const [assignmentReasons, setAssignmentReasons] =
    useState<AssignmentReasons | null>(null);
  const [loadingReasons, setLoadingReasons] = useState(isAdmin);


  async function loadOrders() {
    try {
      const res = await fetch(isAdmin ? "/api/orders/all" : "/api/orders", {
        cache: "no-store",
      });

      const data = await readJsonResponse<any>(res, "orders");
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setOrders([]);
    } finally {
      setLoadingMap(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, [isAdmin]);

  useEffect(() => {
    const streamUrl = isAdmin ? "/api/orders/all/stream" : "/api/orders/stream";
    const eventSource = new EventSource(streamUrl);

    const reload = () => {
      loadOrders();
    };

    eventSource.addEventListener("orders_changed", reload);

    eventSource.onerror = (error) => {
      console.error("SSE Dashboard Fehler:", error);
    };

    return () => {
      eventSource.removeEventListener("orders_changed", reload);
      eventSource.close();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    async function loadStats() {
      try {
        const res = await fetch("/api/dashboard-stats", { cache: "no-store" });
        const data = await readJsonResponse<Stats>(res, "dashboard-stats");
        setStats(data);
      } catch (error) {
        console.error(error);
        setStats(null);
      } finally {
        setLoadingStats(false);
      }
    }

    async function loadTeams() {
      try {
        const today = getTodayDateString();
        const res = await fetch(`/api/team-planning?date=${today}`, {
          cache: "no-store",
        });

        const data = await readJsonResponse<any>(res, "team-planning");
        setTeams(normalizeTeamsFromPlanningResponse(data));
      } catch (error) {
        console.error(error);
        setTeams([]);
      } finally {
        setLoadingTeams(false);
      }
    }

    async function loadPerformance() {
      try {
        const res = await fetch("/api/dashboard-team-performance", {
          cache: "no-store",
        });

        const data = await readJsonResponse<any>(
          res,
          "dashboard-team-performance"
        );
        setPerformance(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
        setPerformance([]);
      } finally {
        setLoadingPerformance(false);
      }
    }

    async function loadAssignmentReasons() {
      try {
        const today = getTodayDateString();
        const res = await fetch(
          `/api/dashboard-assignment-reasons?date=${today}`,
          { cache: "no-store" }
        );

        const data = await readJsonResponse<AssignmentReasons>(
          res,
          "dashboard-assignment-reasons"
        );
        setAssignmentReasons(data);
      } catch (error) {
        console.error(error);
        setAssignmentReasons(null);
      } finally {
        setLoadingReasons(false);
      }
    }

    loadStats();
    loadTeams();
    loadPerformance();
    loadAssignmentReasons();
  }, [isAdmin]);

  const adminActiveOrders = useMemo(
    () => orders.filter((order) => order.status !== "ERLEDIGT"),
    [orders]
  );

  const todayOrdersForNonAdmin = useMemo(
    () =>
      orders.filter(
        (order) => order.status !== "ERLEDIGT" && isToday(order.mowingDate)
      ),
    [orders]
  );

  const pilotReasonSection = useMemo(() => {
    return getVisibleReasonItems(assignmentReasons?.pilotAssignments || [], 5);
  }, [assignmentReasons]);

  const helperReasonSection = useMemo(() => {
    return getVisibleReasonItems(assignmentReasons?.helperAssignments || [], 5);
  }, [assignmentReasons]);

  const orderReasonSection = useMemo(() => {
    return getVisibleReasonItems(assignmentReasons?.orderAssignments || [], 5);
  }, [assignmentReasons]);

  return (
    <main className="bg-gray-50">
      <div className="mx-auto max-w-7xl space-y-4 p-3 md:space-y-5 md:p-5">
        {isAdmin ? (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Aktiv"
                value={
                  loadingStats || !stats
                    ? "-"
                    : stats.orders.open + stats.orders.inProgress
                }
                tone="slate"
              />
              <StatCard
                label="Offen"
                value={loadingStats || !stats ? "-" : stats.orders.open}
                tone="red"
              />
              <StatCard
                label="In Arbeit"
                value={loadingStats || !stats ? "-" : stats.orders.inProgress}
                tone="yellow"
              />
              <StatCard
                label="Erledigt"
                value={loadingStats || !stats ? "-" : stats.orders.done}
                tone="green"
              />
            </section>

            <section className="page-card p-4 md:p-5">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900">
                  Teamübersicht
                </h2>
                <p className="mt-1 text-sm text-gray-700">
                  Aktuelle Besetzung der Teams für heute.
                </p>
              </div>

            

              {loadingTeams ? (
                <div className="text-sm text-gray-700">
                  Teams werden geladen...
                </div>
              ) : teams.length === 0 ? (
                <div className="text-sm text-gray-700">
                  Für heute ist noch keine Teamplanung vorhanden.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {teams.map((team) => (
                    <div key={team.id} className="page-card-muted p-4">
                      <div className="text-base font-semibold text-gray-900">
                        {team.name}
                      </div>

                      <div className="mt-3 space-y-2 text-sm text-gray-800">
                        <div className="rounded-lg bg-white px-3 py-2">
                          {team.pilot
                            ? formatPerson(team.pilot, "Pilot")
                            : "Kein Pilot zugeordnet"}
                        </div>

                        {team.members.length === 0 ? (
                          <div className="rounded-lg bg-white px-3 py-2 text-gray-500">
                            Keine Sucher zugeordnet
                          </div>
                        ) : (
                          team.members.map((member) => (
                            <div
                              key={member.id}
                              className="rounded-lg bg-white px-3 py-2"
                            >
                              {formatPerson(member.user, "Sucher")}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            

            <section className="page-card p-4 md:p-5">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900">
                  Tagesleistung Teams
                </h2>
                <p className="mt-1 text-sm text-gray-700">
                  Heute abgeschlossene Flächen, Zeit und Wilddaten.
                </p>
              </div>

              {loadingPerformance ? (
                <div className="text-sm text-gray-700">
                  Leistungsdaten werden geladen...
                </div>
              ) : performance.length === 0 ? (
                <div className="text-sm text-gray-700">
                  Heute wurden noch keine Aufträge abgeschlossen.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {performance.map((item) => (
                    <div key={item.teamName} className="page-card-muted p-4">
                      <div className="text-base font-semibold text-gray-900">
                        {item.teamName}
                      </div>

                      <div className="mt-3 space-y-2 text-sm text-gray-800">
                        {item.pilotName && (
                          <div className="rounded-lg bg-white px-3 py-2">
                            {item.pilotName} (Pilot)
                          </div>
                        )}
                        {item.searchersText && (
                          <div className="rounded-lg bg-white px-3 py-2">
                            {item.searchersText}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs font-medium text-gray-600">
                            Flächen
                          </div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {item.orderCount}
                          </div>
                        </div>

                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs font-medium text-gray-600">
                            Hektar
                          </div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {formatNumber(item.totalHa)} ha
                          </div>
                        </div>

                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs font-medium text-gray-600">
                            Zeit
                          </div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {formatMinutes(item.totalMinutes)}
                          </div>
                        </div>

                        <div className="rounded-lg bg-white p-3">
                          <div className="text-xs font-medium text-gray-600">
                            Ø min/ha
                          </div>
                          <div className="mt-1 font-semibold text-gray-900">
                            {formatNumber(item.avgMinPerHa)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                          <div className="text-xs font-medium text-green-700">
                            Rehkitze gesichert
                          </div>
                          <div className="mt-1 font-semibold text-green-800">
                            {item.rehkitzeGesichert}
                          </div>
                        </div>

                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <div className="text-xs font-medium text-amber-700">
                            Rehkitze abgesprungen
                          </div>
                          <div className="mt-1 font-semibold text-amber-800">
                            {item.rehkitzeAbgesprungen}
                          </div>
                        </div>

                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                          <div className="text-xs font-medium text-emerald-700">
                            Sonstiges Wild gesichert
                          </div>
                          <div className="mt-1 font-semibold text-emerald-800">
                            {item.sonstigesWildGesichert}
                          </div>
                        </div>

                        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                          <div className="text-xs font-medium text-orange-700">
                            Sonstiges Wild abgesprungen
                          </div>
                          <div className="mt-1 font-semibold text-orange-800">
                            {item.sonstigesWildAbgesprungen}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="page-card p-4 md:p-5">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900">
                  Warum wurde so verteilt?
                </h2>
                <p className="mt-1 text-sm text-gray-700">
                  Nachvollziehbare Gründe für Team-, Helfer- und
                  Auftragszuordnung.
                </p>
              </div>

              {loadingReasons ? (
                <div className="text-sm text-gray-700">
                  Zuweisungsgründe werden geladen...
                </div>
              ) : !assignmentReasons ? (
                <div className="text-sm text-gray-700">
                  Keine Zuweisungsgründe verfügbar.
                </div>
              ) : (
                <div className="grid gap-3 xl:grid-cols-3">
                  <ReasonCard
                    title="Piloten"
                    empty="Keine Pilotenzuordnungen vorhanden."
                    section={pilotReasonSection}
                    prefix="pilot"
                  />
                  <ReasonCard
                    title="Helfer"
                    empty="Keine Helferzuordnungen vorhanden."
                    section={helperReasonSection}
                    prefix="helper"
                  />
                  <ReasonCard
                    title="Aufträge"
                    empty="Keine Auftragszuordnungen vorhanden."
                    section={orderReasonSection}
                    prefix="order"
                  />
                </div>
              )}
            </section>

            <section className="page-card overflow-hidden p-0">
              <div className="border-b border-gray-200 px-4 py-4 md:px-5">
                <h2 className="text-lg font-bold text-gray-900">
                  Aktive Aufträge
                </h2>
                <p className="mt-1 text-sm text-gray-700">
                  Offene und laufende Flächen auf der Karte.
                </p>
              </div>

              {loadingMap ? (
                <div className="p-6 text-sm text-gray-700">
                  Karte wird geladen...
                </div>
              ) : adminActiveOrders.length === 0 ? (
                <div className="p-6 text-sm text-gray-700">
                  Keine offenen oder laufenden Aufträge vorhanden.
                </div>
              ) : (
                <div className="map-wrapper h-[55vh] md:h-[70vh]">
                  <OrdersMapView orders={adminActiveOrders}isAdmin={isAdmin} />
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="page-card overflow-hidden p-0">
            <div className="border-b border-gray-200 px-4 py-4 md:px-5">
              <h2 className="text-lg font-bold text-gray-900">
                Heutige Aufträge
              </h2>
              <p className="mt-1 text-sm text-gray-700">
                Nur offene und laufende Flächen des heutigen Tages.
              </p>
            </div>

            {loadingMap ? (
              <div className="p-6 text-sm text-gray-700">
                Karte wird geladen...
              </div>
            ) : todayOrdersForNonAdmin.length === 0 ? (
              <div className="p-6 text-sm text-gray-700">
                Für heute gibt es keine offenen Aufträge.
              </div>
            ) : (
              <div className="map-wrapper h-[60vh] md:h-[78vh]">
                <OrdersMapView orders={todayOrdersForNonAdmin}isAdmin={isAdmin} />
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function ReasonCard({
  title,
  empty,
  section,
  prefix,
}: {
  title: string;
  empty: string;
  section: {
    visible: AssignmentReasonItem[];
    hiddenCount: number;
  };
  prefix: string;
}) {
  return (
    <div className="page-card-muted p-4">
      <div className="mb-3 text-sm font-semibold text-gray-900">{title}</div>

      {section.visible.length === 0 ? (
        <div className="text-sm text-gray-600">{empty}</div>
      ) : (
        <div className="space-y-2">
          {section.visible.map((item, index) => (
            <div
              key={`${prefix}-${index}`}
              className="rounded-lg bg-white px-3 py-2 text-sm text-gray-800"
            >
              {item.reason}
            </div>
          ))}

          {section.hiddenCount > 0 && (
            <div className="text-sm text-gray-500">
              + {section.hiddenCount} weitere
            </div>
          )}
        </div>
      )}
    </div>
  );
}