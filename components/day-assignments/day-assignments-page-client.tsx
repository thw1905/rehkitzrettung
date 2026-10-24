"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { area } from "@turf/area";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

function SortableOrderCard({
  order,
  index,
  teamOrdersLength,
  saving,
  onMoveUp,
  onMoveDown,
}: {
  order: OrderItem;
  index: number;
  teamOrdersLength: number;
  saving: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: order.id,
    disabled: saving,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "rounded-xl border border-gray-200 bg-white p-3",
        isDragging ? "shadow-xl ring-2 ring-black/20" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={saving}
          className="flex h-9 w-9 shrink-0 touch-none select-none items-center justify-center rounded-full bg-black text-sm font-bold text-white disabled:opacity-40"
          title="Auftrag ziehen"
        >
          {index + 1}
        </button>

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
            Ansprechpartner: {order.owner.firstName} {order.owner.lastName}
          </div>

          <div className="mt-2 text-xs font-semibold text-gray-500">
            Zum Sortieren die schwarze Nummer gedrückt halten und ziehen.
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0 || saving}
            className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-semibold text-gray-800 disabled:opacity-40"
            title="Nach oben"
          >
            ▲
          </button>

          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === teamOrdersLength - 1 || saving}
            className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-semibold text-gray-800 disabled:opacity-40"
            title="Nach unten"
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  );
}

