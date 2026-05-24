"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import QrScannerModal from "@/components/orders/qr-scanner-modal";
import type { Pinpoint } from "@/components/orders/order-field-map";
import { area } from "@turf/area";

const OrderFieldMap = dynamic(
  () => import("@/components/orders/order-field-map"),
  { ssr: false }
);

const PinpointNavigationModal = dynamic(
  () => import("@/components/orders/pinpoint-navigation-modal"),
  { ssr: false }
);

type OrderStatus = "OFFEN" | "IN_ARBEIT" | "ERLEDIGT";
type PinpointStatus = "OFFEN" | "ERREICHT" | "ERLEDIGT";

type RevierPachter = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
};

type RevierAssignment = {
  id: string;
  overlapSqm?: number | null;
  overlapPercent?: number | null;
  revier?: {
    id: string;
    name?: string | null;
    nummer?: string | null;
    artNr?: string | null;
    paechter?: {
      id: string;
      pachter?: RevierPachter | null;
    }[];
  } | null;
};

type Owner = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
};

type Field = {
  id: string;
  name?: string | null;
  displayName?: string | null;
  areaGeoJson?: GeoJSON.Feature<GeoJSON.Polygon> | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationNote?: string | null;
};

type Team = {
  id: string;
  name?: string | null;
};

;

type Order = {
  id: string;
  title?: string | null;
  orderCode?: string | null;
  ownerId: string;
  fieldId: string;
  teamId: string | null;
  mowingDate?: string | null;
  notes?: string | null;
  status: OrderStatus;
  startTime?: string | null;
  endTime?: string | null;
  rehkitzeGesichert?: number;
  rehkitzeAbgesprungen?: number;
  sonstigesWildGesichert?: number;
  sonstigesWildAbgesprungen?: number;
  maulwurfhuegelFehlstelle?: number;
  owner?: Owner | null;
  field?: Field | null;
  team?: Team | null;
  pinpoints?: Pinpoint[];
  reviere?: RevierAssignment[];
};

type DraftValues = {
  notes: string;
  rehkitzeGesichert: string;
  rehkitzeAbgesprungen: string;
  sonstigesWildGesichert: string;
  sonstigesWildAbgesprungen: string;
  maulwurfhuegelFehlstelle: string;
};

type PinpointDraft = {
  note: string;
  rehkitzeGesichert: string;
  rehkitzeAbgesprungen: string;
  sonstigesWildGesichert: string;
  sonstigesWildAbgesprungen: string;
  maulwurfhuegelFehlstelle: string;
};

type FinishModalState = {
  open: boolean;
  orderId: string | null;
};

function formatStatus(status: OrderStatus) {
  if (status === "OFFEN") return "Offen";
  if (status === "IN_ARBEIT") return "In Arbeit";
  return "Erledigt";
}

function getStatusClasses(status: OrderStatus) {
  if (status === "OFFEN") {
    return "border-gray-300 bg-gray-100 text-gray-900";
  }
  if (status === "IN_ARBEIT") {
    return "border-yellow-300 bg-yellow-100 text-yellow-900";
  }
  return "border-green-300 bg-green-100 text-green-900";
}

function getPinpointStatusClass(status: PinpointStatus) {
  if (status === "ERLEDIGT") return "border-green-300 bg-green-100 text-green-900";
  if (status === "ERREICHT") return "border-yellow-300 bg-yellow-100 text-yellow-900";
  return "border-red-300 bg-red-100 text-red-900";
}

function formatPinpointStatus(status: PinpointStatus) {
  if (status === "ERLEDIGT") return "Erledigt";
  if (status === "ERREICHT") return "In Arbeit";
  return "Offen";
}

function getTodayDateInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function getFieldCenter(
  feature: GeoJSON.Feature<GeoJSON.Polygon>
): { lat: number; lng: number } {
  const coords = feature.geometry.coordinates[0];

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  };
}

