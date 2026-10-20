"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { OwnGpsPosition, TeamLocationMember } from "@/components/orders/use-team-live-location";
import type { Pinpoint } from "@/components/orders/order-field-map";

type Props = {
  open: boolean;
  pinpoint: Pinpoint;
  orderId: string;
  claiming?: boolean;
  onClose: () => void;
  onReached: () => void;
  members?: TeamLocationMember[];
  myUserId?: string | null;
  ownSharedPosition?: OwnGpsPosition | null;
  sharingEnabled?: boolean;
  locationError?: string | null;
};

type CurrentPosition = OwnGpsPosition;

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) {
  const earthRadius = 6371000;

  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);

  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

function formatDistance(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";

  if (value < 1000) {
    return `${Math.round(value)} m`;
  }

  return `${(value / 1000).toFixed(2)} km`;
}

// Winkel immer auf 0–359 Grad begrenzen (0 = Norden).
function normalizeBearing(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

// Kürzester Winkel von 'from' nach 'to' (-180 bis +180 Grad).
function signedBearingDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

function smoothBearing(previous: number | null, measured: number, weight: number) {
  if (previous == null) return normalizeBearing(measured);
  return normalizeBearing(previous + signedBearingDelta(previous, measured) * weight);
}

// Richtung von Standort A zu Standort B, Norden = 0 Grad.
function bearingTo(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) {
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const lngDelta = toRad(to.longitude - from.longitude);
  const y = Math.sin(lngDelta) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lngDelta);
  return normalizeBearing((Math.atan2(y, x) * 180) / Math.PI);
}

function directionLabel(delta: number) {
  const absolute = Math.abs(delta);
  if (absolute < 25) return "Geradeaus";
  if (absolute < 65) return delta > 0 ? "Leicht rechts" : "Leicht links";
  if (absolute < 135) return delta > 0 ? "Rechts halten" : "Links halten";
  return "Umkehren";
}

type GpsAnchor = {
  position: CurrentPosition;
  time: number;
};

type CompassOrientation = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

type OrientationWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function NavigationMapController({
  current,
  followMe,
  onManualMapMovement,
}: {
  current: CurrentPosition | null;
  followMe: boolean;
  onManualMapMovement: () => void;
}) {
  const map = useMapEvents({
    dragstart: onManualMapMovement,
    zoomstart: onManualMapMovement,
  });

  useEffect(() => {
    if (!followMe || !current) return;

    // Nur verschieben, nicht bei jeder GPS-Meldung den Zoom aendern.
    map.panTo([current.latitude, current.longitude], { animate: false });
  }, [map, current, followMe]);

  return null;
}

function teamMarkerIcon(member: TeamLocationMember, isOwnMarker = false) {
  const code = /^[PS]\d{1,4}$/.test(member.markerCode)
    ? member.markerCode
    : "?";
  const color = /^#[0-9a-fA-F]{6}$/.test(member.markerColor)
    ? member.markerColor
    : "#475569";
  const opacity = member.stale ? "0.55" : "1";
  // Kennung und Farbe werden vom Server vergeben. Keine Nutzernamen in HTML einfügen.
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:40px;height:40px;border-radius:50%;background:${color};border:3px solid ${isOwnMarker ? "#facc15" : "#ffffff"};box-shadow:0 2px 8px #0009;color:white;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;opacity:${opacity}">${code}${isOwnMarker ? '<span style="position:absolute;top:-14px;left:6px;background:#facc15;color:black;font-size:9px;border-radius:5px;padding:1px 3px">ICH</span>' : ""}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });
}

