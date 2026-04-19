"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

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
  notes?: string | null;
  owner: {
    firstName: string;
    lastName: string;
  };
  field: {
    name: string;
    displayName?: string | null;
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
  return order.orderCode || order.title;
}

function getFieldLabel(order: OrderItem) {
  const displayName = (order.field.displayName || "").trim();
  const name = (order.field.name || "").trim();

  if (displayName && name) return `${displayName} (${name})`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function getTeamLabel(dayTeam: DayTeam) {
  const pilot = dayTeam.pilot
    ? `${dayTeam.pilot.firstName} ${dayTeam.pilot.lastName}`
    : "ohne Pilot";

  const searcherCount = dayTeam.members.length;

  return `${dayTeam.team.name} · ${pilot} · ${searcherCount} Sucher`;
}

export default function DayAssignmentsPageClient() {
  const searchParams = useSearchParams();
const router = useRouter();

const initialDate =
  searchParams.get("date") || getTodayDateInputValue();

const [selectedDate, setSelectedDate] = useState(initialDate);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [dayTeams, setDayTeams] = useState<DayTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen bg-gray-50 px-3 py-4 md:px-6 md:py-8">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-7">
          <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
            Aufträge zu Team-Slots
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600 md:text-base">
            Weise hier die Aufträge eines Tages den geplanten Tages-Teams zu.
            Das ist die Grundlage für spätere standortbasierte Verteilung.
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

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/team-planning?date=${selectedDate}`}
              className="rounded-2xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
            >
              Zurück zur Teamplanung
            </Link>
          </div>
        </section>

        {loading ? (
          <section className="rounded-3xl bg-white p-5 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Tages-Zuordnung wird geladen...
          </section>
        ) : (
          <>
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
              <h2 className="text-lg font-semibold text-gray-900">Geplante Tages-Teams</h2>

              {dayTeams.length === 0 ? (
                <div className="mt-4 text-sm text-gray-600">
                  Für diesen Tag sind noch keine Tages-Teams geplant.
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {dayTeams.map((dayTeam) => (
                    <div
                      key={dayTeam.id}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="text-base font-semibold text-gray-900">
                        {dayTeam.team.name}
                      </div>

                      <div className="mt-2 text-sm text-gray-700">
                        Pilot:{" "}
                        {dayTeam.pilot
                          ? `${dayTeam.pilot.firstName} ${dayTeam.pilot.lastName}`
                          : "-"}
                      </div>

                      <div className="mt-1 text-sm text-gray-700">
                        Sucher: {dayTeam.members.length}
                      </div>

                      <div className="mt-1 text-sm text-gray-700">
                        Zugeordnete Aufträge: {dayTeam.orders.length}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
              <h2 className="text-lg font-semibold text-gray-900">Aufträge des Tages</h2>

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
                            Ansprechpartner: {order.owner.firstName} {order.owner.lastName}
                          </div>

                          <div className="mt-1 text-sm text-gray-700">
                            Status: {order.status}
                          </div>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-gray-900">
                            Tages-Team zuweisen
                          </label>

                          <select
                            value={order.operationDayTeam?.id || ""}
                            onChange={(e) => assignOrder(order.id, e.target.value)}
                            disabled={savingOrderId === order.id}
                            className="w-full rounded-2xl border border-gray-300 px-4 py-3"
                          >
                            <option value="">Noch keinem Team zugewiesen</option>

                            {dayTeams.map((dayTeam) => (
                              <option key={dayTeam.id} value={dayTeam.id}>
                                {getTeamLabel(dayTeam)}
                              </option>
                            ))}
                          </select>

                          {order.operationDayTeam && (
                            <div className="mt-2 text-xs text-gray-600">
                              Aktuell: {order.operationDayTeam.team.name}
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