function formatTime(dateString: string | null | undefined) {
  if (!dateString) return null;
  return new Date(dateString).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getOwnerName(owner?: Owner | null) {
  if (!owner) return "Unbekannter Ansprechpartner";
  return (
    [owner.firstName || "", owner.lastName || ""].join(" ").trim() ||
    "Unbekannter Ansprechpartner"
  );
}

function getFieldLabel(field?: Field | null) {
  if (!field) return "Unbekannte Fläche";
  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} (${name})`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function getFieldAreaLabel(field?: Field | null) {
  if (!field?.areaGeoJson) return "-";

  try {
    const sqm = area(field.areaGeoJson);
    const hectare = sqm / 10000;

    if (!Number.isFinite(hectare) || hectare <= 0) {
      return "-";
    }

    return `${hectare.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ha`;
  } catch {
    return "-";
  }
}

function getTeamName(team?: Team | null) {
  return team?.name?.trim() || "nicht zugeordnet";
}

function getRevierLabel(assignment: RevierAssignment) {
  const revier = assignment.revier;

  if (!revier) return "Unbekanntes Revier";

  const name = (revier.name || "").trim();
  const artNr = (revier.artNr || "").trim();
  const nummer = (revier.nummer || "").trim();

  if (name && artNr) return `${name} (${artNr})`;
  if (name && nummer) return `${name} (${nummer})`;
  if (name) return name;
  if (artNr) return artNr;
  if (nummer) return nummer;

  return "Unbekanntes Revier";
}

function getPachterName(pachter?: RevierPachter | null) {
  if (!pachter) return "Unbekannter Pächter";

  return (
    [pachter.firstName || "", pachter.lastName || ""].join(" ").trim() ||
    "Unbekannter Pächter"
  );
}

function formatOverlap(assignment: RevierAssignment) {
  const percent =
    typeof assignment.overlapPercent === "number"
      ? assignment.overlapPercent
      : null;

  const sqm =
    typeof assignment.overlapSqm === "number" ? assignment.overlapSqm : null;

  if (percent != null && sqm != null) {
    return `${percent.toFixed(1)} % · ${Math.round(sqm).toLocaleString(
      "de-DE"
    )} m²`;
  }

  if (percent != null) return `${percent.toFixed(1)} %`;
  if (sqm != null) return `${Math.round(sqm).toLocaleString("de-DE")} m²`;

  return "";
}

function getOrderLabel(order: Order) {
  return order.orderCode || order.title || "Ohne Nummer";
}

function toNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function getManualOrderTotals(order: Order) {
  return {
    rehkitzeGesichert: order.rehkitzeGesichert ?? 0,
    rehkitzeAbgesprungen: order.rehkitzeAbgesprungen ?? 0,
    sonstigesWildGesichert: order.sonstigesWildGesichert ?? 0,
    sonstigesWildAbgesprungen: order.sonstigesWildAbgesprungen ?? 0,
    maulwurfhuegelFehlstelle: order.maulwurfhuegelFehlstelle ?? 0,
  };
}

function getPinpointTotals(pinpoints?: Pinpoint[]) {
  return (pinpoints || []).reduce(
    (acc, pinpoint) => {
      acc.rehkitzeGesichert += pinpoint.rehkitzeGesichert ?? 0;
      acc.rehkitzeAbgesprungen += pinpoint.rehkitzeAbgesprungen ?? 0;
      acc.sonstigesWildGesichert += pinpoint.sonstigesWildGesichert ?? 0;
      acc.sonstigesWildAbgesprungen += pinpoint.sonstigesWildAbgesprungen ?? 0;
      acc.maulwurfhuegelFehlstelle += pinpoint.maulwurfhuegelFehlstelle ?? 0;
      return acc;
    },
    {
      rehkitzeGesichert: 0,
      rehkitzeAbgesprungen: 0,
      sonstigesWildGesichert: 0,
      sonstigesWildAbgesprungen: 0,
      maulwurfhuegelFehlstelle: 0,
    }
  );
}

function buildDraftFromOrder(order: Order): DraftValues {
  const manual = getManualOrderTotals(order);

  return {
    notes: order.notes || "",
    rehkitzeGesichert: String(manual.rehkitzeGesichert),
    rehkitzeAbgesprungen: String(manual.rehkitzeAbgesprungen),
    sonstigesWildGesichert: String(manual.sonstigesWildGesichert),
    sonstigesWildAbgesprungen: String(manual.sonstigesWildAbgesprungen),
    maulwurfhuegelFehlstelle: String(manual.maulwurfhuegelFehlstelle),
  };
}

function buildPinpointDraft(pinpoint?: Pinpoint): PinpointDraft {
  return {
    note: pinpoint?.note || "",
    rehkitzeGesichert: String(pinpoint?.rehkitzeGesichert ?? 0),
    rehkitzeAbgesprungen: String(pinpoint?.rehkitzeAbgesprungen ?? 0),
    sonstigesWildGesichert: String(pinpoint?.sonstigesWildGesichert ?? 0),
    sonstigesWildAbgesprungen: String(pinpoint?.sonstigesWildAbgesprungen ?? 0),
    maulwurfhuegelFehlstelle: String(pinpoint?.maulwurfhuegelFehlstelle ?? 0),
  };
}

function InfoCard({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-card-muted p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
        {label}
      </div>
      {value !== undefined ? (
        <div className="mt-1 text-sm font-medium text-gray-900">{value}</div>
      ) : (
        <div className="mt-1">{children}</div>
      )}
    </div>
  );
}

export default function MyOrdersPageClient({
  isAdmin,
  role,
}: {
  isAdmin: boolean;
  role: string;
}) {
  const [selectedDate, setSelectedDate] = useState(getTodayDateInputValue());
  const [orders, setOrders] = useState<Order[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftValues>>({});
  const [pinpointDrafts, setPinpointDrafts] = useState<Record<string, PinpointDraft>>({});
  const [newPinpointText, setNewPinpointText] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [finishModal, setFinishModal] = useState<FinishModalState>({
    open: false,
    orderId: null,
  });
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [pinpointModalId, setPinpointModalId] = useState<string | null>(null);
  const [openOwnerSections, setOpenOwnerSections] = useState<Record<string, boolean>>({});
  const [openInfoSections, setOpenInfoSections] = useState<Record<string, boolean>>({});
  const [openPinpoints, setOpenPinpoints] = useState<Record<string, boolean>>({});
  const [qrScannerOrderId, setQrScannerOrderId] = useState<string | null>(null);
  const [scanSuccessMessage, setScanSuccessMessage] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<{
  order: Order;
  pinpoint: Pinpoint;
} | null>(null);

  const canControlOrder = isAdmin || role === "PILOT";
  const canScanQr = isAdmin || role === "PILOT" || role === "SUCHER";
  const qrScanLockedUntilRef = useRef<Record<string, number>>({});

  async function loadOrders() {
    setLoading(true);

    try {
      const res = await fetch(
  `/api/orders?date=${encodeURIComponent(selectedDate)}`,
  { cache: "no-store" }
);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Aufträge konnten nicht geladen werden.");
      }

      const loadedOrders = Array.isArray(data) ? data : [];
      setOrders(loadedOrders);

      const nextDrafts: Record<string, DraftValues> = {};
      const nextPinpointDrafts: Record<string, PinpointDraft> = {};

      for (const order of loadedOrders) {
        nextDrafts[order.id] = buildDraftFromOrder(order);

        for (const pinpoint of order.pinpoints || []) {
          nextPinpointDrafts[pinpoint.id] = buildPinpointDraft(pinpoint);
        }
      }

      setDrafts(nextDrafts);
      setPinpointDrafts(nextPinpointDrafts);

      setOpenOrderId((prev) => {
        if (prev && loadedOrders.some((o) => o.id === prev && o.status !== "ERLEDIGT")) {
          return prev;
        }
        const inProgress = loadedOrders.find((o) => o.status === "IN_ARBEIT");
        return inProgress?.id || loadedOrders.find((o) => o.status !== "ERLEDIGT")?.id || null;
      });
    } catch (error) {
      console.error("Fehler beim Laden der Aufträge:", error);
      alert("Aufträge konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();

    const eventSource = new EventSource("/api/orders/stream");

    const reload = () => {
      loadOrders();
    };

    eventSource.addEventListener("orders_changed", reload);

    eventSource.onerror = (error) => {
      console.error("SSE My Orders Fehler:", error);
    };

    return () => {
      eventSource.removeEventListener("orders_changed", reload);
      eventSource.close();
    };
  }, [selectedDate]);

  function toggleInfoSection(orderId: string) {
    setOpenInfoSections((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  }

  function toggleOwnerSection(orderId: string) {
    setOpenOwnerSections((prev) => ({
      ...prev,
      [orderId]: !prev[orderId],
    }));
  }

  function togglePinpoint(pinpointId: string) {
    setOpenPinpoints((prev) => ({
      ...prev,
      [pinpointId]: !prev[pinpointId],
    }));
  }

  function updateDraft(orderId: string, changes: Partial<DraftValues>) {
    setDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {
          notes: "",
          rehkitzeGesichert: "0",
          rehkitzeAbgesprungen: "0",
          sonstigesWildGesichert: "0",
          sonstigesWildAbgesprungen: "0",
          maulwurfhuegelFehlstelle: "0",
        }),
        ...changes,
      },
    }));
  }

  function updatePinpointDraft(pinpointId: string, changes: Partial<PinpointDraft>) {
    setPinpointDrafts((prev) => ({
      ...prev,
      [pinpointId]: {
        ...(prev[pinpointId] || buildPinpointDraft()),
        ...changes,
      },
    }));
  }

  function getDraft(order: Order): DraftValues {
    return drafts[order.id] || buildDraftFromOrder(order);
  }

  function getPinpointDraft(pinpoint: Pinpoint): PinpointDraft {
    return pinpointDrafts[pinpoint.id] || buildPinpointDraft(pinpoint);
  }

  function getModalOrder() {
    if (!finishModal.orderId) return null;
    return orders.find((o) => o.id === finishModal.orderId) || null;
  }

  function getModalPinpoint() {
    for (const order of orders) {
      const found = (order.pinpoints || []).find((p) => p.id === pinpointModalId);
      if (found) {
        return {
          order,
          pinpoint: found,
        };
      }
    }
    return null;
  }

async function handleQrScanSuccess(decodedText: string) {
  if (!qrScannerOrderId) return;

  const orderId = qrScannerOrderId;
  const now = Date.now();
  const lockedUntil = qrScanLockedUntilRef.current[orderId] || 0;

  if (now < lockedUntil) {
    return;
  }

  qrScanLockedUntilRef.current[orderId] = now + 2000;

  const order = orders.find((o) => o.id === orderId);

  setNewPinpointText((prev) => ({
    ...prev,
    [orderId]: decodedText,
  }));

  setQrScannerOrderId(null);

  if (!order) {
    return;
  }

  setSavingId(order.id);

  try {
    const res = await fetch(`/api/orders/${order.id}/pinpoints`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rawQrText: decodedText }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "PinPoint konnte nicht gespeichert werden.");
    }

    setNewPinpointText((prev) => ({ ...prev, [order.id]: "" }));
    await loadOrders();
    setScanSuccessMessage("PinPoint erfolgreich gespeichert.");
setTimeout(() => setScanSuccessMessage(null), 2200);
  } catch (error: any) {
    console.error("Fehler beim automatischen Speichern des PinPoints:", error);
    alert(error?.message || "PinPoint konnte nicht gespeichert werden.");
  } finally {
    setSavingId(null);
  }
}

  async function patchPinpointStatus(
    orderId: string,
    pinpointId: string,
    payload: Record<string, unknown>
  ) {
    const res = await fetch(`/api/orders/${orderId}/pinpoints/${pinpointId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "PinPoint konnte nicht aktualisiert werden.");
    }

    return data;
  }

  async function saveOrderWithDraft(
    order: Order,
    nextStatus?: OrderStatus,
    options?: { confirmWildData?: boolean }
  ) {
    if (!canControlOrder) return;

    const draft = getDraft(order);
    setSavingId(order.id);

    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: nextStatus ?? order.status,
          notes: draft.notes,
          rehkitzeGesichert: toNumber(draft.rehkitzeGesichert),
          rehkitzeAbgesprungen: toNumber(draft.rehkitzeAbgesprungen),
          sonstigesWildGesichert: toNumber(draft.sonstigesWildGesichert),
          sonstigesWildAbgesprungen: toNumber(draft.sonstigesWildAbgesprungen),
          maulwurfhuegelFehlstelle: toNumber(draft.maulwurfhuegelFehlstelle),
          confirmWildData: options?.confirmWildData === true,
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
        throw new Error(data?.error || "Speichern fehlgeschlagen.");
      }

      setFinishModal({ open: false, orderId: null });
      await loadOrders();
    } catch (error: any) {
      console.error("saveOrderWithDraft Fehler:", error);
      alert(error?.message || "Speichern fehlgeschlagen.");
    } finally {
      setSavingId(null);
    }
  }

  async function addPinpoint(order: Order) {
    const rawQrText = (newPinpointText[order.id] || "").trim();

    if (!rawQrText) {
      alert("Bitte QR-Link oder QR-Inhalt einfügen.");
      return;
    }

    setSavingId(order.id);

    try {
      const res = await fetch(`/api/orders/${order.id}/pinpoints`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rawQrText }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "PinPoint konnte nicht gespeichert werden.");
      }

      setNewPinpointText((prev) => ({ ...prev, [order.id]: "" }));
      await loadOrders();
    } catch (error: any) {
      console.error("Fehler beim Anlegen des PinPoints:", error);
      alert(error?.message || "PinPoint konnte nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
  }

  function markPinpointReached(_order: Order, pinpoint: Pinpoint) {
    updatePinpointDraft(pinpoint.id, buildPinpointDraft(pinpoint));
    setPinpointModalId(pinpoint.id);
  }

  async function navigateToField(field?: Field | null) {
  if (
    typeof field?.locationLatitude !== "number" ||
    typeof field?.locationLongitude !== "number"
  ) {
    alert("Für diese Fläche ist kein Treffpunkt gesetzt.");
    return;
  }

  const lat = field.locationLatitude;
  const lng = field.locationLongitude;

  if (typeof window !== "undefined") {
    const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent);

    const nativeUrl = isIOS
      ? `maps://?daddr=${lat},${lng}`
      : `geo:${lat},${lng}?q=${lat},${lng}`;

    window.location.href = nativeUrl;
  }
}

  async function navigateToPinpoint(order: Order, pinpoint: Pinpoint) {
  setSavingId(pinpoint.id);

  try {
    let nextPinpoint = pinpoint;

    if (pinpoint.status === "OFFEN") {
      const updated = await patchPinpointStatus(order.id, pinpoint.id, {
        status: "ERREICHT",
      });

      nextPinpoint = {
        ...pinpoint,
        status: "ERREICHT",
        reachedAt: updated?.reachedAt || pinpoint.reachedAt || null,
      };

      await loadOrders();
    }

    setNavigationTarget({
      order,
      pinpoint: nextPinpoint,
    });
  } catch (error: any) {
    console.error("Fehler beim Starten der In-App-Navigation:", error);
    alert(error?.message || "Navigation konnte nicht gestartet werden.");
  } finally {
    setSavingId(null);
  }
}

  function navigateToPinpointGoogle(pinpoint: Pinpoint) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${pinpoint.latitude},${pinpoint.longitude}`;
    window.open(url, "_blank");
  }

  async function savePinpointReachedResult(order: Order, pinpoint: Pinpoint) {
    const draft = getPinpointDraft(pinpoint);
    setSavingId(pinpoint.id);

    try {
      await patchPinpointStatus(order.id, pinpoint.id, {
        status: "ERLEDIGT",
        note: draft.note,
        rehkitzeGesichert: toNumber(draft.rehkitzeGesichert),
        rehkitzeAbgesprungen: toNumber(draft.rehkitzeAbgesprungen),
        sonstigesWildGesichert: toNumber(draft.sonstigesWildGesichert),
        sonstigesWildAbgesprungen: toNumber(draft.sonstigesWildAbgesprungen),
        maulwurfhuegelFehlstelle: toNumber(draft.maulwurfhuegelFehlstelle),
      });

      setPinpointModalId(null);
      await loadOrders();
    } catch (error: any) {
      console.error("Fehler beim Speichern des PinPoint-Fundes:", error);
      alert(error?.message || "PinPoint-Ergebnis konnte nicht gespeichert werden.");
    } finally {
      setSavingId(null);
    }
  }

  function openFinishModal(order: Order) {
    setFinishModal({
      open: true,
      orderId: order.id,
    });
  }

  const filteredOrders = useMemo(() => {
    const activeOrders = orders.filter((order) => order.status !== "ERLEDIGT");
    const term = search.trim().toLowerCase();

    if (!term) return activeOrders;

    return activeOrders.filter((order) =>
      [
        getOrderLabel(order),
        order.owner?.firstName || "",
        order.owner?.lastName || "",
        order.owner?.phone || "",
        order.owner?.email || "",
        order.owner?.street || "",
        order.owner?.zip || "",
        order.owner?.city || "",
        order.field?.name || "",
        order.field?.displayName || "",
        order.team?.name || "",
        order.notes || "",
        order.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [orders, search]);

  const modalOrder = getModalOrder();
  const modalDraft = modalOrder ? getDraft(modalOrder) : null;

  const modalPinpointData = getModalPinpoint();
  const modalPinpointOrder = modalPinpointData?.order || null;
  const modalPinpoint = modalPinpointData?.pinpoint || null;
  const modalPinpointDraft = modalPinpoint ? getPinpointDraft(modalPinpoint) : null;

  const modalManualTotals = modalOrder
    ? {
        rehkitzeGesichert: modalDraft ? toNumber(modalDraft.rehkitzeGesichert) : 0,
        rehkitzeAbgesprungen: modalDraft ? toNumber(modalDraft.rehkitzeAbgesprungen) : 0,
        sonstigesWildGesichert: modalDraft ? toNumber(modalDraft.sonstigesWildGesichert) : 0,
        sonstigesWildAbgesprungen: modalDraft ? toNumber(modalDraft.sonstigesWildAbgesprungen) : 0,
        maulwurfhuegelFehlstelle: modalDraft ? toNumber(modalDraft.maulwurfhuegelFehlstelle) : 0,
      }
    : null;

  const modalPinpointTotals = modalOrder ? getPinpointTotals(modalOrder.pinpoints) : null;

  const modalCombinedTotals =
    modalManualTotals && modalPinpointTotals
      ? {
          rehkitzeGesichert:
            modalManualTotals.rehkitzeGesichert + modalPinpointTotals.rehkitzeGesichert,
          rehkitzeAbgesprungen:
            modalManualTotals.rehkitzeAbgesprungen + modalPinpointTotals.rehkitzeAbgesprungen,
          sonstigesWildGesichert:
            modalManualTotals.sonstigesWildGesichert + modalPinpointTotals.sonstigesWildGesichert,
          sonstigesWildAbgesprungen:
            modalManualTotals.sonstigesWildAbgesprungen + modalPinpointTotals.sonstigesWildAbgesprungen,
          maulwurfhuegelFehlstelle:
            modalManualTotals.maulwurfhuegelFehlstelle + modalPinpointTotals.maulwurfhuegelFehlstelle,
        }
      : null;

  const modalCombinedTotalWild = modalCombinedTotals
    ? modalCombinedTotals.rehkitzeGesichert +
      modalCombinedTotals.rehkitzeAbgesprungen +
      modalCombinedTotals.sonstigesWildGesichert +
      modalCombinedTotals.sonstigesWildAbgesprungen +
      modalCombinedTotals.maulwurfhuegelFehlstelle
    : 0;

  return (
    <>
      <main className="min-h-screen bg-gray-50 p-3 md:p-6">
        <div className="mx-auto max-w-6xl space-y-4 md:space-y-5">
          <section className="page-card p-4 md:p-6">
            <h1 className="text-2xl font-bold text-gray-900">Meine Aufträge</h1>
            <p className="mt-2 text-sm text-gray-700">
              Rot = offen, Gelb = in Arbeit, Grün = erledigt. Beim Starten der
              Navigation wird der PinPoint automatisch auf „In Arbeit“ gesetzt.
            </p>
          </section>

          <section className="page-card p-4">
  <label className="mb-2 block text-sm font-semibold text-gray-900">
    Einsatztag
  </label>

  <input
    type="date"
    value={selectedDate}
    onChange={(e) => setSelectedDate(e.target.value)}
    className="w-full max-w-sm rounded-xl border px-3 py-3"
  />

  <p className="mt-2 text-sm text-gray-600">
    Wähle das Datum aus, für das du deine geplanten Aufträge sehen möchtest.
  </p>
</section>

          <section className="page-card p-4">
            <label className="mb-2 block text-sm font-semibold text-gray-900">
              Suche
            </label>
            <input
              type="text"
              placeholder="Nummer, Ansprechpartner, Fläche, Team ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border px-3 py-3"
            />
          </section>

          {loading ? (
            <section className="page-card p-6 text-sm text-gray-700">
              Aufträge werden geladen...
            </section>
          ) : filteredOrders.length === 0 ? (
            <section className="page-card p-6 text-sm text-gray-700">
              Keine offenen Aufträge gefunden.
            </section>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => {
                const draft = getDraft(order);
                const isOpen = openOrderId === order.id;
                const pinpointTotals = getPinpointTotals(order.pinpoints);
                const manualTotals = {
                  rehkitzeGesichert: toNumber(draft.rehkitzeGesichert),
                  rehkitzeAbgesprungen: toNumber(draft.rehkitzeAbgesprungen),
                  sonstigesWildGesichert: toNumber(draft.sonstigesWildGesichert),
                  sonstigesWildAbgesprungen: toNumber(draft.sonstigesWildAbgesprungen),
                  maulwurfhuegelFehlstelle: toNumber(draft.maulwurfhuegelFehlstelle),
                };
                const combinedTotals = {
                  rehkitzeGesichert:
                    manualTotals.rehkitzeGesichert + pinpointTotals.rehkitzeGesichert,
                  rehkitzeAbgesprungen:
                    manualTotals.rehkitzeAbgesprungen + pinpointTotals.rehkitzeAbgesprungen,
                  sonstigesWildGesichert:
                    manualTotals.sonstigesWildGesichert + pinpointTotals.sonstigesWildGesichert,
                  sonstigesWildAbgesprungen:
                    manualTotals.sonstigesWildAbgesprungen + pinpointTotals.sonstigesWildAbgesprungen,
                  maulwurfhuegelFehlstelle:
                    manualTotals.maulwurfhuegelFehlstelle + pinpointTotals.maulwurfhuegelFehlstelle,
                };

                return (
                  <section key={order.id} className="page-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenOrderId((prev) => (prev === order.id ? null : order.id))
                      }
                      className="flex w-full items-start justify-between gap-3 p-4 text-left md:p-5"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-bold text-gray-900 md:text-xl">
                            {getOrderLabel(order)}
                          </h2>

                          <span
                            className={`rounded-full border px-3 py-1 text-sm font-semibold ${getStatusClasses(
                              order.status
                            )}`}
                          >
                            {formatStatus(order.status)}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="page-card-muted px-3 py-2 text-sm text-gray-900">
                            <span className="font-semibold">Team:</span>{" "}
                            {getTeamName(order.team)}
                          </div>

                          <div className="page-card-muted px-3 py-2 text-sm text-gray-900">
  <span className="font-semibold">Mähdatum:</span>{" "}
  {order.mowingDate
    ? new Date(order.mowingDate).toLocaleDateString("de-DE")
    : "-"}
  <span className="mx-2 text-gray-400">·</span>
  <span className="font-semibold">Fläche:</span>{" "}
  {getFieldAreaLabel(order.field)}
</div>

                          {order.startTime && (
                            <div className="page-card-muted px-3 py-2 text-sm text-gray-900">
                              <span className="font-semibold">Start:</span>{" "}
                              {formatTime(order.startTime)} Uhr
                            </div>
                          )}

                          {order.endTime && (
                            <div className="page-card-muted px-3 py-2 text-sm text-gray-900">
                              <span className="font-semibold">Ende:</span>{" "}
                              {formatTime(order.endTime)} Uhr
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 rounded-full border border-gray-300 px-3 py-1 text-sm font-semibold text-gray-700">
                        {isOpen ? "−" : "+"}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-gray-200 px-4 pb-4 pt-4 md:px-5 md:pb-5">
                        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                          <div className="page-card-muted p-3 md:p-4">
                            <div className="mb-3 text-sm font-bold text-gray-900">
                              Flächenkarte
                            </div>

                            {order.field?.areaGeoJson ? (
                              <div className="map-wrapper">
                                <OrderFieldMap
  areaGeoJson={order.field.areaGeoJson}
  pinpoints={order.pinpoints || []}
  locationLatitude={order.field.locationLatitude}
  locationLongitude={order.field.locationLongitude}
  locationNote={order.field.locationNote}
  onPinpointClick={(pinpoint) =>
    markPinpointReached(order, pinpoint)
  }
/>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
                                Für diese Fläche sind keine Kartendaten vorhanden.
                              </div>
                            )}

                            {order.status !== "IN_ARBEIT" ? (
                              <button
                                type="button"
                                onClick={() => navigateToField(order.field)}
                                className="mt-3 block w-full rounded-xl bg-black py-3 text-center text-base font-semibold text-white"
                              >
                                🧭 Zur Fläche navigieren
                              </button>
                            ) : null}
                          </div>

                          <div className="page-card-muted p-3 md:p-4">
                            <button
                              type="button"
                              onClick={() => toggleInfoSection(order.id)}
                              className="mb-3 flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-3 text-left"
                            >
                              <span className="text-sm font-bold text-gray-900">
                                Einsatzinfos
                              </span>
                              <span className="text-sm font-semibold text-gray-700">
                                {openInfoSections[order.id] ? "−" : "+"}
                              </span>
                            </button>

                            <div className="space-y-3">
                              {openInfoSections[order.id] && (
                                <div className="space-y-3">
                                  <div className="page-card-muted p-3">
                                <button
                                  type="button"
                                  onClick={() => toggleOwnerSection(order.id)}
                                  className="flex w-full items-center justify-between text-left"
                                >
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                                    Ansprechpartner
                                  </div>
                                  <div className="text-sm font-semibold text-gray-700">
                                    {openOwnerSections[order.id] ? "−" : "+"}
                                  </div>
                                </button>

                                {openOwnerSections[order.id] && (
  <div className="mt-3">
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-sm font-bold text-gray-900">
        {getOwnerName(order.owner)}
      </div>

      {order.owner?.phone ? (
        <div className="mt-2 text-sm text-gray-800">
          Telefon:{" "}
          <a
            href={`tel:${order.owner.phone}`}
            className="font-semibold text-blue-700 underline"
          >
            {order.owner.phone}
          </a>
        </div>
      ) : (
        <div className="mt-2 text-sm text-gray-700">
          Telefon: -
        </div>
      )}

      {order.owner?.email ? (
        <div className="mt-1 text-sm text-gray-800">
          E-Mail:{" "}
          <a
            href={`mailto:${order.owner.email}`}
            className="font-semibold text-blue-700 underline"
          >
            {order.owner.email}
          </a>
        </div>
      ) : (
        <div className="mt-1 text-sm text-gray-700">
          E-Mail: -
        </div>
      )}

      {(order.owner?.street || order.owner?.zip || order.owner?.city) && (
        <div className="mt-2 text-sm text-gray-700">
          {[order.owner?.street, order.owner?.zip, order.owner?.city]
            .filter(Boolean)
            .join(", ")}
        </div>
      )}
    </div>
  </div>
)}
                              </div>

                              <InfoCard
                                label="Fläche"
                                value={getFieldLabel(order.field)}
                              />

                              <InfoCard label="Revier / Pächter">
  {!order.reviere || order.reviere.length === 0 ? (
    <div className="text-sm text-gray-700">
      Kein Revier zugeordnet.
    </div>
  ) : (
    <div className="space-y-3">
      {order.reviere.map((assignment) => {
        const paechter = assignment.revier?.paechter || [];
        const overlapText = formatOverlap(assignment);

        return (
          <div
            key={assignment.id}
            className="rounded-xl border border-gray-200 bg-white p-3"
          >
            <div className="text-sm font-bold text-gray-900">
              {getRevierLabel(assignment)}
            </div>

            {overlapText && (
              <div className="mt-1 text-xs text-gray-600">
                Überschneidung: {overlapText}
              </div>
            )}

            <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
              Pächter
            </div>

            {paechter.length === 0 ? (
              <div className="mt-1 text-sm text-gray-700">
                Kein Pächter hinterlegt.
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {paechter.map((item) => {
                  const pachter = item.pachter;

                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-sm text-gray-800"
                    >
                      <div className="font-semibold">
                        {getPachterName(pachter)}
                      </div>

                      {pachter?.phone && (
                        <div className="mt-1">
                          Telefon:{" "}
                          <a
                            href={`tel:${pachter.phone}`}
                            className="font-semibold text-blue-700 underline"
                          >
                            {pachter.phone}
                          </a>
                        </div>
                      )}

                      {pachter?.email && (
                        <div className="mt-1">
                          E-Mail:{" "}
                          <a
                            href={`mailto:${pachter.email}`}
                            className="font-semibold text-blue-700 underline"
                          >
                            {pachter.email}
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  )}
</InfoCard>

                              <div className="page-card-muted p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                                  Notizen
                                </div>
                                {canControlOrder ? (
                                  <textarea
                                    value={draft.notes}
                                    onChange={(e) =>
                                      updateDraft(order.id, { notes: e.target.value })
                                    }
                                    className="mt-2 min-h-[100px] w-full rounded-xl border px-3 py-2 text-gray-900"
                                  />
                                ) : (
                                  <div className="mt-2 text-sm text-gray-800">
                                    {order.notes || "-"}
                                  </div>
                                )}
                              </div>

                             

                              <div className="page-card-muted p-3">
                                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                                  Direktfunde durch Pilot ohne PinPoint
                                </div>

                                <div className="mb-3 text-sm text-gray-700">
                                  Nur hier eintragen, wenn der Pilot Wild direkt an
                                  seinem Standort gefunden hat und dafür kein PinPoint
                                  gesetzt wurde.
                                </div>

                                {canControlOrder ? (
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                      <label className="mb-1 block text-sm font-medium text-gray-800">
                                        Rehkitze gesichert
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={draft.rehkitzeGesichert}
                                        onChange={(e) =>
                                          updateDraft(order.id, {
                                            rehkitzeGesichert: e.target.value,
                                          })
                                        }
                                        className="w-full rounded-xl border px-3 py-3"
                                      />
                                    </div>

                                    <div>
                                      <label className="mb-1 block text-sm font-medium text-gray-800">
                                        Rehkitze abgesprungen
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={draft.rehkitzeAbgesprungen}
                                        onChange={(e) =>
                                          updateDraft(order.id, {
                                            rehkitzeAbgesprungen: e.target.value,
                                          })
                                        }
                                        className="w-full rounded-xl border px-3 py-3"
                                      />
                                    </div>

                                    <div>
                                      <label className="mb-1 block text-sm font-medium text-gray-800">
                                        Sonstiges Wild gesichert
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={draft.sonstigesWildGesichert}
                                        onChange={(e) =>
                                          updateDraft(order.id, {
                                            sonstigesWildGesichert: e.target.value,
                                          })
                                        }
                                        className="w-full rounded-xl border px-3 py-3"
                                      />
                                    </div>

                                    <div>
                                      <label className="mb-1 block text-sm font-medium text-gray-800">
                                        Sonstiges Wild abgesprungen
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={draft.sonstigesWildAbgesprungen}
                                        onChange={(e) =>
                                          updateDraft(order.id, {
                                            sonstigesWildAbgesprungen: e.target.value,
                                          })
                                        }
                                        className="w-full rounded-xl border px-3 py-3"
                                      />
                                    </div>

                                    <div className="sm:col-span-2">
                                      <label className="mb-1 block text-sm font-medium text-gray-800">
                                        Maulwurfhügel / Fehlstelle
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={draft.maulwurfhuegelFehlstelle}
                                        onChange={(e) =>
                                          updateDraft(order.id, {
                                            maulwurfhuegelFehlstelle: e.target.value,
                                          })
                                        }
                                        className="w-full rounded-xl border px-3 py-3"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-900">
                                      🦌 Rehkitze gesichert:{" "}
                                      <span className="font-semibold">
                                        {order.rehkitzeGesichert || 0}
                                      </span>
                                    </div>

                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                                      🦌 Rehkitze abgesprungen:{" "}
                                      <span className="font-semibold">
                                        {order.rehkitzeAbgesprungen || 0}
                                      </span>
                                    </div>

                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                                      🌿 Sonstiges Wild gesichert:{" "}
                                      <span className="font-semibold">
                                        {order.sonstigesWildGesichert || 0}
                                      </span>
                                    </div>

                                    <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-3 text-sm text-orange-900">
                                      🌿 Sonstiges Wild abgesprungen:{" "}
                                      <span className="font-semibold">
                                        {order.sonstigesWildAbgesprungen || 0}
                                      </span>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 sm:col-span-2">
                                      🕳️ Maulwurfhügel / Fehlstelle:{" "}
                                      <span className="font-semibold">
                                        {order.maulwurfhuegelFehlstelle || 0}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                                </div>
                              )}

                              {order.status === "IN_ARBEIT" && (
  <div className="page-card-muted p-3">
    <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
      PinPoints
    </div>

    {canScanQr && (
      <div className="mb-4 space-y-2">
        <textarea
          value={newPinpointText[order.id] || ""}
          onChange={(e) =>
            setNewPinpointText((prev) => ({
              ...prev,
              [order.id]: e.target.value,
            }))
          }
          placeholder="DJI QR-Link oder QR-Inhalt hier einfügen"
          className="min-h-[90px] w-full rounded-xl border px-3 py-2 text-gray-900"
        />

        <div className="grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setQrScannerOrderId(order.id)}
            className="w-full rounded-xl border border-blue-300 bg-blue-50 py-3 text-sm font-semibold text-blue-800"
          >
            📷 QR-Code scannen
          </button>

          <button
            type="button"
            onClick={() => addPinpoint(order)}
            disabled={savingId === order.id}
            className="w-full rounded-xl bg-black py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            📍 PinPoint scannen / übernehmen
          </button>
        </div>
      </div>
    )}

    {!order.pinpoints || order.pinpoints.length === 0 ? (
      <div className="text-sm text-gray-700">
        Noch keine PinPoints vorhanden.
      </div>
    ) : (
      <div className="space-y-3">
        {order.pinpoints.map((pinpoint) => (
          <div
            key={pinpoint.id}
            className="rounded-xl border border-gray-200 bg-white p-3"
          >
            <button
  type="button"
  onClick={() => togglePinpoint(pinpoint.id)}
  className={`flex w-full items-start justify-between gap-3 rounded-xl border p-4 text-left ${
    pinpoint.status === "ERLEDIGT"
      ? "border-green-300 bg-green-50"
      : pinpoint.status === "ERREICHT"
      ? "border-yellow-300 bg-yellow-50"
      : "border-red-300 bg-red-50"
  }`}
>
  <div className="min-w-0">
    <div className="flex flex-wrap items-center gap-2">
      <div className="text-lg font-bold text-gray-900">
        📍 PinPoint {pinpoint.sequenceNumber}
      </div>

      <span
        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getPinpointStatusClass(
          pinpoint.status
        )}`}
      >
        {formatPinpointStatus(pinpoint.status)}
      </span>
    </div>

  </div>  

  <div className="shrink-0 rounded-full border border-gray-300 bg-white px-3 py-1 text-sm font-bold text-gray-700">
    {openPinpoints[pinpoint.id] ? "−" : "+"}
  </div>
