"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import QrScannerModal from "@/components/orders/qr-scanner-modal";
import DirectFindingsCorrectionModal from "@/components/orders/direct-findings-correction-modal";
import type { Pinpoint } from "@/components/orders/order-field-map";
import { useTeamLiveLocation } from "@/components/orders/use-team-live-location";
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
type OrderViewFilter = "AKTIV" | "ERLEDIGT" | "ALLE";
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

type OperationDayTeam = {
  id: string;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  team?: Team | null;
};

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
  operationDayTeam?: OperationDayTeam | null;
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
    return "border-red-300 bg-red-100 text-red-900";
  }
  if (status === "IN_ARBEIT") {
    return "border-yellow-300 bg-yellow-100 text-yellow-900";
  }
  return "border-green-300 bg-green-100 text-green-900";
}

// Nur die Kopfzeile wird eingefärbt; aufgeklappte Inhalte bleiben gut lesbar.
function getOrderHeaderClasses(status: OrderStatus) {
  if (status === "OFFEN") return "bg-red-50 hover:bg-red-100";
  if (status === "IN_ARBEIT") return "bg-amber-50 hover:bg-amber-100";
  return "bg-green-50 hover:bg-green-100";
}

function getOrderCardClasses(status: OrderStatus) {
  if (status === "OFFEN") return "border-l-4 border-l-red-500";
  if (status === "IN_ARBEIT") return "border-l-4 border-l-amber-500";
  return "border-l-4 border-l-green-600";
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

function formatDurationFromMs(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "0 min";
  }

  const totalMinutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes} min`;
  }

  return `${hours} h ${String(minutes).padStart(2, "0")} min`;
}

function getDurationLabel(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  nowMs: number
) {
  if (!startTime) return "-";

  const startMs = new Date(startTime).getTime();

  if (!Number.isFinite(startMs)) return "-";

  const endMs = endTime ? new Date(endTime).getTime() : nowMs;

  if (!Number.isFinite(endMs) || endMs < startMs) return "-";

  return formatDurationFromMs(endMs - startMs);
}

function getOrderDurationLabel(order: Order, nowMs: number) {
  return getDurationLabel(
    order.startTime,
    order.endTime || (order.status === "IN_ARBEIT" ? undefined : null),
    nowMs
  );
}

function getTeamDayDurationLabel(order: Order, nowMs: number) {
  const operationDayTeam = order.operationDayTeam;

  return getDurationLabel(
    operationDayTeam?.actualStartTime,
    operationDayTeam?.actualEndTime || undefined,
    nowMs
  );
}

function getOwnerName(owner?: Owner | null) {
  if (!owner) return "Unbekannter Ansprechpartner";
  return (
    [owner.firstName || "", owner.lastName || ""].join(" ").trim() ||
    "Unbekannter Ansprechpartner"
  );
}

function getFieldDisplayName(field?: Field | null) {
  return (field?.displayName || "").trim() || "-";
}

function getFieldName(field?: Field | null) {
  return (field?.name || "").trim() || "-";
}

function getFieldLabel(field?: Field | null) {
  if (!field) return "Unbekannte Fläche";
  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} · ${name}`;
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

type CountKey =
  | "rehkitzeGesichert"
  | "rehkitzeAbgesprungen"
  | "sonstigesWildGesichert"
  | "sonstigesWildAbgesprungen"
  | "maulwurfhuegelFehlstelle";

const COUNT_CATEGORIES: { key: CountKey; label: string; icon: string; tone: string }[] = [
  { key: "rehkitzeGesichert", label: "Kitz gesichert", icon: "🦌", tone: "border-green-300 bg-green-50" },
  { key: "rehkitzeAbgesprungen", label: "Kitz abgesprungen", icon: "🦌", tone: "border-amber-300 bg-amber-50" },
  { key: "sonstigesWildGesichert", label: "Sonstiges Wild gesichert", icon: "🌿", tone: "border-emerald-300 bg-emerald-50" },
  { key: "sonstigesWildAbgesprungen", label: "Sonstiges Wild abgesprungen", icon: "🌿", tone: "border-orange-300 bg-orange-50" },
  { key: "maulwurfhuegelFehlstelle", label: "Maulwurfhügel / Fehlstelle", icon: "🕳️", tone: "border-slate-300 bg-slate-50" },
];

