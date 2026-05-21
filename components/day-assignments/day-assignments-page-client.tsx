"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { area } from "@turf/area";

type User = {
  id: string;
  firstName: string;
  lastName: string;
  role: "PILOT" | "SUCHER";
  isAdmin: boolean;
};

type DayTeam = {
  id: string;
  teamId: string;
  team: {
    id: string;
    name: string;
    sortOrder: number;
  };
  pilot: User | null;
  members: {
    id: string;
    user: User;
  }[];
  orders: {
    id: string;
  }[];
};

type OrderItem = {
  id: string;
  title: string;
  orderCode?: string | null;
  status: string;
  sortOrder?: number | null;
  notes?: string | null;
  owner: {
    firstName: string;
    lastName: string;
  };
  field: {
  name: string;
  displayName?: string | null;
  areaGeoJson?: GeoJSON.Feature<GeoJSON.Polygon> | null;
};
  operationDayTeam: DayTeam | null;
  team: {
    id: string;
    name: string;
  } | null;
};

type ResponseData = {
  operationDay: {
    id: string;
    date: string;
    status: string;
    meetingTime?: string;
  };
  orders: OrderItem[];
  dayTeams: DayTeam[];
};

function getTodayDateInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getOrderLabel(order: OrderItem) {
  return order.orderCode || order.title || "Ohne Nummer";
}

