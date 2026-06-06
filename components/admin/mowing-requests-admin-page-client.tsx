"use client";

import { useEffect, useMemo, useState } from "react";

type RequestStatus = "ALLE" | "OFFEN" | "IN_BEARBEITUNG" | "ERLEDIGT" | "ABGELEHNT";

type Owner = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
};

type FieldItem = {
  id: string;
  name: string;
  displayName?: string | null;
  areaHa?: number;
  locationNote?: string | null;
};

type MowingRequestFieldItem = {
  id: string;
  fieldId: string;
  field: FieldItem;
};

type MowingRequest = {
  id: string;
  ownerId: string;
  mowingDate: string;
  note?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  owner: Owner;
  fields: MowingRequestFieldItem[];
  totalAreaHa?: number;
};

type ApiResponse = {
  requests: MowingRequest[];
  summary?: {
    totalRequests: number;
    totalFields: number;
    totalAreaHa: number;
  };
  error?: string;
};

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value: string | Date | null | undefined) {
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

function formatHa(value: number | null | undefined) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? Number(value) : 0);
}

function getOwnerName(owner: Owner) {
  return [owner.firstName || "", owner.lastName || ""].join(" ").trim() || "-";
}

function getFieldLabel(field: FieldItem) {
  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} · ${name}`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function statusBadgeClass(status: string) {
  if (status === "OFFEN") return "border-blue-300 bg-blue-50 text-blue-900";
  if (status === "IN_BEARBEITUNG") return "border-amber-300 bg-amber-50 text-amber-900";
  if (status === "ERLEDIGT") return "border-green-300 bg-green-50 text-green-900";
  if (status === "ABGELEHNT") return "border-red-300 bg-red-50 text-red-900";

  return "border-gray-300 bg-gray-50 text-gray-900";
}

export default function MowingRequestsAdminPageClient() {
  const [requests, setRequests] = useState<MowingRequest[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [summary, setSummary] = useState<ApiResponse["summary"] | null>(null);
  const [statusFilter, setStatusFilter] = useState<RequestStatus>("OFFEN");
  const [dateFilter, setDateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creatingOrdersId, setCreatingOrdersId] = useState<string | null>(null);
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [contactIsLandwirtByRequestId, setContactIsLandwirtByRequestId] =
    useState<Record<string, boolean>>({});
  const [contactOwnerIdByRequestId, setContactOwnerIdByRequestId] =
    useState<Record<string, string>>({});

  async function loadRequests() {
    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (statusFilter !== "ALLE") {
        params.set("status", statusFilter);
      }

      if (dateFilter) {
        params.set("date", dateFilter);
      }

      const [requestsRes, ownersRes] = await Promise.all([
        fetch(`/api/admin/mowing-requests?${params.toString()}`, {
          cache: "no-store",
        }),
        fetch("/api/owners", {
          cache: "no-store",
        }),
      ]);

      const requestsJson: ApiResponse = await requestsRes.json();
      const ownersJson: Owner[] = await ownersRes.json();

      if (!requestsRes.ok) {
        throw new Error(
          requestsJson?.error || "Mähanfragen konnten nicht geladen werden."
        );
      }

      if (!ownersRes.ok) {
        throw new Error("Landwirte/Ansprechpartner konnten nicht geladen werden.");
      }

      const nextRequests = Array.isArray(requestsJson.requests)
        ? requestsJson.requests
        : [];

      setRequests(nextRequests);
      setOwners(Array.isArray(ownersJson) ? ownersJson : []);
      setSummary(requestsJson.summary || null);

      setContactIsLandwirtByRequestId((prev) => {
        const next = { ...prev };

        for (const request of nextRequests) {
          if (next[request.id] === undefined) {
            next[request.id] = true;
          }
        }

        return next;
      });

      setOpenRequestId((prev) => {
        if (prev && nextRequests.some((request) => request.id === prev)) {
          return prev;
        }

        return nextRequests[0]?.id || null;
      });
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Mähanfragen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFilter]);

  async function updateStatus(requestId: string, status: string) {
    setSavingId(requestId);

    try {
      const res = await fetch("/api/admin/mowing-requests", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: requestId,
          status,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Status konnte nicht geändert werden.");
      }

      await loadRequests();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Status konnte nicht geändert werden.");
    } finally {
      setSavingId(null);
    }
  }

  async function createOrdersFromRequest(request: MowingRequest) {
    const contactIsLandwirt =
      contactIsLandwirtByRequestId[request.id] !== false;

    const contactOwnerId = contactIsLandwirt
      ? ""
      : (contactOwnerIdByRequestId[request.id] || "").trim();

    if (!contactIsLandwirt && !contactOwnerId) {
      alert("Bitte einen Ansprechpartner auswählen oder den Haken bei 'Ansprechpartner ist der Landwirt' setzen.");
      return;
    }

    const contactOwner = contactOwnerId
      ? owners.find((owner) => owner.id === contactOwnerId)
      : null;

    const confirmed = window.confirm(
      `Aus dieser Mähanfrage ${request.fields.length} Auftrag/Aufträge erzeugen?\n\nLandwirt: ${getOwnerName(request.owner)}\nAnsprechpartner: ${contactOwner ? getOwnerName(contactOwner) : getOwnerName(request.owner)}\nMähdatum: ${formatDate(request.mowingDate)}\nGesamtfläche: ${formatHa(request.totalAreaHa)} ha`
    );

    if (!confirmed) return;

    setCreatingOrdersId(request.id);

    try {
      const res = await fetch(
        `/api/admin/mowing-requests/${request.id}/create-orders`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contactOwnerId: contactIsLandwirt ? null : contactOwnerId,
          }),
        }
      );

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "Aufträge konnten nicht erzeugt werden.");
      }

      alert(json?.message || "Aufträge wurden erzeugt.");
      await loadRequests();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Aufträge konnten nicht erzeugt werden.");
    } finally {
      setCreatingOrdersId(null);
    }
  }

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return requests;

    return requests.filter((request) => {
      const text = [
        getOwnerName(request.owner),
        request.owner.phone || "",
        request.owner.email || "",
        request.note || "",
        request.status || "",
        request.fields.map((item) => getFieldLabel(item.field)).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(term);
    });
  }, [requests, search]);

  const visibleTotalAreaHa = filteredRequests.reduce(
    (sum, request) =>
      sum +
      (Number.isFinite(request.totalAreaHa) ? Number(request.totalAreaHa) : 0),
    0
  );

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100 md:p-6">
          <h1 className="text-2xl font-bold text-gray-900">Suchanfragen</h1>
          <p className="mt-2 text-sm text-gray-700">
            Hier siehst du die Meldungen der Landwirte und kannst daraus normale Aufträge erzeugen.
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Anfragen</div>
            <div className="mt-1 text-2xl font-bold text-blue-950">{summary?.totalRequests ?? requests.length}</div>
          </div>

          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-700">Flächen</div>
            <div className="mt-1 text-2xl font-bold text-green-950">{summary?.totalFields ?? 0}</div>
          </div>

          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-orange-700">Gesamt ha</div>
            <div className="mt-1 text-2xl font-bold text-orange-950">{formatHa(summary?.totalAreaHa)}</div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Gefiltert ha</div>
            <div className="mt-1 text-2xl font-bold text-gray-950">{formatHa(visibleTotalAreaHa)}</div>
          </div>
        </section>

        <section className="grid gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:grid-cols-[220px_220px_1fr_140px] md:p-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-900">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as RequestStatus)}
              className="w-full rounded-xl border border-gray-300 px-3 py-3"
            >
              <option value="ALLE">Alle</option>
              <option value="OFFEN">Offen</option>
              <option value="IN_BEARBEITUNG">In Bearbeitung</option>
              <option value="ERLEDIGT">Erledigt</option>
              <option value="ABGELEHNT">Abgelehnt</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-900">Mähdatum</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-3"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-900">Suche</label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Landwirt, FL-Nummer, Notiz, Telefon ..."
              className="w-full rounded-xl border border-gray-300 px-3 py-3"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setDateFilter("")}
              className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-900"
            >
              Datum löschen
            </button>
          </div>
        </section>

        {loading ? (
          <section className="rounded-3xl bg-white p-6 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Suchanfragen werden geladen...
          </section>
        ) : filteredRequests.length === 0 ? (
          <section className="rounded-3xl bg-white p-6 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
            Keine Suchanfragen gefunden.
          </section>
        ) : (
          <section className="space-y-3">
            {filteredRequests.map((request) => {
              const isOpen = openRequestId === request.id;
              const isCreatingOrders = creatingOrdersId === request.id;
              const canCreateOrders = request.status !== "ERLEDIGT" && request.fields.length > 0;
              const contactIsLandwirt =
                contactIsLandwirtByRequestId[request.id] !== false;
              const selectedContactOwnerId = contactOwnerIdByRequestId[request.id] || "";

              return (
                <article key={request.id} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-gray-100">
                  <button
                    type="button"
                    onClick={() => setOpenRequestId((prev) => (prev === request.id ? null : request.id))}
                    className="flex w-full flex-col gap-3 p-4 text-left md:flex-row md:items-center md:justify-between md:p-5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-900">{getOwnerName(request.owner)}</h2>
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClass(request.status)}`}>{request.status}</span>
                      </div>

                      <div className="mt-2 grid gap-1 text-sm text-gray-700 md:grid-cols-2">
                        <div>Eingegangen: <span className="font-semibold">{formatDateTime(request.createdAt)}</span></div>
                        <div>Mähdatum: <span className="font-semibold">{formatDate(request.mowingDate)}</span></div>
                        <div>Gesamtfläche: <span className="font-semibold">{formatHa(request.totalAreaHa)} ha</span></div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 md:shrink-0">
                      <div className="text-sm font-semibold text-gray-700">
                        {request.fields.length} Fläche(n)
                      </div>
                      <div className="text-xl text-gray-500">{isOpen ? "−" : "+"}</div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 p-4 md:p-5">
                      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
                        <div className="space-y-4">
                          {request.note ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                              <div className="font-bold">Notiz</div>
                              <div className="mt-1 whitespace-pre-wrap">{request.note}</div>
                            </div>
                          ) : null}

                          <div className="overflow-x-auto rounded-2xl border border-gray-200">
                            <table className="w-full min-w-[620px] text-left text-sm">
                              <thead>
                                <tr className="border-b bg-gray-50">
                                  <th className="px-3 py-2">Fläche</th>
                                  <th className="px-3 py-2 text-right">ha</th>
                                  <th className="px-3 py-2">Treffpunkt/Notiz</th>
                                </tr>
                              </thead>
                              <tbody>
                                {request.fields.map((item) => (
                                  <tr key={item.id} className="border-b last:border-b-0">
                                    <td className="px-3 py-2 font-semibold text-gray-900">{getFieldLabel(item.field)}</td>
                                    <td className="px-3 py-2 text-right">{formatHa(item.field.areaHa)} ha</td>
                                    <td className="px-3 py-2 text-gray-700">{item.field.locationNote || "-"}</td>
                                  </tr>
                                ))}
                                <tr className="bg-gray-50 font-bold">
                                  <td className="px-3 py-2">Gesamt</td>
                                  <td className="px-3 py-2 text-right">{formatHa(request.totalAreaHa)} ha</td>
                                  <td className="px-3 py-2" />
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">
                            <div className="font-bold text-gray-900">Landwirt</div>
                            <div className="mt-2">{getOwnerName(request.owner)}</div>
                            <div>Telefon: {request.owner.phone || "-"}</div>
                            <div>E-Mail: {request.owner.email || "-"}</div>
                          </div>

                          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                            <label className="flex items-start gap-2 text-sm font-semibold text-blue-950">
                              <input
                                type="checkbox"
                                checked={contactIsLandwirt}
                                onChange={(event) => {
                                  const checked = event.target.checked;

                                  setContactIsLandwirtByRequestId((prev) => ({
                                    ...prev,
                                    [request.id]: checked,
                                  }));

                                  if (checked) {
                                    setContactOwnerIdByRequestId((prev) => ({
                                      ...prev,
                                      [request.id]: "",
                                    }));
                                  }
                                }}
                                className="mt-1"
                              />
                              <span>Ansprechpartner ist der Landwirt</span>
                            </label>

                            {!contactIsLandwirt && (
                              <div className="mt-3">
                                <label className="mb-2 block text-sm font-semibold text-gray-900">
                                  Ansprechpartner auswählen
                                </label>
                                <select
                                  value={selectedContactOwnerId}
                                  onChange={(event) =>
                                    setContactOwnerIdByRequestId((prev) => ({
                                      ...prev,
                                      [request.id]: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-xl border border-blue-300 bg-white px-3 py-3 text-sm"
                                >
                                  <option value="">Bitte auswählen</option>
                                  {owners.map((owner) => (
                                    <option key={owner.id} value={owner.id}>
                                      {getOwnerName(owner)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-semibold text-gray-900">Status ändern</label>
                            <select
                              value={request.status}
                              onChange={(event) => updateStatus(request.id, event.target.value)}
                              disabled={savingId === request.id || isCreatingOrders}
                              className="w-full rounded-xl border border-gray-300 px-3 py-3"
                            >
                              <option value="OFFEN">OFFEN</option>
                              <option value="IN_BEARBEITUNG">IN_BEARBEITUNG</option>
                              <option value="ERLEDIGT">ERLEDIGT</option>
                              <option value="ABGELEHNT">ABGELEHNT</option>
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => createOrdersFromRequest(request)}
                            disabled={!canCreateOrders || isCreatingOrders || savingId === request.id}
                            className="w-full rounded-xl bg-black px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                          >
                            {isCreatingOrders ? "Erzeuge Aufträge..." : "Aufträge erzeugen"}
                          </button>

                          {request.status === "ERLEDIGT" ? (
                            <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-900">
                              Diese Anfrage ist erledigt. Für erledigte Anfragen können hier keine weiteren Aufträge erzeugt werden.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}