"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type Owner = {
  id: string;
  firstName: string;
  lastName: string;
};

type Field = {
  id: string;
  name: string;
  displayName?: string | null;
  ownerId?: string | null;
};

type Team = {
  id: string;
  name: string;
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

type OrderRevier = {
  id: string;
  orderId: string;
  revierId: string;
  overlapSqm?: number | null;
  overlapPercent?: number | null;
  revier: {
    id: string;
    name: string;
    nummer?: string | null;
    paechter?: RevierPachterAssignment[];
  };
};

type Order = {
  id: string;
  title: string;
  orderCode?: string | null;
  ownerId: string;
  fieldId: string;
  teamId: string | null;
  mowingDate: string | null;
  notes: string | null;
  status: "OFFEN" | "IN_ARBEIT" | "ERLEDIGT";
  startTime: string | null;
  endTime: string | null;
  owner: Owner;
  field: Field;
  team: Team | null;
  reviere?: OrderRevier[];
  createdAt?: string;
};

type EditableOrder = Order & {
  editedOwnerId: string;
  editedFieldId: string;
  editedTeamId: string;
  editedMowingDate: string;
  editedNotes: string;
  editedStatus: "OFFEN" | "IN_ARBEIT" | "ERLEDIGT";
};

const emptyForm = {
  ownerId: "",
  fieldId: "",
  mowingDate: "",
  notes: "",
  status: "OFFEN" as "OFFEN" | "IN_ARBEIT" | "ERLEDIGT",
};

function getFieldLabel(field: Field) {
  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} (${name})`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function getOrderLabel(order: Pick<Order, "orderCode" | "title">) {
  return order.orderCode || order.title || "Ohne Nummer";
}

function getRevierLabel(item: OrderRevier) {
  const name = (item.revier?.name || "").trim();
  const nummer = (item.revier?.nummer || "").trim();

  if (name && nummer) return `${name} (${nummer})`;
  if (name) return name;
  if (nummer) return nummer;
  return "Unbekanntes Revier";
}

function getPachterName(pachter: RevierPachter) {
  return `${pachter.firstName || ""} ${pachter.lastName || ""}`.trim();
}

function formatOverlapPercent(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(dateString: string | null) {
  if (!dateString) return "-";

  return new Date(dateString).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(
  startTime: string | null,
  endTime: string | null,
  status: string
) {
  if (!startTime) return "-";

  const start = new Date(startTime).getTime();
  const end =
    endTime != null
      ? new Date(endTime).getTime()
      : status === "IN_ARBEIT"
        ? Date.now()
        : null;

  if (!end || Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return "-";
  }

  const diffMs = end - start;
  const totalMinutes = Math.floor(diffMs / 1000 / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

function getStatusBadgeClass(status: Order["status"]) {
  if (status === "OFFEN") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "IN_ARBEIT") {
    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }

  return "border-green-200 bg-green-50 text-green-700";
}

function normalizeOptionalId(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

async function readJsonSafe<T>(res: Response): Promise<T> {
  const text = await res.text();

  if (!res.ok) {
    let message = "Anfrage fehlgeschlagen.";

    try {
      const parsed = text ? JSON.parse(text) : null;
      message = parsed?.error || parsed?.message || message;
    } catch {
      message = text || message;
    }

    throw new Error(message);
  }

  try {
    return text ? JSON.parse(text) : ([] as T);
  } catch {
    throw new Error("Ungültige Server-Antwort.");
  }
}

function OrderReviereBox({ order }: { order: Order }) {
  const reviere = order.reviere || [];

  if (reviere.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        <div className="font-semibold text-gray-900">Revier / Pächter</div>
        <div className="mt-1">Kein Revier automatisch zugeordnet.</div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3">
      <div className="text-sm font-bold text-orange-950">
        Betroffene Reviere / Pächter
      </div>

      <div className="mt-3 space-y-3">
        {reviere.map((item) => {
          const overlapText = formatOverlapPercent(item.overlapPercent);
          const paechter = item.revier?.paechter || [];

          return (
            <div
              key={item.id}
              className="rounded-xl bg-white p-3 text-sm text-gray-800"
            >
              <div className="font-semibold text-gray-900">
                {getRevierLabel(item)}
              </div>

              {overlapText && (
                <div className="mt-1 text-xs text-gray-500">
                  Anteil an der Fläche: {overlapText} %
                </div>
              )}

              {paechter.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {paechter.map((assignment) => (
                    <div key={assignment.id}>
                      <span className="font-semibold">Pächter:</span>{" "}
                      {getPachterName(assignment.pachter)}

                      {assignment.pachter.phone && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={`tel:${assignment.pachter.phone}`}
                            className="font-semibold text-blue-700 underline"
                          >
                            {assignment.pachter.phone}
                          </a>
                        </>
                      )}

                      {assignment.pachter.email && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={`mailto:${assignment.pachter.email}`}
                            className="font-semibold text-blue-700 underline"
                          >
                            E-Mail
                          </a>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-gray-500">
                  Kein Pächter für dieses Revier hinterlegt.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OrdersPageClient({ isAdmin }: { isAdmin: boolean }) {
  const searchParams = useSearchParams();
  const openFromUrl = searchParams.get("open");

  const [orders, setOrders] = useState<EditableOrder[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusView, setStatusView] = useState<
    "AKTIV" | "OFFEN" | "IN_ARBEIT" | "ERLEDIGT" | "ALLE"
  >("OFFEN");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const orderRefs = useRef<Record<string, HTMLDivElement | null>>({});

  async function loadData() {
    setLoading(true);

    try {
      const [ordersRes, ownersRes, fieldsRes, teamsRes] = await Promise.all([
        fetch(isAdmin ? "/api/orders/all" : "/api/orders", {
          cache: "no-store",
        }),
        fetch("/api/owners", { cache: "no-store" }),
        fetch("/api/fields-list", { cache: "no-store" }),
        fetch("/api/teams-list", { cache: "no-store" }),
      ]);

      const ordersData = await readJsonSafe<Order[]>(ordersRes);
      const ownersData = await readJsonSafe<Owner[]>(ownersRes);
      const fieldsData = await readJsonSafe<Field[]>(fieldsRes);
      const teamsData = await readJsonSafe<Team[]>(teamsRes);

      const preparedOrders: EditableOrder[] = ordersData.map((order) => ({
        ...order,
        editedOwnerId: order.ownerId,
        editedFieldId: order.fieldId,
        editedTeamId: order.teamId || "",
        editedMowingDate: order.mowingDate
          ? new Date(order.mowingDate).toISOString().slice(0, 10)
          : "",
        editedNotes: order.notes || "",
        editedStatus: order.status,
      }));

      setOrders(preparedOrders);
      setOwners(Array.isArray(ownersData) ? ownersData : []);
      setFields(Array.isArray(fieldsData) ? fieldsData : []);
      setTeams(Array.isArray(teamsData) ? teamsData : []);
    } catch (error) {
      console.error("Fehler beim Laden:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Daten konnten nicht geladen werden."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!openFromUrl || orders.length === 0) return;

    const targetOrder = orders.find((o) => o.id === openFromUrl);
    if (!targetOrder) return;

    setStatusView("ALLE");
    setSearch("");
    setOpenOrderId(openFromUrl);

    const timeout = setTimeout(() => {
      const element = orderRefs.current[openFromUrl];

      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [openFromUrl, orders]);

  const filteredFieldsForCreate = useMemo(() => fields, [fields]);

  function updateLocalOrder(
    id: string,
    changes: Partial<
      Pick<
        EditableOrder,
        | "editedOwnerId"
        | "editedFieldId"
        | "editedTeamId"
        | "editedMowingDate"
        | "editedNotes"
        | "editedStatus"
      >
    >
  ) {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === id
          ? {
              ...order,
              ...changes,
            }
          : order
      )
    );
  }

  async function createOrder() {
    if (!form.ownerId) {
      alert("Bitte einen Ansprechpartner auswählen.");
      return;
    }

    if (!form.fieldId) {
      alert("Bitte eine Fläche auswählen.");
      return;
    }

    setCreating(true);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          
          mowingDate: form.mowingDate || null,
        }),
      });

      const data = await readJsonSafe<Order>(res);

      setForm(emptyForm);
      await loadData();
      alert(`Auftrag ${data.orderCode || data.title} angelegt`);
    } catch (error) {
      console.error("Fehler beim Anlegen:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Auftrag konnte nicht angelegt werden."
      );
    } finally {
      setCreating(false);
    }
  }

  async function saveOrder(order: EditableOrder) {
    setSavingId(order.id);

    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: order.editedOwnerId,
          fieldId: order.editedFieldId,
          
          mowingDate: order.editedMowingDate || null,
          notes: order.editedNotes,
          status: order.editedStatus,
        }),
      });

      await readJsonSafe<Order>(res);
      await loadData();
    } catch (error) {
      console.error("Fehler beim Speichern:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Auftrag konnte nicht gespeichert werden."
      );
    } finally {
      setSavingId(null);
    }
  }

  async function deleteOrder(id: string, label: string) {
    const confirmed = window.confirm(
      `Möchtest du den Auftrag "${label}" wirklich löschen?`
    );

    if (!confirmed) return;

    setSavingId(id);

    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "DELETE",
      });

      await readJsonSafe<{ success: boolean }>(res);
      await loadData();
    } catch (error) {
      console.error("Fehler beim Löschen:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Auftrag konnte nicht gelöscht werden."
      );
    } finally {
      setSavingId(null);
    }
  }

  const visibleOrders = useMemo(() => {
    if (statusView === "AKTIV") {
      return orders.filter((order) => order.status !== "ERLEDIGT");
    }

    if (statusView === "OFFEN") {
      return orders.filter((order) => order.status === "OFFEN");
    }

    if (statusView === "IN_ARBEIT") {
      return orders.filter((order) => order.status === "IN_ARBEIT");
    }

    if (statusView === "ERLEDIGT") {
      return orders.filter((order) => order.status === "ERLEDIGT");
    }

    return orders;
  }, [orders, statusView]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return visibleOrders;

    return visibleOrders.filter((order) =>
      [
        getOrderLabel(order),
        order.owner?.firstName,
        order.owner?.lastName,
        order.field?.name,
        order.field?.displayName || "",
        order.team?.name || "",
        order.notes || "",
        order.status,
        formatDuration(order.startTime, order.endTime, order.status),
        ...(order.reviere || []).flatMap((item) => [
          item.revier?.name || "",
          item.revier?.nummer || "",
          ...(item.revier?.paechter || []).flatMap((assignment) => [
            assignment.pachter.firstName || "",
            assignment.pachter.lastName || "",
            assignment.pachter.phone || "",
            assignment.pachter.email || "",
          ]),
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [visibleOrders, search]);

  return (
    <main className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5 md:space-y-6">
        <div className="rounded-2xl border-2 border-slate-900 bg-slate-900 p-4 shadow sm:p-5 md:p-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Aufträge
          </h1>
          <p className="mt-2 text-sm text-slate-100 sm:text-base">
            Neue Aufträge bekommen automatisch eine Nummer wie 2026-1, 2026-2
            usw.
          </p>
        </div>

        {isAdmin && (
          <div className="space-y-4 rounded-2xl border-2 border-blue-800 bg-blue-50 p-4 shadow sm:p-5 md:p-6">
            <div className="rounded-xl bg-blue-800 px-4 py-3">
              <h2 className="text-lg font-extrabold text-white sm:text-xl">
                Neuen Auftrag anlegen
              </h2>
              <p className="mt-1 text-sm text-blue-100 sm:text-base">
                Die Auftragsnummer wird automatisch beim Speichern vergeben.
              </p>
            </div>

            <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
              <select
                value={form.ownerId}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    ownerId: e.target.value,
                  }))
                }
                className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
              >
                <option value="">Ansprechpartner auswählen</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.lastName}, {owner.firstName}
                  </option>
                ))}
              </select>

              <select
                value={form.fieldId}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, fieldId: e.target.value }))
                }
                className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
              >
                <option value="">Fläche auswählen</option>
                {filteredFieldsForCreate.map((field) => (
                  <option key={field.id} value={field.id}>
                    {getFieldLabel(field)}
                  </option>
                ))}
              </select>

              

              <input
                type="date"
                value={form.mowingDate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, mowingDate: e.target.value }))
                }
                className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
              />

              <select
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    status: e.target.value as
                      | "OFFEN"
                      | "IN_ARBEIT"
                      | "ERLEDIGT",
                  }))
                }
                className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:col-span-2 md:text-sm"
              >
                <option value="OFFEN">Offen</option>
                <option value="IN_ARBEIT">In Arbeit</option>
                <option value="ERLEDIGT">Erledigt</option>
              </select>
            </div>

            <textarea
              placeholder="Notizen"
              value={form.notes}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, notes: e.target.value }))
              }
              className="min-h-[110px] w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
            />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={createOrder}
                className="min-h-11 rounded-xl bg-black px-4 py-2.5 text-white disabled:opacity-50"
                disabled={creating}
              >
                {creating ? "Speichert..." : "Auftrag anlegen"}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4 rounded-2xl bg-white p-4 shadow sm:p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="mb-2 block text-sm font-medium">Suche</label>
              <input
                type="text"
                placeholder="Nummer, Ansprechpartner, Fläche, Team, Revier, Pächter, Status ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
              />
            </div>

            {isAdmin && (
              <div>
                <label className="mb-2 block text-sm font-medium">Ansicht</label>
                <select
                  value={statusView}
                  onChange={(e) =>
                    setStatusView(
                      e.target.value as
                        | "AKTIV"
                        | "OFFEN"
                        | "IN_ARBEIT"
                        | "ERLEDIGT"
                        | "ALLE"
                    )
                  }
                  className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:w-44 md:text-sm"
                >
                  <option value="AKTIV">Aktive</option>
                  <option value="OFFEN">Offene</option>
                  <option value="IN_ARBEIT">In Arbeit</option>
                  <option value="ERLEDIGT">Erledigte</option>
                  <option value="ALLE">Alle</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-5 shadow sm:p-6">
            Aufträge werden geladen...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-2xl bg-white p-5 shadow sm:p-6">
            Keine Aufträge gefunden.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const fieldsForThisOrder = fields;

              const hasChanges =
                order.ownerId !== order.editedOwnerId ||
                order.fieldId !== order.editedFieldId ||
                (order.teamId || "") !== order.editedTeamId ||
                (order.mowingDate
                  ? new Date(order.mowingDate).toISOString().slice(0, 10)
                  : "") !== order.editedMowingDate ||
                (order.notes || "") !== order.editedNotes ||
                order.status !== order.editedStatus;

              const isOpen = openOrderId === order.id;

              return (
                <div
                  key={order.id}
                  ref={(el) => {
                    orderRefs.current[order.id] = el;
                  }}
                  className="overflow-hidden rounded-2xl bg-white shadow"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenOrderId((prev) =>
                        prev === order.id ? null : order.id
                      )
                    }
                    className="flex w-full items-start justify-between gap-3 p-4 text-left sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 sm:text-base">
                          {getOrderLabel(order)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium sm:text-xs ${getStatusBadgeClass(
                            order.status
                          )}`}
                        >
                          {order.status === "OFFEN"
                            ? "Offen"
                            : order.status === "IN_ARBEIT"
                              ? "In Arbeit"
                              : "Erledigt"}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-gray-600">
                        {order.owner.firstName} {order.owner.lastName}
                      </div>

                      <div className="mt-1 text-sm text-gray-600">
                        {getFieldLabel(order.field)}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        Team: {order.team?.name || "nicht zugeordnet"}
                      </div>

                      {order.reviere && order.reviere.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {order.reviere.map((item) => (
                            <span
                              key={item.id}
                              className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-900"
                            >
                              {getRevierLabel(item)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 text-xl text-gray-500">
                      {isOpen ? "−" : "+"}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3">
                          <div className="rounded-xl border p-3">
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                              Auftragsnummer
                            </div>
                            <div className="mt-1 font-medium text-gray-900">
                              {getOrderLabel(order)}
                            </div>
                          </div>

                          <select
                            value={order.editedOwnerId}
                            onChange={(e) =>
                              updateLocalOrder(order.id, {
                                editedOwnerId: e.target.value,
                                editedFieldId: "",
                              })
                            }
                            className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
                          >
                            <option value="">Ansprechpartner auswählen</option>
                            {owners.map((owner) => (
                              <option key={owner.id} value={owner.id}>
                                {owner.lastName}, {owner.firstName}
                              </option>
                            ))}
                          </select>

                          <select
                            value={order.editedFieldId}
                            onChange={(e) =>
                              updateLocalOrder(order.id, {
                                editedFieldId: e.target.value,
                              })
                            }
                            className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
                          >
                            <option value="">Fläche auswählen</option>
                            {fieldsForThisOrder.map((field) => (
                              <option key={field.id} value={field.id}>
                                {getFieldLabel(field)}
                              </option>
                            ))}
                          </select>

            
                        </div>

                        <div className="space-y-3">
                          <input
                            type="date"
                            value={order.editedMowingDate}
                            onChange={(e) =>
                              updateLocalOrder(order.id, {
                                editedMowingDate: e.target.value,
                              })
                            }
                            className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
                          />

                          <select
                            value={order.editedStatus}
                            onChange={(e) =>
                              updateLocalOrder(order.id, {
                                editedStatus: e.target.value as
                                  | "OFFEN"
                                  | "IN_ARBEIT"
                                  | "ERLEDIGT",
                              })
                            }
                            className="min-h-11 w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
                          >
                            <option value="OFFEN">Offen</option>
                            <option value="IN_ARBEIT">In Arbeit</option>
                            <option value="ERLEDIGT">Erledigt</option>
                          </select>

                          <textarea
                            value={order.editedNotes}
                            onChange={(e) =>
                              updateLocalOrder(order.id, {
                                editedNotes: e.target.value,
                              })
                            }
                            className="min-h-[120px] w-full rounded-xl border px-3 py-2.5 text-base md:text-sm"
                            placeholder="Notizen"
                          />
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border bg-gray-50 p-3 text-sm text-gray-600">
                        <div>
                          Ansprechpartner: {order.owner.firstName}{" "}
                          {order.owner.lastName}
                        </div>
                        <div>Fläche: {getFieldLabel(order.field)}</div>
                        <div>
                          Team: {order.team?.name || "nicht zugeordnet"}
                        </div>
                        <div>Start: {formatDate(order.startTime)}</div>
                        <div>Ende: {formatDate(order.endTime)}</div>
                        <div>
                          Laufzeit:{" "}
                          {formatDuration(
                            order.startTime,
                            order.endTime,
                            order.status
                          )}
                        </div>
                      </div>

                      <OrderReviereBox order={order} />

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                        <button
                          type="button"
                          onClick={() => saveOrder(order)}
                          className="min-h-11 rounded-xl bg-black px-4 py-2.5 text-white disabled:opacity-50"
                          disabled={savingId === order.id || !hasChanges}
                        >
                          {savingId === order.id ? "Speichert..." : "Speichern"}
                        </button>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() =>
                              deleteOrder(order.id, getOrderLabel(order))
                            }
                            className="min-h-11 rounded-xl border border-red-300 px-4 py-2.5 text-red-700"
                            disabled={savingId === order.id}
                          >
                            Löschen
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}