type MeetingPointData = {
  mode: "AUTO" | "MANUELL";
  text: string;
  autoText: string;
  manualText: string;
  sourceOrder: string | null;
};

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
  /* Treffpunkt Einsatztag */
  const [meetingPoint, setMeetingPoint] = useState<MeetingPointData | null>(null);
  const [meetingPointMode, setMeetingPointMode] = useState<"AUTO" | "MANUELL">("AUTO");
  const [manualMeetingPoint, setManualMeetingPoint] = useState("");
  const [savingMeetingPoint, setSavingMeetingPoint] = useState(false);
  const [meetingPointError, setMeetingPointError] = useState("");


  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDateChange(date: string) {
    setSelectedDate(date);
    router.replace(`/day-assignments?date=${date}`);
  }

  async function loadData(date: string) {
    setLoading(true);
    setMeetingPoint(null);
    setMeetingPointError("");

    try {
      const res = await fetch(
        `/api/day-assignments?date=${encodeURIComponent(date)}`,
        { cache: "no-store" }
      );

      const data: ResponseData & { error?: string } = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || "Tages-Zuordnung konnte nicht geladen werden."
        );
      }

      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setDayTeams(Array.isArray(data.dayTeams) ? data.dayTeams : []);
      const pointResponse = await fetch(
        `/api/operation-days/meeting-point?date=${encodeURIComponent(date)}`,
        { cache: "no-store" },
      );
      const pointData = await pointResponse.json();
      if (!pointResponse.ok) throw new Error(pointData.error || "Treffpunkt konnte nicht geladen werden.");
      setMeetingPoint(pointData as MeetingPointData);
      setMeetingPointMode(pointData.mode === "MANUELL" ? "MANUELL" : "AUTO");
      setManualMeetingPoint(pointData.manualText || "");
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
        throw new Error(
          data?.error || "Auftrag konnte nicht zugewiesen werden."
        );
      }

      await loadData(selectedDate);
    } catch (error: any) {
      console.error("Fehler beim Zuweisen:", error);
      alert(error?.message || "Auftrag konnte nicht zugewiesen werden.");
    } finally {
      setSavingOrderId(null);
    }
  }

  async function saveTeamOrder(dayTeam: DayTeam, nextTeamOrders: OrderItem[]) {
    setSavingOrderTeamId(dayTeam.id);

    setOrders((prev) => {
      const orderPosition = new Map(
        nextTeamOrders.map((order, index) => [order.id, index + 1])
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
          orderIds: nextTeamOrders.map((order) => order.id),
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
      alert(
        error?.message || "Auftragsreihenfolge konnte nicht gespeichert werden."
      );
      await loadData(selectedDate);
    } finally {
      setSavingOrderTeamId(null);
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

    const nextTeamOrders = [...teamOrders];
    const temp = nextTeamOrders[orderIndex];
    nextTeamOrders[orderIndex] = nextTeamOrders[targetIndex];
    nextTeamOrders[targetIndex] = temp;

    await saveTeamOrder(dayTeam, nextTeamOrders);
  }

  async function handleDragEnd(dayTeam: DayTeam, event: DragEndEvent) {
    const { active, over } = event;

    if (!over) return;
    if (active.id === over.id) return;

    const teamOrders = [...(ordersByTeamId.get(dayTeam.id) || [])];

    const oldIndex = teamOrders.findIndex((order) => order.id === active.id);
    const newIndex = teamOrders.findIndex((order) => order.id === over.id);

    if (oldIndex < 0 || newIndex < 0) return;

    const nextTeamOrders = arrayMove(teamOrders, oldIndex, newIndex);

    await saveTeamOrder(dayTeam, nextTeamOrders);
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

  const meetingPointChanged = meetingPoint !== null && (
    meetingPointMode !== meetingPoint.mode ||
    (meetingPointMode === "MANUELL" && manualMeetingPoint.trim() !== meetingPoint.manualText)
  );

  async function saveMeetingPoint() {
    if (meetingPointMode === "MANUELL" && !manualMeetingPoint.trim()) {
      setMeetingPointError("Bitte einen manuellen Treffpunkt angeben.");
      return;
    }
    setSavingMeetingPoint(true);
    setMeetingPointError("");
    try {
      const response = await fetch("/api/operation-days/meeting-point", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          meetingPointText: meetingPointMode === "MANUELL" ? manualMeetingPoint.trim() : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Treffpunkt konnte nicht gespeichert werden.");
      setMeetingPoint(data as MeetingPointData);
      setMeetingPointMode(data.mode);
      setManualMeetingPoint(data.manualText);
    } catch (error) {
      setMeetingPointError(error instanceof Error ? error.message : "Fehler beim Speichern.");
    } finally { setSavingMeetingPoint(false); }
  }

  async function notifyTeams() {
    if (meetingPointChanged) { alert("Bitte Treffpunkt zuerst speichern."); return; }
    if (!meetingPoint?.text) { alert("Bitte einen Treffpunkt festlegen, bevor Benachrichtigungen gesendet werden."); return; }
    if (!meetingTime || savingMeetingTime) { alert("Bitte zuerst die Treffzeit speichern."); return; }
    const confirmed = window.confirm(
      `Einsatz am ${selectedDate}\nTreffzeit: ${meetingTime || "nicht angegeben"}\nTreffpunkt:\n${meetingPoint?.text}\n\nHelfer benachrichtigen und Revierpächter-Mails senden?`
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
        `Benachrichtigungen ausgelöst.\nGeplante Helfer: ${data.plannedUsers ?? 0}\nPushs: ${data.sentPushes ?? 0}\nRevierpächter-Mails: ${data.revierOwnerEmails?.sent ?? 0} von ${data.revierOwnerEmails?.recipients ?? 0}`
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

          {/* Treffpunkt des Einsatztages */}
          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <h2 className="text-base font-bold text-gray-950">Treffpunkt für diesen Einsatztag</h2>
            <p className="mt-1 text-sm text-gray-700">Standard: Treffpunkt der Fläche des ersten zugeteilten Auftrags. Du kannst stattdessen einen anderen Treffpunkt eingeben.</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-gray-900">
              <label className="flex items-center gap-2">
                <input type="radio" checked={meetingPointMode === "AUTO"} onChange={() => setMeetingPointMode("AUTO")} /> Automatisch
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={meetingPointMode === "MANUELL"} onChange={() => setMeetingPointMode("MANUELL")} /> Manuell festlegen
              </label>
            </div>
            {meetingPointMode === "AUTO" ? (
              <div className="mt-3 rounded-xl bg-white p-3">
                <div className="text-xs font-semibold text-gray-500">Erster Auftrag: {meetingPoint?.sourceOrder || "Noch keiner zugeteilt"}</div>
                <pre className="mt-2 whitespace-pre-wrap break-all font-sans text-sm text-gray-900">{meetingPoint?.autoText || "Für den ersten Auftrag ist noch kein Treffpunkt hinterlegt. Bitte in der Fläche einen Treffpunkt setzen oder manuell festlegen."}</pre>
              </div>
            ) : (
              <div className="mt-3">
                <label htmlFor="manual-day-point" className="block text-sm font-semibold text-gray-900">Treffpunkt / Adresse / GPS-Koordinaten</label>
                <textarea id="manual-day-point" rows={3} maxLength={500} value={manualMeetingPoint} onChange={e => setManualMeetingPoint(e.target.value)} placeholder="z. B. Parkplatz am Sportplatz, Musterstraße 12, Hittfeld" className="mt-2 w-full rounded-xl border border-gray-300 bg-white p-3 text-sm text-gray-950" />
              </div>
            )}
            {meetingPointError && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{meetingPointError}</p>}
            {meetingPointChanged && <p className="mt-2 text-sm font-bold text-amber-800">Änderung noch nicht gespeichert. Erst speichern, dann benachrichtigen.</p>}
            {meetingPointChanged && (
              <button type="button" onClick={() => void saveMeetingPoint()} disabled={savingMeetingPoint} className="mt-3 rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                {savingMeetingPoint ? "Speichert ..." : "Treffpunkt speichern"}
              </button>
            )}
            {!meetingPointChanged && meetingPoint?.text && <p className="mt-2 text-xs font-semibold text-green-900">Dieser Treffpunkt wird in Helfer-Benachrichtigungen und Revierpächter-Mails verwendet.</p>}
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
              disabled={notifying || dayTeams.length === 0 || savingMeetingPoint || savingMeetingTime || !meetingTime || meetingPointChanged || !meetingPoint?.text}
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
                Ziehe die schwarze Nummer eines Auftrags nach oben oder unten.
                Die Reihenfolge wird gespeichert und später auch in „Meine
                Aufträge“ genutzt.
              </p>

              {dayTeams.length === 0 ? (
                <div className="mt-4 text-sm text-gray-600">
                  Für diesen Tag sind noch keine Tages-Teams geplant.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {dayTeams.map((dayTeam) => {
                    const teamOrders = ordersByTeamId.get(dayTeam.id) || [];
                    const isSavingThisTeam = savingOrderTeamId === dayTeam.id;

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
                              Zugeordnete Aufträge: {teamOrders.length}
                            </div>

                            <div className="mt-1 text-sm font-semibold text-gray-900">
                              Gesamtfläche:{" "}
                              {formatHectare(
                                getTeamTotalHectare(dayTeam, orders)
                              )}
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

                          {isSavingThisTeam && (
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
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(event) =>
                              handleDragEnd(dayTeam, event)
                            }
                          >
                            <SortableContext
                              items={teamOrders.map((order) => order.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="mt-4 space-y-2">
                                {teamOrders.map((order, index) => (
                                  <SortableOrderCard
                                    key={order.id}
                                    order={order}
                                    index={index}
                                    teamOrdersLength={teamOrders.length}
                                    saving={isSavingThisTeam}
                                    onMoveUp={() =>
                                      moveOrderInTeam(dayTeam, index, "up")
                                    }
                                    onMoveDown={() =>
                                      moveOrderInTeam(dayTeam, index, "down")
                                    }
                                  />
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
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