function WildCounterButton({
  label, icon, tone, value, onIncrease, onDecrease, disabled,
}: {
  label: string;
  icon: string;
  tone: string;
  value: number;
  onIncrease: () => void;
  onDecrease: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-0 gap-2">
      <button
        type="button"
        onClick={onIncrease}
        disabled={disabled || value >= 6}
        className={`flex min-h-[76px] min-w-0 flex-1 items-center justify-between gap-2 rounded-2xl border-2 p-3 text-left text-gray-950 active:scale-[0.99] disabled:opacity-60 ${tone}`}
        aria-label={`${label}: plus eins, aktuell ${value}, maximal 6`}
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-bold leading-tight">{icon} {label}</span>
          <span className="text-xs text-gray-600">Antippen: +1</span>
        </span>
        <span className="shrink-0 rounded-xl bg-white px-3 py-2 text-2xl font-black tabular-nums shadow-sm">{value}</span>
      </button>
      <button
        type="button"
        onClick={onDecrease}
        disabled={disabled || value <= 0}
        className="w-12 shrink-0 rounded-xl border-2 border-gray-300 bg-white text-2xl font-bold text-gray-900 disabled:opacity-30"
        aria-label={`${label}: eins abziehen`}
      >
        −
      </button>
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
  const [nowMs, setNowMs] = useState(Date.now());
  const [orders, setOrders] = useState<Order[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftValues>>({});
  const [pinpointDrafts, setPinpointDrafts] = useState<Record<string, PinpointDraft>>({});
  const [newPinpointText, setNewPinpointText] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Beim Seitenaufruf werden erledigte Aufträge wieder ausgeblendet.
  const [orderViewFilter, setOrderViewFilter] = useState<OrderViewFilter>("AKTIV");
  const [directCorrectionOrderId, setDirectCorrectionOrderId] = useState<string | null>(null);
  const [finishModal, setFinishModal] = useState<FinishModalState>({
    open: false,
    orderId: null,
  });
  const finishModalOrderIdRef = useRef<string | null>(null);
  useEffect(() => {
    finishModalOrderIdRef.current = finishModal.open ? finishModal.orderId : null;
  }, [finishModal]);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [pinpointModalId, setPinpointModalId] = useState<string | null>(null);
  const editingPinpointIdRef = useRef<string | null>(null);
  useEffect(() => { editingPinpointIdRef.current = pinpointModalId; }, [pinpointModalId]);
  const [claimingPinpoint, setClaimingPinpoint] = useState(false);
  const claimInProgressRef = useRef(false);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionLoadingId, setCorrectionLoadingId] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionRevision, setCorrectionRevision] = useState("");
  const [correctionHistory, setCorrectionHistory] = useState<{
    id: string; correctedAt: string; correctedByName: string;
    reason: string;
  }[]>([]);

  const [openOwnerSections, setOpenOwnerSections] = useState<Record<string, boolean>>({});
  const [openInfoSections, setOpenInfoSections] = useState<Record<string, boolean>>({});
  const [openPinpoints, setOpenPinpoints] = useState<Record<string, boolean>>({});
  const [qrScannerOrderId, setQrScannerOrderId] = useState<string | null>(null);
  const [scanSuccessMessage, setScanSuccessMessage] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<{
  order: Order;
  pinpoint: Pinpoint;
} | null>(null);

  // Die App fragt nach einer freiwilligen Team-Freigabe, startet sie aber niemals
  // ohne einen ausdruecklichen Klick des Helfers.
  const [locationConsentDialog, setLocationConsentDialog] = useState<"entry" | "navigation" | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<{
    order: Order;
    pinpoint: Pinpoint;
  } | null>(null);
  // Falls der Browser lokalen Speicher sperrt, gilt die Entscheidung trotzdem
  // mindestens fuer den aktuellen Seitenbesuch.
  const locationConsentFallback = useRef<Record<string, string>>({});

  // GPS-Freigabe bleibt auf der Seite "Meine Aufträge" aktiv, auch wenn
  // die einzelne Pinpoint-Navigation geschlossen oder gewechselt wird.
  const liveTeamId =
    navigationTarget?.order.operationDayTeam?.id ||
    orders.find((order) => order.operationDayTeam?.id && order.status !== "ERLEDIGT")?.operationDayTeam?.id ||
    orders.find((order) => order.operationDayTeam?.id)?.operationDayTeam?.id ||
    null;
  const liveTeam = useTeamLiveLocation({
    date: selectedDate,
    teamId: liveTeamId,
    navigationOpen: navigationTarget !== null,
  });

  const canControlOrder = isAdmin || role === "PILOT";
  const canScanQr = isAdmin || role === "PILOT" || role === "SUCHER";
  const qrScanLockedUntilRef = useRef<Record<string, number>>({});

  // Pro Einsatztag und Team genau eine Einstiegsfrage und bei "Spaeter"
  // maximal eine Erinnerung beim erstmaligen Navigieren.
  const locationDecisionKey = `rehkitzrettung:team-location:decision:v1:${selectedDate}:${liveTeamId || "ohne-team"}`;
  const locationReminderKey = `rehkitzrettung:team-location:nav-reminder:v1:${selectedDate}:${liveTeamId || "ohne-team"}`;

  function readLocationChoice(key: string) {
    try {
      return window.localStorage.getItem(key) ?? locationConsentFallback.current[key] ?? null;
    } catch {
      return locationConsentFallback.current[key] ?? null;
    }
  }

  function saveLocationChoice(key: string, choice: string) {
    locationConsentFallback.current[key] = choice;
    try {
      window.localStorage.setItem(key, choice);
    } catch {
      // Die Entscheidung bleibt im Speicher des aktuellen Seitenbesuchs.
    }
  }

  useEffect(() => {
    if (!liveTeam.canUseToday) {
      setLocationConsentDialog(null);
      setPendingNavigation(null);
      return;
    }
    // Nur nach dem Laden und nur wenn es heute noch aktive Auftraege gibt.
    if (loading || liveTeam.sharing || !orders.some(o => o.status !== "ERLEDIGT" && o.operationDayTeam?.id)) return;
    if (!readLocationChoice(locationDecisionKey)) {
      setLocationConsentDialog(current => current ?? "entry");
    }
    // Die Abfrage darf auch bei SSE-Neuladen nicht wieder erscheinen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, liveTeam.canUseToday, liveTeam.sharing, locationDecisionKey, orders]);

  // "Ja" wird ausschliesslich aus einem bewussten Klick aufgerufen.
  function acceptTeamLocation() {
    saveLocationChoice(locationDecisionKey, "accepted");
    liveTeam.startSharing();
    setLocationConsentDialog(null);
    if (pendingNavigation) {
      setNavigationTarget(pendingNavigation);
      setPendingNavigation(null);
    }
  }

  function declineTeamLocation() {
    if (locationConsentDialog === "entry") {
      saveLocationChoice(locationDecisionKey, "later");
    } else {
      saveLocationChoice(locationReminderKey, "shown");
    }
    setLocationConsentDialog(null);
    if (pendingNavigation) {
      setNavigationTarget(pendingNavigation);
      setPendingNavigation(null);
    }
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

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

      // Bei SSE-Updates die noch nicht gespeicherten Direktfunde im
      // Abschlussfenster bewahren (analog zur Pinpoint-Erfassung).
      setDrafts((prev) => {
        const editingId = finishModalOrderIdRef.current;
        if (editingId && prev[editingId]) {
          return { ...nextDrafts, [editingId]: prev[editingId] };
        }
        return nextDrafts;
      });
      // Eine SSE-Aktualisierung darf die laufende Wilddateneingabe nicht zuruecksetzen.
      setPinpointDrafts((prev) => {
        const editingId = editingPinpointIdRef.current;
        if (editingId && prev[editingId]) {
          return { ...nextPinpointDrafts, [editingId]: prev[editingId] };
        }
        return nextPinpointDrafts;
      });

      setOpenOrderId((prev) => {
        if (prev && loadedOrders.some((o) => o.id === prev)) {
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

  function adjustOrderCount(order: Order, key: CountKey, delta: number) {
    setDrafts((prev) => {
      const draft = prev[order.id] || buildDraftFromOrder(order);
      const count = Number(draft[key]);
      const current = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
      // Jede Einzelkategorie hat die gleiche Obergrenze wie die Pinpoints.
      const next = Math.min(6, Math.max(0, current + delta));
      return { ...prev, [order.id]: { ...draft, [key]: String(next) } };
    });
  }

  function adjustPinpointCount(pinpointId: string, key: CountKey, delta: number) {
    setPinpointDrafts((prev) => {
      const draft = prev[pinpointId] || buildPinpointDraft();
      const count = Number(draft[key]);
      const next = Math.min(6, Math.max(0, (Number.isFinite(count) ? count : 0) + delta));
      return { ...prev, [pinpointId]: { ...draft, [key]: String(next) } };
    });
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
      const failure = new Error(data?.error || "PinPoint konnte nicht aktualisiert werden.") as Error & { status?: number };
      failure.status = res.status;
      throw failure;
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
    const outOfRange = COUNT_CATEGORIES.some(({ key }) =>
      toNumber(draft[key]) > 6
    );
    if (outOfRange) {
      alert("Die Direktfunde dürfen maximal 6 pro Kategorie betragen. Bitte die Zähler korrigieren.");
      return;
    }
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

  // Erst auf dem Server atomar uebernehmen, dann Wilddatenformular oeffnen.
  // Auch Kartenklicks verwenden diese Sperre.
  async function markPinpointReached(
    order: Order,
    pinpoint: Pinpoint,
    fromNavigation = false
  ) {
    if (claimInProgressRef.current) return;
    claimInProgressRef.current = true;
    setClaimingPinpoint(true);

    try {
      const res = await fetch(
        `/api/orders/${order.id}/pinpoints/${pinpoint.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "claim" }),
          cache: "no-store",
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "PinPoint konnte nicht uebernommen werden.");
      }

      setCorrectionMode(false);
      updatePinpointDraft(pinpoint.id, buildPinpointDraft(pinpoint));
      if (fromNavigation) setNavigationTarget(null);
      setPinpointModalId(pinpoint.id);
    } catch (error: any) {
      alert(error?.message || "PinPoint wird bereits bearbeitet.");
      await loadOrders();
    } finally {
      claimInProgressRef.current = false;
      setClaimingPinpoint(false);
    }
  }

  // Korrektur bewusst oeffnen: aktuellen Serverstand + Versionsnummer holen,
  // damit kein alter Wert aus einem anderen Smartphone uebernommen wird.
  async function openPinpointCorrection(order: Order, pinpoint: Pinpoint) {
    if (!canControlOrder) return;
    setCorrectionLoadingId(pinpoint.id);
    try {
      const res = await fetch(
        `/api/orders/${order.id}/pinpoints/${pinpoint.id}?history=1`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Korrektur konnte nicht geladen werden.");
      if (data?.status !== "ERLEDIGT" || !data?.revision || !data?.totals) {
        throw new Error("Nur bereits erledigte Pinpoints koennen korrigiert werden.");
      }
      setCorrectionRevision(String(data.revision));
      setCorrectionReason("");
      setCorrectionHistory(Array.isArray(data.corrections) ? data.corrections : []);
      updatePinpointDraft(pinpoint.id, {
        note: data.note || "",
        rehkitzeGesichert: String(data.totals.rehkitzeGesichert ?? 0),
        rehkitzeAbgesprungen: String(data.totals.rehkitzeAbgesprungen ?? 0),
        sonstigesWildGesichert: String(data.totals.sonstigesWildGesichert ?? 0),
        sonstigesWildAbgesprungen: String(data.totals.sonstigesWildAbgesprungen ?? 0),
        maulwurfhuegelFehlstelle: String(data.totals.maulwurfhuegelFehlstelle ?? 0),
      });
      setCorrectionMode(true);
      setPinpointModalId(pinpoint.id);
    } catch (error: any) {
      alert(error?.message || "Korrektur konnte nicht gestartet werden.");
    } finally {
      setCorrectionLoadingId(null);
    }
  }

  async function cancelPinpointEditing(orderId: string, pinpointId: string) {
    if (savingId === pinpointId) return;
    if (correctionMode) {
      setPinpointModalId(null);
      setCorrectionMode(false);
      setCorrectionReason("");
      return;
    }
    try {
      await fetch(`/api/orders/${orderId}/pinpoints/${pinpointId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release" }),
        cache: "no-store",
      });
    } catch (error) {
      console.warn("PinPoint-Sperre konnte nicht sofort geloest werden:", error);
      // Der Server laesst die Sperre automatisch nach zwei Minuten ablaufen.
    } finally {
      setPinpointModalId(null);
      await loadOrders();
    }
  }

  // Solange das Formular offen ist, bleibt die Sperre durch Heartbeats gueltig.
  useEffect(() => {
    if (!pinpointModalId || correctionMode) return;
    const openOrder = orders.find((order) =>
      (order.pinpoints || []).some((p) => p.id === pinpointModalId)
    );
    if (!openOrder) return;

    const orderId = openOrder.id;
    const pinpointId = pinpointModalId;
    let stopped = false;

    const heartbeat = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/pinpoints/${pinpointId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "heartbeat" }),
          cache: "no-store",
        });
        if (!res.ok && !stopped) {
          const data = await res.json().catch(() => ({}));
          if (res.status === 409) {
            setPinpointModalId((prev) => prev === pinpointId ? null : prev);
            alert(data?.error || "Bearbeitungssperre ist abgelaufen.");
            await loadOrders();
          }
        }
      } catch (error) {
        console.warn("PinPoint-Heartbeat fehlgeschlagen:", error);
      }
    };

    const timer = window.setInterval(heartbeat, 30_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // Nur beim Oeffnen / Wechseln des PinPoint-Formulars starten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinpointModalId, correctionMode]);

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

  // Navigation ist nur Navigation: Sie setzt den PinPoint NICHT auf ERREICHT.
  // Erst der Klick auf "PinPoint erreicht" versucht die exklusive Uebernahme.
  async function navigateToPinpoint(order: Order, pinpoint: Pinpoint) {
    // Falls die Einstiegsfrage mit "Spaeter" beantwortet wurde, erinnern
    // wir nur beim ersten Navigationsstart noch einmal. Die Navigation
    // funktioniert in jedem Fall auch ohne Teilen des Standorts.
    if (liveTeam.canUseToday && !liveTeam.sharing &&
      readLocationChoice(locationDecisionKey) !== "accepted" &&
      readLocationChoice(locationReminderKey) !== "shown") {
      saveLocationChoice(locationReminderKey, "shown");
      setPendingNavigation({ order, pinpoint });
      setLocationConsentDialog("navigation");
      return;
    }
    setNavigationTarget({ order, pinpoint });
  }

  function navigateToPinpointGoogle(pinpoint: Pinpoint) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${pinpoint.latitude},${pinpoint.longitude}`;
    window.open(url, "_blank");
  }

  async function savePinpointReachedResult(order: Order, pinpoint: Pinpoint) {
    const draft = getPinpointDraft(pinpoint);
    if (correctionMode && correctionReason.trim().length < 5) {
      alert("Bitte einen Grund fuer die Korrektur eingeben (mindestens 5 Zeichen).");
      return;
    }
    setSavingId(pinpoint.id);

    try {
      await patchPinpointStatus(order.id, pinpoint.id, {
        status: "ERLEDIGT",
        ...(correctionMode ? {
          action: "correct",
          reason: correctionReason.trim(),
          expectedUpdatedAt: correctionRevision,
        } : {}),
        note: draft.note,
        rehkitzeGesichert: toNumber(draft.rehkitzeGesichert),
        rehkitzeAbgesprungen: toNumber(draft.rehkitzeAbgesprungen),
        sonstigesWildGesichert: toNumber(draft.sonstigesWildGesichert),
        sonstigesWildAbgesprungen: toNumber(draft.sonstigesWildAbgesprungen),
        maulwurfhuegelFehlstelle: toNumber(draft.maulwurfhuegelFehlstelle),
      });

      setPinpointModalId(null);
      if (correctionMode) {
        setCorrectionMode(false);
        setCorrectionReason("");
      }
      await loadOrders();
    } catch (error: any) {
      console.error("Fehler beim Speichern des PinPoint-Fundes:", error);
      if (error?.status === 409 && !correctionMode) {
        setPinpointModalId(null);
        await loadOrders();
      }
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

  const orderCounts = useMemo(() => ({
    active: orders.filter((order) => order.status !== "ERLEDIGT").length,
    done: orders.filter((order) => order.status === "ERLEDIGT").length,
    all: orders.length,
  }), [orders]);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    const statusPriority: Record<OrderStatus, number> = {
      IN_ARBEIT: 0,
      OFFEN: 1,
      ERLEDIGT: 2,
    };

    return orders
      .filter((order) => {
        if (orderViewFilter === "AKTIV") return order.status !== "ERLEDIGT";
        if (orderViewFilter === "ERLEDIGT") return order.status === "ERLEDIGT";
        return true;
      })
      .filter((order) =>
        !term || [
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
        ].join(" ").toLowerCase().includes(term)
      )
      // Im Einsatz stehen laufende Aufträge vor offenen, erledigte zuletzt.
      .sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);
  }, [orders, search, orderViewFilter]);

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
              Rot = offen, Gelb = in Arbeit, Grün = erledigt. Erledigte Aufträge
              findest du im Filter „Erledigte“. Ein PinPoint wird erst beim Erreichen
              zur Bearbeitung übernommen.
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
             <div className="flex flex-wrap items-center justify-between gap-3">
               <div>
                 <h2 className="text-base font-bold text-gray-900">Live-Standort im Team</h2>
                 <p className="mt-1 text-sm text-gray-700">
                   Freiwillige GPS-Freigabe für deine Teammitglieder. Die Übertragung läuft
                   auch weiter, wenn du die Pinpoint-Navigation schließt.
                 </p>
               </div>
               <button
                 type="button"
                 disabled={!liveTeam.canUseToday}
                 onClick={() => {
                   if (liveTeam.sharing) {
                     void liveTeam.stopSharing();
                   } else {
                     saveLocationChoice(locationDecisionKey, "accepted");
                     liveTeam.startSharing();
                   }
                 }}
                 className={`rounded-xl px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-400 ${
                   liveTeam.sharing ? "bg-red-700" : "bg-green-700"
                 }`}
               >
                 {liveTeam.sharing ? "Standortfreigabe beenden" : "Standort mit Team teilen"}
               </button>
             </div>
             <p className="mt-2 text-xs text-gray-600">
               {liveTeam.sharing
                 ? liveTeam.ownPosition
                   ? `GPS erfasst · Genauigkeit ±${Math.round(liveTeam.ownPosition.accuracy ?? 0)} m · Übertragung höchstens alle 2 Sekunden bei neuer Messung`
                   : "Warte auf GPS-Berechtigung und erste Position …"
                 : "Standort wird nicht an andere Helfer übertragen."}
             </p>
             {!liveTeam.canUseToday && (
               <p className="mt-2 text-xs text-gray-600">
                 Live-Ortung nur am heutigen Einsatztag bei vorhandener Teamzuordnung.
               </p>
             )}
             {liveTeam.error && (
               <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">
                 {liveTeam.error}
               </p>
             )}
           </section>

          <section className="page-card p-4">
            <h2 className="mb-2 text-base font-bold text-gray-900">Aufträge anzeigen</h2>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Aufträge nach Status filtern">
              {([
                { value: "AKTIV" as const, label: "Aktive", count: orderCounts.active, selected: "border-blue-600 bg-blue-50 text-blue-950 ring-2 ring-blue-200" },
                { value: "ERLEDIGT" as const, label: "Erledigte", count: orderCounts.done, selected: "border-green-600 bg-green-50 text-green-950 ring-2 ring-green-200" },
                { value: "ALLE" as const, label: "Alle", count: orderCounts.all, selected: "border-gray-600 bg-gray-100 text-gray-950 ring-2 ring-gray-200" },
              ]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={orderViewFilter === option.value}
                  onClick={() => {
                    setOrderViewFilter(option.value);
                    setOpenOrderId(null);
                  }}
                  className={`min-w-0 rounded-xl border-2 px-2 py-3 text-center font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                    orderViewFilter === option.value
                      ? option.selected
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="block text-sm sm:text-base">{option.label}</span>
                  <span className="mt-1 block text-xs sm:text-sm">({option.count})</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-600">
              Standardmäßig nur aktive Aufträge. Für Wilddatenkorrekturen „Erledigte“ auswählen.
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
              {search.trim()
                ? "Keine passenden Aufträge gefunden. Bitte Suche oder Statusfilter prüfen."
                : orderViewFilter === "ERLEDIGT"
                  ? "Keine erledigten Aufträge für diesen Einsatztag vorhanden."
                  : orderViewFilter === "AKTIV"
                    ? "Keine aktiven Aufträge für diesen Einsatztag vorhanden."
                    : "Keine Aufträge für diesen Einsatztag vorhanden."}
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
                const orderDurationLabel = getOrderDurationLabel(order, nowMs);
                const teamDayDurationLabel = getTeamDayDurationLabel(order, nowMs);

                return (
                  <section key={order.id} className={`page-card overflow-hidden ${getOrderCardClasses(order.status)}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenOrderId((prev) => (prev === order.id ? null : order.id))
                      }
                      aria-expanded={isOpen}
                      className={`flex w-full items-start justify-between gap-3 p-4 text-left transition-colors md:p-5 ${getOrderHeaderClasses(order.status)}`}
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
                            <span className="font-semibold">Anzeigename:</span>{" "}
                            {getFieldDisplayName(order.field)}
                          </div>

                          <div className="page-card-muted px-3 py-2 text-sm text-gray-900 sm:col-span-2">
                            <span className="font-semibold">Flächenbezeichnung:</span>{" "}
                            {getFieldName(order.field)}
                          </div>

                          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">
                            <span className="font-semibold">Auftragszeit:</span>{" "}
                            {orderDurationLabel}
                          </div>

                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                            <span className="font-semibold">Team-Einsatzzeit heute:</span>{" "}
                            {teamDayDurationLabel}
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
                                label="Anzeigename"
                                value={getFieldDisplayName(order.field)}
                              />

                              <InfoCard
                                label="Flächenbezeichnung"
                                value={getFieldName(order.field)}
                              />

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
                                  <div className="space-y-2">
                                    {COUNT_CATEGORIES.map(({ key, label, icon, tone }) => (
                                      <WildCounterButton
                                        key={key}
                                        label={label}
                                        icon={icon}
                                        tone={tone}
                                        value={toNumber(draft[key])}
                                        onIncrease={() => adjustOrderCount(order, key, 1)}
                                        onDecrease={() => adjustOrderCount(order, key, -1)}
                                        disabled={savingId === order.id || order.status === "ERLEDIGT"}
                                      />
                                    ))}
                                    <div className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-gray-800">
                                      Direktfunde insgesamt: {COUNT_CATEGORIES.reduce((sum, { key }) => sum + toNumber(draft[key]), 0)}
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

                              {(order.status === "IN_ARBEIT" || (canControlOrder && order.status === "ERLEDIGT")) && (
  <div className="page-card-muted p-3">
    <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
      PinPoints
    </div>

    {canScanQr && order.status === "IN_ARBEIT" && (
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

                  {pinpoint.status !== "ERLEDIGT" && order.status === "IN_ARBEIT" && (
                    <button
                      type="button"
                      onClick={() => markPinpointReached(order, pinpoint)}
                      disabled={savingId === pinpoint.id}
                      className="rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-900 disabled:opacity-50"
                    >
                      ✅ PinPoint erreicht
                    </button>
                  )}
                  {pinpoint.status === "ERLEDIGT" && canControlOrder && (
                    <button
                      type="button"
                      onClick={() => void openPinpointCorrection(order, pinpoint)}
                      disabled={savingId === pinpoint.id || correctionLoadingId === pinpoint.id}
                      className="rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950 disabled:opacity-50"
                    >
                      {correctionLoadingId === pinpoint.id ? "Laedt..." : "✏️ Wildmeldung korrigieren"}
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
{canControlOrder && order.status === "ERLEDIGT" && (
  <button
    type="button"
    onClick={() => setDirectCorrectionOrderId(order.id)}
    className="mt-3 w-full rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950"
  >
    ✏️ Direktfunde korrigieren
  </button>
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
          <div className="fixed inset-0 z-[100] bg-black/55 p-2 sm:p-4">
            <div className="flex h-full items-center justify-center">
              <div className="flex max-h-[95dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="shrink-0 border-b border-gray-200 px-4 py-3">
                  <h2 className="text-lg font-extrabold text-gray-950">🦌 Auftrag abschließen</h2>
                  <p className="mt-1 text-sm text-gray-700">
                    Direktfunde ohne PinPoint · Pro Kategorie maximal 6 · große Fläche: +1, Minusknopf: −1
                  </p>
                  <div className="mt-2 text-xs font-semibold text-gray-600">
                    {getOrderLabel(modalOrder)} · {getFieldLabel(modalOrder.field)}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
                  <div className="space-y-2">
                    {COUNT_CATEGORIES.map(({ key, label, icon, tone }) => (
                      <WildCounterButton
                        key={key}
                        label={label}
                        icon={icon}
                        tone={tone}
                        value={toNumber(modalDraft[key])}
                        onIncrease={() => adjustOrderCount(modalOrder, key, 1)}
                        onDecrease={() => adjustOrderCount(modalOrder, key, -1)}
                        disabled={savingId === modalOrder.id}
                      />
                    ))}
                  </div>

                  <div className="mt-3 rounded-xl bg-gray-100 px-3 py-3 text-sm font-bold text-gray-900">
                    Direktfunde insgesamt: {COUNT_CATEGORIES.reduce((sum, { key }) => sum + toNumber(modalDraft[key]), 0)}
                  </div>

                  <details className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-900">
                      Bereits erfasste PinPoints · {COUNT_CATEGORIES.reduce((sum, { key }) => sum + modalPinpointTotals[key], 0)} Funde
                    </summary>
                    <div className="mt-3 space-y-2 text-sm text-gray-700">
                      {COUNT_CATEGORIES.map(({ key, label, icon }) => (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <span>{icon} {label}</span>
                          <strong className="tabular-nums">{modalPinpointTotals[key]}</strong>
                        </div>
                      ))}
                    </div>
                  </details>

                  <details className="mt-2 rounded-xl border border-gray-200 bg-white p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-900">
                      Auftrag gesamt · {modalCombinedTotalWild} Funde (Direktfunde + PinPoints)
                    </summary>
                    <div className="mt-3 space-y-2 text-sm text-gray-700">
                      {COUNT_CATEGORIES.map(({ key, label, icon }) => (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <span>{icon} {label}</span>
                          <strong className="tabular-nums">{modalCombinedTotals[key]}</strong>
                        </div>
                      ))}
                    </div>
                  </details>

                  {modalCombinedTotalWild === 0 && (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                      Noch keine Funde erfasst. Bitte prüfen, ob das richtig ist.
                    </div>
                  )}

                  <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs text-blue-950">
                    Nach dem Auftragsabschluss kann der zuständige Pilot die Direktfunde bis zum Abschluss des Einsatztages korrigieren. Danach nur noch ein Admin. Jede Änderung wird protokolliert.
                  </div>
                </div>

                <div className="shrink-0 border-t border-gray-200 bg-white p-3 sm:p-4">
                  <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
                    <button
                      type="button"
                      onClick={() => setFinishModal({ open: false, orderId: null })}
                      disabled={savingId === modalOrder.id}
                      className="rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-900 disabled:opacity-50"
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
                      className="rounded-xl bg-green-700 px-3 py-3 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {savingId === modalOrder.id ? "Speichert..." : "Auftrag abschließen ✓"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      {directCorrectionOrderId && (
        <DirectFindingsCorrectionModal
          orderId={directCorrectionOrderId}
          onClose={() => setDirectCorrectionOrderId(null)}
          onSaved={async () => { await loadOrders(); }}
        />
      )}

      {modalPinpoint && modalPinpointOrder && modalPinpointDraft && (
        <div className="fixed inset-0 z-[110] bg-black/55 p-2 sm:p-4">
          <div className="flex h-full items-center justify-center">
            <div className="flex max-h-[95dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="shrink-0 border-b border-gray-200 px-4 py-3">
                <h2 className="text-lg font-extrabold text-gray-950">
                  {correctionMode ? "✏️ Wildmeldung korrigieren" : "🦌 Wildfund erfassen"}
                </h2>
                <p className="mt-1 text-sm text-gray-700">
                  PinPoint {modalPinpoint.sequenceNumber} · Pro Kategorie maximal 6 · große Fläche: +1, Minusknopf: −1
                </p>
                {correctionMode && (
                  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Nur Pilot/Admin · Jede Änderung wird mit Begründung protokolliert.
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
                <div className="space-y-2">
                  {COUNT_CATEGORIES.map(({key, label, icon, tone}) => {
                    const value = Number(modalPinpointDraft[key]) || 0;
                    return (
                      <WildCounterButton
                        key={key}
                        label={label}
                        icon={icon}
                        tone={tone}
                        value={value}
                        disabled={savingId === modalPinpoint.id}
                        onIncrease={() => adjustPinpointCount(modalPinpoint.id, key, 1)}
                        onDecrease={() => adjustPinpointCount(modalPinpoint.id, key, -1)}
                      />
                    );
                  })}
                </div>

                <div className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-800">
                  Gesamt: {COUNT_CATEGORIES.reduce((sum, category) => sum + (Number(modalPinpointDraft[category.key]) || 0), 0)}
                </div>

                <label className="mt-3 block text-sm font-semibold text-gray-900" htmlFor="pinpoint-note">
                  Notiz (optional)
                </label>
                <textarea
                  id="pinpoint-note"
                  rows={2}
                  value={modalPinpointDraft.note}
                  onChange={(event) => updatePinpointDraft(modalPinpoint.id, { note: event.target.value })}
                  placeholder="Bei Bedarf Besonderheiten eintragen ..."
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-900"
                />

                {correctionMode && (
                  <>
                    <label className="mt-3 block text-sm font-bold text-amber-950" htmlFor="pinpoint-correction-reason">
                      Grund der Korrektur (Pflichtfeld)
                    </label>
                    <textarea
                      id="pinpoint-correction-reason"
                      rows={2}
                      value={correctionReason}
                      onChange={(event) => setCorrectionReason(event.target.value)}
                      placeholder="z. B. Versehentlich 2 statt 1 Kitz erfasst"
                      className="mt-1 w-full rounded-xl border-2 border-amber-300 px-3 py-2 text-gray-900"
                    />
                    {correctionHistory.length > 0 && (
                      <details className="mt-3 rounded-xl border border-gray-200 p-3 text-sm">
                        <summary className="cursor-pointer font-semibold text-gray-800">
                          Korrekturverlauf ({correctionHistory.length})
                        </summary>
                        <div className="mt-2 space-y-2">
                          {correctionHistory.map((entry) => (
                            <div key={entry.id} className="border-t border-gray-200 pt-2 text-gray-700">
                              <strong>{entry.correctedByName}</strong> · {new Date(entry.correctedAt).toLocaleString("de-DE")}
                              <div className="whitespace-pre-wrap">{entry.reason}</div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </div>

              <div className="shrink-0 border-t border-gray-200 bg-white p-3 sm:p-4">
                <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
                  <button
                    type="button"
                    onClick={() => void cancelPinpointEditing(modalPinpointOrder.id, modalPinpoint.id)}
                    disabled={savingId === modalPinpoint.id}
                    className="rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold text-gray-900 disabled:opacity-50"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={() => void savePinpointReachedResult(modalPinpointOrder, modalPinpoint)}
                    disabled={savingId === modalPinpoint.id || claimingPinpoint || (correctionMode && correctionReason.trim().length < 5)}
                    className="rounded-xl bg-green-700 px-3 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {savingId === modalPinpoint.id ? "Speichert..." : correctionMode ? "Korrektur speichern" : "PinPoint erledigt ✓"}
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

{locationConsentDialog && (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
       role="dialog" aria-modal="true" aria-labelledby="team-location-consent-title">
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden="true">📍</span>
        <h2 id="team-location-consent-title" className="text-xl font-bold text-gray-950">
          Standort mit deinem Team teilen?
        </h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-gray-800">
        {locationConsentDialog === "navigation"
          ? "Du startest die Pinpoint-Navigation. Sollen deine Teammitglieder während des Einsatzes auch deinen Standort sehen?"
          : "Du hast heute einen Einsatz. Deine Teammitglieder können dich auf der Pinpoint-Karte sehen, wenn du deinen Standort freiwillig teilst."}
      </p>
      <div className="mt-3 space-y-2 rounded-xl bg-gray-100 p-3 text-sm text-gray-800">
        <p>✓ Nur dein Einsatzteam sieht deinen Standort.</p>
        <p>✓ Du kannst die Freigabe jederzeit beenden.</p>
        <p>✓ Die Freigabe endet beim Verlassen der Auftragsseite.</p>
        <p>✓ Ohne Zustimmung kannst du normal navigieren.</p>
      </div>
      <button type="button" onClick={acceptTeamLocation}
        className="mt-4 w-full rounded-xl bg-green-700 px-4 py-3 text-base font-bold text-white">
        📍 Ja, Standort mit Team teilen
      </button>
      <button type="button" onClick={declineTeamLocation}
        className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900">
        {locationConsentDialog === "navigation" ? "Ohne Freigabe navigieren" : "Jetzt nicht"}
      </button>
      <p className="mt-3 text-center text-xs text-gray-600">
        Dein Smartphone kann zusaetzlich die Standortberechtigung abfragen.
        Die Freigabe gilt nicht automatisch für den nächsten Einsatztag.
      </p>
    </div>
  </div>
)}

{navigationTarget && (
  <PinpointNavigationModal
    open={true}
    pinpoint={navigationTarget.pinpoint}
    orderId={navigationTarget.order.id}
    claiming={claimingPinpoint}
    members={liveTeam.members}
    myUserId={liveTeam.myUserId}
    ownSharedPosition={liveTeam.ownPosition}
    sharingEnabled={liveTeam.sharing}
    locationError={liveTeam.error}
    onClose={() => setNavigationTarget(null)}
    onReached={() => {
      const target = navigationTarget;
      if (target) void markPinpointReached(target.order, target.pinpoint, true);
    }}
  />
)}
    </>
  );
}