function getFieldLabel(order: OrderItem) {
  const displayName = (order.field.displayName || "").trim();
  const name = (order.field.name || "").trim();

  if (displayName && name) return `${displayName} (${name})`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function getFieldAreaHectare(order: OrderItem) {
  if (!order.field?.areaGeoJson) return 0;

  try {
    const sqm = area(order.field.areaGeoJson);
    const hectare = sqm / 10000;

    if (!Number.isFinite(hectare) || hectare <= 0) {
      return 0;
    }

    return hectare;
  } catch {
    return 0;
  }
}

function formatHectare(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "-";

  return `${value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ha`;
}

function getTeamTotalHectare(dayTeam: DayTeam, orders: OrderItem[]) {
  return orders
    .filter((order) => order.operationDayTeam?.id === dayTeam.id)
    .reduce((sum, order) => sum + getFieldAreaHectare(order), 0);
}

function getTeamLabel(dayTeam: DayTeam) {
  const pilot = dayTeam.pilot
    ? `${dayTeam.pilot.firstName} ${dayTeam.pilot.lastName}`
    : "ohne Pilot";

  const searcherCount = dayTeam.members.length;

  return `${dayTeam.team.name} · ${pilot} · ${searcherCount} Sucher`;
}

function compareOrdersForTeam(a: OrderItem, b: OrderItem) {
  const sortA = typeof a.sortOrder === "number" ? a.sortOrder : 0;
  const sortB = typeof b.sortOrder === "number" ? b.sortOrder : 0;

  if (sortA !== sortB) return sortA - sortB;

  return getOrderLabel(a).localeCompare(getOrderLabel(b), "de");
}

export default function DayAssignmentsPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialDate = searchParams.get("date") || getTodayDateInputValue();

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [dayTeams, setDayTeams] = useState<DayTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);
  const [savingOrderTeamId, setSavingOrderTeamId] = useState<string | null>(
    null
  );
  const [notifying, setNotifying] = useState(false);
  const [meetingTime, setMeetingTime] = useState("");
  const [savingMeetingTime, setSavingMeetingTime] = useState(false);

  function handleDateChange(date: string) {
    setSelectedDate(date);
    router.replace(`/day-assignments?date=${date}`);
  }

  async function loadData(date: string) {
    setLoading(true);

    try {
      const res = await fetch(
        `/api/day-assignments?date=${encodeURIComponent(date)}`,
        { cache: "no-store" }
      );

      const data: ResponseData & { error?: string } = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Tages-Zuordnung konnte nicht geladen werden.");
      }

      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setDayTeams(Array.isArray(data.dayTeams) ? data.dayTeams : []);
      setMeetingTime(data.operationDay?.meetingTime || "");
    } catch (error: any) {
      console.error("Fehler beim Laden:", error);
      alert(error?.message || "Tages-Zuordnung konnte nicht geladen werden.");
      setOrders([]);
      setDayTeams([]);
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
    loadData(selectedDate);
  }, [selectedDate]);

  const ordersByTeamId = useMemo(() => {
    const map = new Map<string, OrderItem[]>();

    for (const order of orders) {
      const teamId = order.operationDayTeam?.id;

      if (!teamId) continue;

      const list = map.get(teamId) || [];
      list.push(order);
      map.set(teamId, list);
    }

    for (const [teamId, list] of map.entries()) {
      map.set(teamId, [...list].sort(compareOrdersForTeam));
    }

    return map;
  }, [orders]);

  const unassignedOrders = useMemo(() => {
    return orders.filter((order) => !order.operationDayTeam?.id);
  }, [orders]);

  async function assignOrder(orderId: string, operationDayTeamId: string) {
    setSavingOrderId(orderId);

    try {
      const res = await fetch(`/api/day-assignments/${orderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operationDayTeamId: operationDayTeamId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Auftrag konnte nicht zugewiesen werden.");
      }

      await loadData(selectedDate);
    } catch (error: any) {
      console.error("Fehler beim Zuweisen:", error);
      alert(error?.message || "Auftrag konnte nicht zugewiesen werden.");
    } finally {
      setSavingOrderId(null);
    }
  }

  async function moveOrderInTeam(
    dayTeam: DayTeam,
    orderIndex: number,
    direction: "up" | "down"
  ) {
    const teamOrders = [...(ordersByTeamId.get(dayTeam.id) || [])];

    if (teamOrders.length < 2) return;

    const targetIndex = direction === "up" ? orderIndex - 1 : orderIndex + 1;

    if (targetIndex < 0 || targetIndex >= teamOrders.length) return;

    const temp = teamOrders[orderIndex];
    teamOrders[orderIndex] = teamOrders[targetIndex];
    teamOrders[targetIndex] = temp;

    setSavingOrderTeamId(dayTeam.id);

    setOrders((prev) => {
      const orderPosition = new Map(
        teamOrders.map((order, index) => [order.id, index + 1])
      );

      return prev.map((order) => {
        const nextPosition = orderPosition.get(order.id);

        if (!nextPosition) return order;

        return {
          ...order,
          sortOrder: nextPosition,
        };
      });
    });

    try {
      const res = await fetch("/api/orders/reorder", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operationDayTeamId: dayTeam.id,
          orderIds: teamOrders.map((order) => order.id),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error || "Auftragsreihenfolge konnte nicht gespeichert werden."
        );
      }

      await loadData(selectedDate);
    } catch (error: any) {
      console.error("Fehler beim Speichern der Reihenfolge:", error);
      alert(error?.message || "Auftragsreihenfolge konnte nicht gespeichert werden.");
      await loadData(selectedDate);
    } finally {
      setSavingOrderTeamId(null);
    }
  }

  async function saveMeetingTime(value: string) {
    setMeetingTime(value);
    setSavingMeetingTime(true);

    try {
      const res = await fetch("/api/operation-days/meeting-time", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: selectedDate,
          meetingTime: value,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error || "Treffzeit konnte nicht gespeichert werden."
        );
      }
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Treffzeit konnte nicht gespeichert werden.");
    } finally {
      setSavingMeetingTime(false);
    }
  }

  async function notifyTeams() {
    const confirmed = window.confirm(
      `Möchtest du alle Teammitglieder für den ${selectedDate} benachrichtigen?`
    );

    if (!confirmed) return;

    setNotifying(true);

    try {
      const res = await fetch("/api/web-push/notify-operation-day", {
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
        throw new Error(
          data?.error || "Benachrichtigung konnte nicht gesendet werden."
        );
      }

      alert(
        `Benachrichtigung gesendet.\nNutzer: ${data.notifiedUsers}\nPushs: ${data.sentPushes}`
      );
    } catch (error: any) {
      console.error("Fehler beim Benachrichtigen:", error);
      alert(error?.message || "Benachrichtigung konnte nicht gesendet werden.");
    } finally {
      setNotifying(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-4 md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-7">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
            Aufträge zu Team-Slots
          </h1>

          <p className="mt-2 text-sm leading-6 text-gray-600 md:text-base">
            Weise hier die Aufträge eines Tages den geplanten Tages-Teams zu und
            lege die Reihenfolge pro Team fest.
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

          <div className="mt-4 max-w-sm">
            <label className="mb-2 block text-sm font-semibold text-gray-900">
              Treffzeit
            </label>

            <input
              type="time"
              value={meetingTime}
              onChange={(e) => saveMeetingTime(e.target.value)}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-base"
            />

            {savingMeetingTime && (
              <div className="mt-1 text-xs text-gray-500">Speichert...</div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/team-planning?date=${selectedDate}`}
              className="rounded-2xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
            >
              Zurück zur Teamplanung
            </Link>

            <button
              type="button"
              onClick={notifyTeams}
              disabled={notifying || dayTeams.length === 0}
              className="rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              {notifying ? "Sendet..." : "Teams benachrichtigen"}
            </button>
          </div>
        </section>

        {loading ? (
          <section className="rounded-3xl bg-white p-5 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Tages-Zuordnung wird geladen...
          </section>
        ) : (
          <>
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Team-Reihenfolge
              </h2>

              <p className="mt-1 text-sm text-gray-600">
                Hier kannst du die Reihenfolge der Aufträge je Team anpassen.
                Diese Reihenfolge wird später auch in „Meine Aufträge“ genutzt.
              </p>

              {dayTeams.length === 0 ? (
                <div className="mt-4 text-sm text-gray-600">
                  Für diesen Tag sind noch keine Tages-Teams geplant.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {dayTeams.map((dayTeam) => {
                    const teamOrders = ordersByTeamId.get(dayTeam.id) || [];

                    return (
                      <div
                        key={dayTeam.id}
                        className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-gray-900">
                              {dayTeam.team.name}
                            </div>

                            <div className="mt-1 text-sm text-gray-700">
  Zugeordnete Aufträge: {dayTeam.orders.length}
</div>

                            <div className="mt-1 text-sm font-semibold text-gray-900">
  Gesamtfläche: {formatHectare(getTeamTotalHectare(dayTeam, orders))}
</div>

                            <div className="mt-1 text-sm text-gray-700">
                              Pilot:{" "}
                              {dayTeam.pilot
                                ? `${dayTeam.pilot.firstName} ${dayTeam.pilot.lastName}`
                                : "-"}
                            </div>

                            <div className="mt-1 text-sm text-gray-700">
                              Sucher: {dayTeam.members.length}
                            </div>
                          </div>

                          {savingOrderTeamId === dayTeam.id && (
                            <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700">
                              Speichert...
                            </div>
                          )}
                        </div>

                        {teamOrders.length === 0 ? (
                          <div className="mt-4 rounded-xl bg-white p-3 text-sm text-gray-600">
                            Diesem Team sind noch keine Aufträge zugeordnet.
                          </div>
                        ) : (
                          <div className="mt-4 space-y-2">
                            {teamOrders.map((order, index) => (
                              <div
                                key={order.id}
                                className="rounded-xl border border-gray-200 bg-white p-3"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
                                    {index + 1}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-gray-900">
                                      {getOrderLabel(order)}
                                    </div>

                                    <div className="mt-1 text-sm text-gray-700">
  Fläche: {getFieldLabel(order)}
</div>

<div className="mt-1 text-sm font-semibold text-gray-900">
  Größe: {formatHectare(getFieldAreaHectare(order))}
</div>

                                    <div className="mt-1 text-xs text-gray-500">
                                      Ansprechpartner: {order.owner.firstName}{" "}
                                      {order.owner.lastName}
                                    </div>
                                  </div>

                                  <div className="flex shrink-0 flex-col gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        moveOrderInTeam(dayTeam, index, "up")
                                      }
                                      disabled={
                                        index === 0 ||
                                        savingOrderTeamId === dayTeam.id
                                      }
                                      className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-semibold text-gray-800 disabled:opacity-40"
                                      title="Nach oben"
                                    >
                                      ▲
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        moveOrderInTeam(dayTeam, index, "down")
                                      }
                                      disabled={
                                        index === teamOrders.length - 1 ||
                                        savingOrderTeamId === dayTeam.id
                                      }
                                      className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-semibold text-gray-800 disabled:opacity-40"
                                      title="Nach unten"
                                    >
                                      ▼
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Aufträge des Tages zuweisen
              </h2>

              {orders.length === 0 ? (
                <div className="mt-4 text-sm text-gray-600">
                  Für diesen Tag sind noch keine Aufträge vorhanden.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {orders.map((order) => (
                    <div
                      key={order.id}
                      className="rounded-3xl border border-gray-200 p-4 md:p-5"
                    >
                      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
                        <div>
                          <div className="text-base font-semibold text-gray-900">
                            {getOrderLabel(order)}
                          </div>

                          <div className="mt-1 text-sm text-gray-700">
                            Fläche: {getFieldLabel(order)}
                          </div>

                          <div className="mt-1 text-sm text-gray-700">
                            Ansprechpartner: {order.owner.firstName}{" "}
                            {order.owner.lastName}
                          </div>

                          <div className="mt-1 text-sm text-gray-700">
                            Status: {order.status}
                          </div>

                          {order.operationDayTeam && (
                            <div className="mt-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-900">
                              Zugeordnet: {order.operationDayTeam.team.name}
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-gray-900">
                            Tages-Team zuweisen
                          </label>

                          <select
                            value={order.operationDayTeam?.id || ""}
                            onChange={(e) =>
                              assignOrder(order.id, e.target.value)
                            }
                            disabled={savingOrderId === order.id}
                            className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                          >
                            <option value="">
                              Noch keinem Team zugewiesen
                            </option>

                            {dayTeams.map((dayTeam) => (
                              <option key={dayTeam.id} value={dayTeam.id}>
                                {getTeamLabel(dayTeam)}
                              </option>
                            ))}
                          </select>

                          {savingOrderId === order.id && (
                            <div className="mt-2 text-xs text-gray-500">
                              Speichert...
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}