</button>

            {openPinpoints[pinpoint.id] && (
              <div className="mt-3">
                <div className="text-sm text-gray-700">
                  {pinpoint.latitude}, {pinpoint.longitude}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-1 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => navigateToPinpoint(order, pinpoint)}
                    disabled={savingId === pinpoint.id}
                    className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {savingId === pinpoint.id
                      ? "Startet..."
                      : "🧭 Navigation starten"}
                  </button>

                  <button
                    type="button"
                    onClick={() => navigateToPinpointGoogle(pinpoint)}
                    className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800"
                  >
                    Google Maps
                  </button>

                  {pinpoint.status !== "ERLEDIGT" && (
                    <button
                      type="button"
                      onClick={() => markPinpointReached(order, pinpoint)}
                      disabled={savingId === pinpoint.id}
                      className="rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-900 disabled:opacity-50"
                    >
                      ✅ PinPoint erreicht
                    </button>
                  )}
                </div>

                {(pinpoint.note ||
                  (pinpoint.rehkitzeGesichert ?? 0) > 0 ||
                  (pinpoint.rehkitzeAbgesprungen ?? 0) > 0 ||
                  (pinpoint.sonstigesWildGesichert ?? 0) > 0 ||
                  (pinpoint.sonstigesWildAbgesprungen ?? 0) > 0 ||
                  (pinpoint.maulwurfhuegelFehlstelle ?? 0) > 0) && (
                  <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
                    <div>
                      Rehkitze gesichert:{" "}
                      <span className="font-semibold">
                        {pinpoint.rehkitzeGesichert ?? 0}
                      </span>
                    </div>
                    <div>
                      Rehkitze abgesprungen:{" "}
                      <span className="font-semibold">
                        {pinpoint.rehkitzeAbgesprungen ?? 0}
                      </span>
                    </div>
                    <div>
                      Sonstiges Wild gesichert:{" "}
                      <span className="font-semibold">
                        {pinpoint.sonstigesWildGesichert ?? 0}
                      </span>
                    </div>
                    <div>
                      Sonstiges Wild abgesprungen:{" "}
                      <span className="font-semibold">
                        {pinpoint.sonstigesWildAbgesprungen ?? 0}
                      </span>
                    </div>
                    <div>
                      Maulwurfhügel / Fehlstelle:{" "}
                      <span className="font-semibold">
                        {pinpoint.maulwurfhuegelFehlstelle ?? 0}
                      </span>
                    </div>
                    <div className="mt-2">
                      <span className="font-semibold">Notiz:</span>{" "}
                      {pinpoint.note || "-"}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
)}

{canControlOrder && (
  <div className="mt-4 grid gap-2 md:grid-cols-2">
    <button
      type="button"
      onClick={() => saveOrderWithDraft(order, "IN_ARBEIT")}
      disabled={savingId === order.id || order.status === "IN_ARBEIT"}
      className="w-full rounded-xl bg-yellow-400 py-3 text-base font-semibold text-black disabled:opacity-50"
    >
      ▶ Start / In Arbeit
    </button>

    <button
      type="button"
      onClick={() => openFinishModal(order)}
      disabled={savingId === order.id || order.status === "ERLEDIGT"}
      className="w-full rounded-xl bg-green-600 py-3 text-base font-semibold text-white disabled:opacity-50"
    >
      ✔ Stop / Erledigt
    </button>
  </div>
)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {finishModal.open &&
        modalOrder &&
        modalDraft &&
        modalManualTotals &&
        modalPinpointTotals &&
        modalCombinedTotals && (
          <div className="fixed inset-0 z-[100] bg-black/40 p-3 md:p-4">
            <div className="flex h-full items-center justify-center">
              <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="border-b border-gray-200 px-4 py-4 md:px-5">
                  <h2 className="text-xl font-bold text-gray-900">Auftrag prüfen</h2>

                  <p className="mt-2 text-sm text-gray-700">
                    Bitte prüfe die Wilddaten vor dem endgültigen Beenden.
                  </p>

                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-sm font-semibold text-gray-900">
                      {getOrderLabel(modalOrder)}
                    </div>
                    <div className="mt-1 text-sm text-gray-700">
                      {getFieldLabel(modalOrder.field)}
                    </div>
                  </div>
                </div>

                <div className="overflow-y-auto px-4 py-4 md:px-5">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-3 text-sm font-semibold text-gray-900">
                      Direktfunde Pilot ohne PinPoint
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-800">
                          Rehkitze gesichert
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={modalDraft.rehkitzeGesichert}
                          onChange={(e) =>
                            updateDraft(modalOrder.id, {
                              rehkitzeGesichert: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border px-3 py-3"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-800">
                          Rehkitze abgesprungen
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={modalDraft.rehkitzeAbgesprungen}
                          onChange={(e) =>
                            updateDraft(modalOrder.id, {
                              rehkitzeAbgesprungen: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border px-3 py-3"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-800">
                          Sonstiges Wild gesichert
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={modalDraft.sonstigesWildGesichert}
                          onChange={(e) =>
                            updateDraft(modalOrder.id, {
                              sonstigesWildGesichert: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border px-3 py-3"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-800">
                          Sonstiges Wild abgesprungen
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={modalDraft.sonstigesWildAbgesprungen}
                          onChange={(e) =>
                            updateDraft(modalOrder.id, {
                              sonstigesWildAbgesprungen: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border px-3 py-3"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-800">
                          Maulwurfhügel / Fehlstelle
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={modalDraft.maulwurfhuegelFehlstelle}
                          onChange={(e) =>
                            updateDraft(modalOrder.id, {
                              maulwurfhuegelFehlstelle: e.target.value,
                            })
                          }
                          className="w-full rounded-xl border px-3 py-3"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-3 text-sm font-semibold text-gray-900">
                      Erledigte PinPoints
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                        <div className="text-xs font-medium text-green-700">
                          Rehkitze gesichert
                        </div>
                        <div className="mt-1 text-xl font-bold text-green-900">
                          {modalPinpointTotals.rehkitzeGesichert}
                        </div>
                      </div>

                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <div className="text-xs font-medium text-amber-700">
                          Rehkitze abgesprungen
                        </div>
                        <div className="mt-1 text-xl font-bold text-amber-900">
                          {modalPinpointTotals.rehkitzeAbgesprungen}
                        </div>
                      </div>

                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <div className="text-xs font-medium text-emerald-700">
                          Sonstiges Wild gesichert
                        </div>
                        <div className="mt-1 text-xl font-bold text-emerald-900">
                          {modalPinpointTotals.sonstigesWildGesichert}
                        </div>
                      </div>

                      <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                        <div className="text-xs font-medium text-orange-700">
                          Sonstiges Wild abgesprungen
                        </div>
                        <div className="mt-1 text-xl font-bold text-orange-900">
                          {modalPinpointTotals.sonstigesWildAbgesprungen}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                        <div className="text-xs font-medium text-slate-700">
                          Maulwurfhügel / Fehlstelle
                        </div>
                        <div className="mt-1 text-xl font-bold text-slate-900">
                          {modalPinpointTotals.maulwurfhuegelFehlstelle}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-3 text-sm font-semibold text-gray-900">
                      Gesamtwerte
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                        <div className="text-xs font-medium text-green-700">
                          Rehkitze gesichert
                        </div>
                        <div className="mt-1 text-xl font-bold text-green-900">
                          {modalCombinedTotals.rehkitzeGesichert}
                        </div>
                      </div>

                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <div className="text-xs font-medium text-amber-700">
                          Rehkitze abgesprungen
                        </div>
                        <div className="mt-1 text-xl font-bold text-amber-900">
                          {modalCombinedTotals.rehkitzeAbgesprungen}
                        </div>
                      </div>

                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <div className="text-xs font-medium text-emerald-700">
                          Sonstiges Wild gesichert
                        </div>
                        <div className="mt-1 text-xl font-bold text-emerald-900">
                          {modalCombinedTotals.sonstigesWildGesichert}
                        </div>
                      </div>

                      <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                        <div className="text-xs font-medium text-orange-700">
                          Sonstiges Wild abgesprungen
                        </div>
                        <div className="mt-1 text-xl font-bold text-orange-900">
                          {modalCombinedTotals.sonstigesWildAbgesprungen}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                        <div className="text-xs font-medium text-slate-700">
                          Maulwurfhügel / Fehlstelle
                        </div>
                        <div className="mt-1 text-xl font-bold text-slate-900">
                          {modalCombinedTotals.maulwurfhuegelFehlstelle}
                        </div>
                      </div>
                    </div>
                  </div>

                  {modalCombinedTotalWild === 0 && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Achtung: Aktuell sind überall 0 eingetragen. Bitte prüfen,
                      ob das so korrekt ist.
                    </div>
                  )}

                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    Nach dem Beenden kann der Auftrag nicht mehr geändert werden.
                  </div>
                </div>

                <div className="border-t border-gray-200 px-4 py-4 md:px-5">
                  <div className="flex flex-col gap-2 md:flex-row md:justify-end">
                    <button
                      type="button"
                      onClick={() => setFinishModal({ open: false, orderId: null })}
                      className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-800"
                    >
                      Zurück
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        saveOrderWithDraft(modalOrder, "ERLEDIGT", {
                          confirmWildData: true,
                        })
                      }
                      disabled={savingId === modalOrder.id}
                      className="rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {savingId === modalOrder.id
                        ? "Speichert..."
                        : "Jetzt erledigt setzen"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      {modalPinpoint && modalPinpointOrder && modalPinpointDraft && (
        <div className="fixed inset-0 z-[110] bg-black/40 p-3 md:p-4">
          <div className="flex h-full items-center justify-center">
            <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="border-b border-gray-200 px-4 py-4 md:px-5">
                <h2 className="text-xl font-bold text-gray-900">
                  PinPoint {modalPinpoint.sequenceNumber}
                </h2>
                <p className="mt-2 text-sm text-gray-700">
                  Wildzahlen und Notiz direkt am erreichten PinPoint erfassen.
                </p>
              </div>

              <div className="overflow-y-auto px-4 py-4 md:px-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-800">
                      Rehkitze gesichert
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={modalPinpointDraft.rehkitzeGesichert}
                      onChange={(e) =>
                        updatePinpointDraft(modalPinpoint.id, {
                          rehkitzeGesichert: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border px-3 py-3"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-800">
                      Rehkitze abgesprungen
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={modalPinpointDraft.rehkitzeAbgesprungen}
                      onChange={(e) =>
                        updatePinpointDraft(modalPinpoint.id, {
                          rehkitzeAbgesprungen: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border px-3 py-3"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-800">
                      Sonstiges Wild gesichert
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={modalPinpointDraft.sonstigesWildGesichert}
                      onChange={(e) =>
                        updatePinpointDraft(modalPinpoint.id, {
                          sonstigesWildGesichert: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border px-3 py-3"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-800">
                      Sonstiges Wild abgesprungen
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={modalPinpointDraft.sonstigesWildAbgesprungen}
                      onChange={(e) =>
                        updatePinpointDraft(modalPinpoint.id, {
                          sonstigesWildAbgesprungen: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border px-3 py-3"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-gray-800">
                      Maulwurfhügel / Fehlstelle
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={modalPinpointDraft.maulwurfhuegelFehlstelle}
                      onChange={(e) =>
                        updatePinpointDraft(modalPinpoint.id, {
                          maulwurfhuegelFehlstelle: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border px-3 py-3"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-1 block text-sm font-medium text-gray-800">
                    Notiz
                  </label>
                  <textarea
                    value={modalPinpointDraft.note}
                    onChange={(e) =>
                      updatePinpointDraft(modalPinpoint.id, {
                        note: e.target.value,
                      })
                    }
                    className="min-h-[120px] w-full rounded-xl border px-3 py-2"
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 px-4 py-4 md:px-5">
                <div className="flex flex-col gap-2 md:flex-row md:justify-end">
                  <button
                    type="button"
                    onClick={() => setPinpointModalId(null)}
                    className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-800"
                  >
                    Abbrechen
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      savePinpointReachedResult(modalPinpointOrder, modalPinpoint)
                    }
                    disabled={savingId === modalPinpoint.id}
                    className="rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {savingId === modalPinpoint.id
                      ? "Speichert..."
                      : "PinPoint als erledigt speichern"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <QrScannerModal
  open={qrScannerOrderId !== null}
  onClose={() => setQrScannerOrderId(null)}
  onScanSuccess={handleQrScanSuccess}
/>

{scanSuccessMessage && (
  <div className="pointer-events-none fixed inset-x-0 top-4 z-[130] flex justify-center px-4">
    <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-semibold text-green-800 shadow-lg">
      ✅ {scanSuccessMessage}
    </div>
  </div>
)}

{navigationTarget && (
  <PinpointNavigationModal
    open={true}
    pinpoint={navigationTarget.pinpoint}
    onClose={() => setNavigationTarget(null)}
    onReached={() => {
      const target = navigationTarget;
      setNavigationTarget(null);

      if (target) {
        markPinpointReached(target.order, target.pinpoint);
      }
    }}
  />
)}
    </>
  );
}

  
  