export default function PinpointNavigationModal({
  open,
  pinpoint,
  orderId,
  claiming = false,
  onClose,
  onReached,
  members = [],
  myUserId = null,
  ownSharedPosition = null,
  sharingEnabled = false,
  locationError = null,
}: Props) {
  const [privateCurrent, setPrivateCurrent] = useState<CurrentPosition | null>(null);
  const [showTeamLegend, setShowTeamLegend] = useState(false);
  const current = sharingEnabled && ownSharedPosition ? ownSharedPosition : privateCurrent;
  const [geoError, setGeoError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [followMe, setFollowMe] = useState(true);

  // Kurs durch GPS-Bewegung; Smartphone-Kompass nur, wenn der Browser
  // einen Nordbezug liefert. Nie einfach einen relativen alpha-Wert verwenden.
  const gpsAnchorRef = useRef<GpsAnchor | null>(null);
  const lastDistanceRef = useRef<{ value: number; time: number } | null>(null);
  const compassLastEventRef = useRef(0);
  const [movementHeading, setMovementHeading] = useState<number | null>(null);
  const [movementAt, setMovementAt] = useState(0);
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const [compassAt, setCompassAt] = useState(0);
  const [compassPermissionNeeded, setCompassPermissionNeeded] = useState(false);
  const [compassPermissionGranted, setCompassPermissionGranted] = useState(false);
  const [compassHint, setCompassHint] = useState<string | null>(null);
  const [distanceTrend, setDistanceTrend] = useState<"near" | "away" | null>(null);
  const [trendAt, setTrendAt] = useState(0);
  const [clock, setClock] = useState(Date.now());

  const [sharedPinpoint, setSharedPinpoint] = useState<{
    status: string;
    locked: boolean;
    claimedByMe: boolean;
    claimedByName: string | null;
    totals?: { rehkitzeGesichert: number } | null;
  } | null>(null);

  // Alle Helfer sehen laufend, ob der PinPoint noch frei, besetzt oder erledigt ist.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSharedPinpoint(null);

    const fetchStatus = async () => {
      try {
        const res = await fetch(
          `/api/orders/${orderId}/pinpoints/${pinpoint.id}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const state = await res.json();
        if (!cancelled) setSharedPinpoint(state);
      } catch (error) {
        console.warn("Aktueller PinPoint-Status nicht abrufbar:", error);
      }
    };
    void fetchStatus();
    const timer = window.setInterval(fetchStatus, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, orderId, pinpoint.id]);

  const completed = sharedPinpoint?.status === "ERLEDIGT" || pinpoint.status === "ERLEDIGT";
  const occupied = Boolean(sharedPinpoint?.locked && !sharedPinpoint.claimedByMe);

  // Bei jedem erneuten Oeffnen startet die Karte wieder im Follow-Modus.
  useEffect(() => {
    if (!open) return;
    setFollowMe(true);
    setPrivateCurrent(null);
    setMovementHeading(null);
    setMovementAt(0);
    setCompassHeading(null);
    setCompassAt(0);
    setDistanceTrend(null);
    setTrendAt(0);
    setCompassHint(null);
    gpsAnchorRef.current = null;
    lastDistanceRef.current = null;
    compassLastEventRef.current = 0;
  }, [open, pinpoint.id]);

  // Alte Gehrichtungen/Tendenzen automatisch verwerfen. Der Pfeil darf nicht
  // so tun, als gäbe es einen aktuellen Kurs, wenn die Person stehen bleibt.
  useEffect(() => {
    if (!open) return;
    setClock(Date.now());
    const interval = window.setInterval(() => setClock(Date.now()), 2000);
    return () => window.clearInterval(interval);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (typeof DeviceOrientationEvent === "undefined") return;
    const orientationType = DeviceOrientationEvent as OrientationWithPermission;
    setCompassPermissionNeeded(typeof orientationType.requestPermission === "function");
  }, [open]);

  // Auf iPhones ist die Freigabe nur nach einem Nutzerklick möglich.
  async function enableCompass() {
    if (typeof DeviceOrientationEvent === "undefined") return;
    try {
      const orientationType = DeviceOrientationEvent as OrientationWithPermission;
      if (orientationType.requestPermission) {
        const result = await orientationType.requestPermission();
        if (result !== "granted") {
          setCompassHint("Kompass nicht freigegeben");
          return;
        }
      }
      setCompassPermissionGranted(true);
      setCompassHint(null);
    } catch {
      setCompassHint("Kompass nicht verfügbar");
    }
  }

  // Kompass: iOS liefert webkitCompassHeading (Nordbezug); andere Browser
  // können echte absolute Orientierung melden. Relative Sensorwerte werden
  // bewusst ignoriert, sonst zeigt der Pfeil möglicherweise falsch.
  useEffect(() => {
    if (!open || (compassPermissionNeeded && !compassPermissionGranted)) return;
    if (typeof DeviceOrientationEvent === "undefined") return;

    const onOrientation = (event: Event) => {
      const orientation = event as CompassOrientation;
      let value: number | null = null;
      if (typeof orientation.webkitCompassHeading === "number" &&
          Number.isFinite(orientation.webkitCompassHeading) &&
          (typeof orientation.webkitCompassAccuracy !== "number" ||
            orientation.webkitCompassAccuracy <= 30)) {
        value = orientation.webkitCompassHeading;
      } else if (orientation.absolute === true &&
          typeof orientation.alpha === "number" &&
          Number.isFinite(orientation.alpha)) {
        // Bildschirm-Orientierung ist bei Browsern mit absolute=true relevant.
        const screenAngle = window.screen.orientation?.angle ?? 0;
        value = 360 - orientation.alpha + screenAngle;
      }
      if (value == null) return;
      const now = Date.now();
      if (now - compassLastEventRef.current < 350) return;
      compassLastEventRef.current = now;
      setCompassHeading((previous) => smoothBearing(previous, value!, 0.28));
      setCompassAt(now);
    };

    window.addEventListener("deviceorientationabsolute", onOrientation);
    window.addEventListener("deviceorientation", onOrientation);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrientation);
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, [open, compassPermissionNeeded, compassPermissionGranted]);

  useEffect(() => {
    if (!open || (sharingEnabled && ownSharedPosition)) return;

    if (!window.isSecureContext) {
      setGeoError("Standort funktioniert nur über HTTPS oder localhost.");
      return;
    }

    if (!navigator.geolocation) {
      setGeoError("Standort wird von diesem Gerät nicht unterstützt.");
      return;
    }

    setGeoError(null);
    setWatching(true);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setPrivateCurrent({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy:
            typeof position.coords.accuracy === "number"
              ? position.coords.accuracy
              : null,
        });
      },
      (error) => {
        console.warn("Standortfehler:", error);

        if (error.code === error.PERMISSION_DENIED) {
          setGeoError("Standort-Berechtigung wurde nicht erlaubt.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setGeoError("Standort ist momentan nicht verfügbar.");
        } else if (error.code === error.TIMEOUT) {
          setGeoError("Standort-Ermittlung dauert zu lange.");
        } else {
          setGeoError("Standort konnte nicht ermittelt werden.");
        }

        setWatching(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setWatching(false);
    };
  }, [open, sharingEnabled, ownSharedPosition !== null]);

  const ownTeamMember = members.find((member) => member.userId === myUserId);
  const visibleOthers = members.filter((member) =>
    member.userId !== myUserId &&
    typeof member.latitude === "number" &&
    typeof member.longitude === "number"
  );

  const distance = useMemo(() => {
    if (!current) return null;

    return distanceMeters(current, {
      latitude: pinpoint.latitude,
      longitude: pinpoint.longitude,
    });
  }, [current, pinpoint]);

  // Nur aus ausreichend präzisen GPS-Punkten eine Gehrichtung ableiten.
  // Mindestens einige Meter Bewegung sind nötig, sonst dominiert GPS-Rauschen.
  useEffect(() => {
    if (!open || !current) return;
    if (current.accuracy == null || current.accuracy > 18) {
      gpsAnchorRef.current = null;
      return;
    }
    const now = Date.now();
    const anchor = gpsAnchorRef.current;
    if (!anchor || now - anchor.time > 45_000) {
      gpsAnchorRef.current = { position: current, time: now };
      return;
    }
    const walked = distanceMeters(anchor.position, current);
    const minWalk = Math.max(5, Math.min(13, current.accuracy * 1.5));
    if (walked >= minWalk && walked < 120) {
      const course = bearingTo(anchor.position, current);
      setMovementHeading((previous) => smoothBearing(previous, course, 0.55));
      setMovementAt(now);
      gpsAnchorRef.current = { position: current, time: now };
    }
  }, [open, current?.latitude, current?.longitude, current?.accuracy]);

  // Entfernungstendenz nur nach einer signifikanten Änderung zeigen.
  // Im GPS-Stillstand dürfen die Farben nicht bei jeder Messung springen.
  useEffect(() => {
    if (!open || !current || distance == null ||
        current.accuracy == null || current.accuracy > 18) return;
    const now = Date.now();
    const previous = lastDistanceRef.current;
    if (!previous || now - previous.time > 45_000) {
      lastDistanceRef.current = { value: distance, time: now };
      return;
    }
    const change = distance - previous.value;
    const threshold = Math.max(6, Math.min(18, current.accuracy * 1.5));
    if (Math.abs(change) >= threshold) {
      setDistanceTrend(change < 0 ? "near" : "away");
      setTrendAt(now);
      lastDistanceRef.current = { value: distance, time: now };
    }
  }, [open, current?.latitude, current?.longitude, current?.accuracy, distance]);

  const accuracy = current?.accuracy;
  const gpsImprecise = accuracy == null || accuracy > 20;
  const targetRadius = Math.max(7, Math.min(20, (accuracy ?? 5) * 1.25));
  const inTargetArea = distance != null && !gpsImprecise && distance <= targetRadius;
  const hasRecentMovement = movementHeading != null && clock - movementAt < 12_000;
  const hasRecentCompass = compassHeading != null && clock - compassAt < 5_000;
  // Beim Gehen folgt der Pfeil der tatsächlichen Bewegungsrichtung; im
  // Stillstand kann ein freigegebener Kompass die Ausrichtung übernehmen.
  const heading = hasRecentMovement ? movementHeading : hasRecentCompass ? compassHeading : null;
  const headingSource = hasRecentMovement ? "Gehrichtung" : hasRecentCompass ? "Kompass" : null;
  const targetHeading = current ? bearingTo(current, pinpoint) : null;
  const relativeDirection = heading != null && targetHeading != null
    ? signedBearingDelta(heading, targetHeading) : null;
  const guidance = !current ? "Warte auf GPS"
    : gpsImprecise ? "GPS zu ungenau"
    : inTargetArea ? "Zielbereich absuchen"
    : relativeDirection == null ? "Gehe ein paar Meter"
    : directionLabel(relativeDirection);
  const showingArrow = !gpsImprecise && !inTargetArea && relativeDirection != null;
  const trendIsFresh = clock - trendAt < 12_000;
  const movingAway = trendIsFresh && distanceTrend === "away";
  const movingCloser = trendIsFresh && distanceTrend === "near";

  const defaultCenter: [number, number] = current
    ? [current.latitude, current.longitude]
    : [pinpoint.latitude, pinpoint.longitude];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black">
      <div className="relative h-full w-full">
        <MapContainer
          className="h-full w-full"
          center={defaultCenter}
          zoom={18}
          scrollWheelZoom={true}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles © Esri"
            maxZoom={20}
          />

          <NavigationMapController
            current={current}
            followMe={followMe}
            onManualMapMovement={() => setFollowMe(false)}
          />

          {current && ownTeamMember ? (
            <Marker
              position={[current.latitude, current.longitude]}
              icon={teamMarkerIcon(ownTeamMember, true)}
              zIndexOffset={1000}
            >
              <Popup>
                <div className="text-sm">
                  <strong>{ownTeamMember.markerCode} · {ownTeamMember.name} (du)</strong>
                  {current.accuracy != null && (
                    <div>Genauigkeit: ±{Math.round(current.accuracy)} m</div>
                  )}
                </div>
              </Popup>
            </Marker>
          ) : current ? (
            <CircleMarker
              center={[current.latitude, current.longitude]}
              radius={10}
              pathOptions={{ color: "#2563eb", weight: 4, fillColor: "#60a5fa", fillOpacity: 0.95 }}
            >
              <Popup>Dein Standort (Standort nur für die Navigation)</Popup>
            </CircleMarker>
          ) : null}

          {visibleOthers.map((member) => (
            <Marker
              key={member.userId}
              position={[member.latitude!, member.longitude!]}
              icon={teamMarkerIcon(member)}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-bold">{member.markerCode} · {member.name}</div>
                  <div>{member.role === "PILOT" ? "Pilot" : "Sucher"}</div>
                  <div>Letzte Meldung: {member.positionAt ? new Date(member.positionAt).toLocaleTimeString("de-DE") : "-"}</div>
                  <div>Genauigkeit: {member.accuracy == null ? "-" : `±${Math.round(member.accuracy)} m`}</div>
                  {member.stale && <div className="font-bold text-orange-700">Position nicht mehr aktuell</div>}
                </div>
              </Popup>
            </Marker>
          ))}

          <CircleMarker
            center={[pinpoint.latitude, pinpoint.longitude]}
            radius={12}
            pathOptions={{
              color: "#dc2626",
              weight: 4,
              fillColor: "#ef4444",
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">
                  PinPoint {pinpoint.sequenceNumber}
                </div>
                <div>Status: {pinpoint.status}</div>
              </div>
            </Popup>
          </CircleMarker>

          {current && (
            <Polyline
              positions={[
                [current.latitude, current.longitude],
                [pinpoint.latitude, pinpoint.longitude],
              ]}
              pathOptions={{
                color: "#facc15",
                weight: 3,
                opacity: 0.8,
              }}
            />
          )}
        </MapContainer>

        {/* Kompakter Wegweiser im bisherigen Kopf – keine zusätzliche Karte verdecken. */}
        <div className="pointer-events-none absolute left-3 right-3 top-3 z-[500] flex items-start justify-between gap-2">
          <div className="pointer-events-auto min-w-0 max-w-[calc(100%-56px)] rounded-xl bg-white/95 px-2.5 py-2 shadow-md backdrop-blur">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  inTargetArea ? "bg-green-100 text-green-800" :
                  gpsImprecise ? "bg-gray-100 text-gray-500" :
                  movingAway ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                }`}
                title={headingSource || "Richtung wird ermittelt"}
                aria-hidden="true"
              >
                {showingArrow ? (
                  <svg
                    viewBox="0 0 24 24"
                    width="29"
                    height="29"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-transform duration-500"
                    style={{ transform: `rotate(${relativeDirection}deg)` }}
                  >
                    <path d="M12 20V4M5 11l7-7 7 7" />
                  </svg>
                ) : inTargetArea ? (
                  <span className="text-2xl font-extrabold">✓</span>
                ) : (
                  <span className="text-2xl font-extrabold">?</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-extrabold leading-tight text-gray-950">
                  PP {pinpoint.sequenceNumber} <span className="font-normal text-gray-400">·</span> {formatDistance(distance)}
                </div>
                <div className={`truncate text-xs font-bold leading-tight ${
                  inTargetArea || movingCloser ? "text-green-800" :
                  movingAway ? "text-amber-800" : "text-gray-800"
                }`}>{guidance}</div>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-12 text-[10px] leading-tight text-gray-600">
              <span>{accuracy != null ? `GPS ±${Math.round(accuracy)} m` : "Kein GPS"}</span>
              {headingSource && !inTargetArea && <span>· {headingSource}</span>}
              {movingAway && !inTargetArea && <span className="font-bold text-amber-800">↗ weiter weg</span>}
              {movingCloser && !inTargetArea && <span className="font-bold text-green-800">↘ näher</span>}
              {compassPermissionNeeded && !compassPermissionGranted && (
                <button
                  type="button"
                  onClick={() => void enableCompass()}
                  className="rounded bg-blue-100 px-1.5 py-0.5 font-bold text-blue-900"
                  aria-label="Handykompass für die Navigation freigeben"
                  title="Optional: Kompass aktivieren"
                >🧭 Kompass</button>
              )}
              {compassHint && <span>{compassHint}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Navigation schließen"
            title="Navigation schließen"
            className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/95 text-2xl font-bold text-gray-900 shadow-md backdrop-blur"
          >
            ×
          </button>
        </div>

        {((geoError && !(sharingEnabled && ownSharedPosition)) || locationError) && (
          <div className="pointer-events-none absolute left-3 right-3 top-[96px] z-[500]">
            <div className="max-w-sm rounded-lg bg-red-50/95 px-3 py-2 text-xs font-medium text-red-900 shadow">
              {(geoError && !(sharingEnabled && ownSharedPosition) ? geoError : null) || locationError}
            </div>
          </div>
        )}

        {/* Die Legende ist standardmaessig zugeklappt. Helfermarker bleiben sichtbar. */}
        <div className="absolute bottom-[94px] left-3 z-[500] max-w-[min(320px,72vw)]">
          {showTeamLegend && (
            <div className="mb-2 max-h-[38vh] overflow-y-auto rounded-xl bg-white/95 p-3 text-xs shadow-lg backdrop-blur">
              <div className="mb-2 font-bold text-gray-950">Dein Team</div>
              {members.length === 0 ? (
                <div className="text-gray-600">Warte auf Teamdaten ...</div>
              ) : (
                <div className="space-y-2">
                  {members.map((member) => (
                    <div key={member.userId} className="flex items-center gap-2 text-gray-900">
                      <span
                        className="inline-flex min-w-9 justify-center rounded-lg px-1 py-1 font-extrabold text-white"
                        style={{ backgroundColor: member.markerColor }}
                      >
                        {member.markerCode}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {member.name}{member.userId === myUserId ? " (du)" : ""}
                      </span>
                      <span className="whitespace-nowrap text-[10px] text-gray-600">
                        {member.latitude == null ? "kein GPS" : member.stale ? "veraltet" : "live"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowTeamLegend((value) => !value)}
            aria-expanded={showTeamLegend}
            className="flex h-11 items-center gap-2 rounded-xl bg-white/95 px-3 text-sm font-bold text-gray-950 shadow-lg backdrop-blur"
          >
            <span aria-hidden="true">◉</span>
            Team ({members.length})
            <span className="text-xs text-gray-500">{showTeamLegend ? "▼" : "▲"}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setFollowMe(true)}
          disabled={!current}
          aria-label="Karte auf eigenen Standort zentrieren"
          title="Zu mir"
          className={`absolute bottom-[94px] right-3 z-[500] flex h-12 items-center justify-center gap-1 rounded-xl px-3 text-sm font-bold shadow-lg backdrop-blur disabled:opacity-50 ${
            followMe ? "bg-blue-600/95 text-white" : "bg-white/95 text-gray-950"
          }`}
        >
          <span aria-hidden="true" className="text-xl">⌖</span>
          <span>Zu mir</span>
        </button>

        {(completed || occupied) && (
          <div className="pointer-events-none absolute bottom-[160px] left-3 right-3 z-[500] flex justify-center">
            <div className="max-w-sm rounded-xl border border-amber-200 bg-white/95 px-4 py-2 text-center text-sm font-bold text-gray-900 shadow-lg">
              {completed
                ? `PinPoint erledigt${sharedPinpoint?.totals ? ` · ${sharedPinpoint.totals.rehkitzeGesichert} Rehkitze gesichert` : ""}`
                : `${sharedPinpoint?.claimedByName || "Ein Teammitglied"} erfasst gerade die Wilddaten.`}
            </div>
          </div>
        )}

        {/* Ein grosser Knopf bleibt beim Laufen gut bedienbar. */}
        <div
          className="absolute inset-x-0 bottom-0 z-[500] bg-white/95 px-3 pt-2 shadow-xl backdrop-blur"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={onReached}
            disabled={claiming || completed || occupied}
            className="min-h-14 w-full rounded-xl bg-green-700 px-4 py-3 text-base font-extrabold text-white disabled:bg-gray-500"
          >
            {claiming ? "Bearbeitung wird reserviert..." : completed ? "✓ PinPoint bereits erledigt" : occupied ? "Wilddatenerfassung läuft" : "✓ PinPoint erreicht"}
          </button>
        </div>
      </div>
    </div>
  );
}