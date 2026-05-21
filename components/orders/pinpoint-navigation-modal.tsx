"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Pinpoint } from "@/components/orders/order-field-map";

type Props = {
  open: boolean;
  pinpoint: Pinpoint;
  onClose: () => void;
  onReached: () => void;
};

type CurrentPosition = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

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

function FitNavigationMap({
  current,
  pinpoint,
}: {
  current: CurrentPosition | null;
  pinpoint: Pinpoint;
}) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds([]);

    bounds.extend([pinpoint.latitude, pinpoint.longitude]);

    if (current) {
      bounds.extend([current.latitude, current.longitude]);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [70, 70],
        maxZoom: 19,
      });
    }
  }, [map, current, pinpoint]);

  return null;
}

function FollowCurrentPosition({
  current,
  enabled,
}: {
  current: CurrentPosition | null;
  enabled: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !current) return;

    map.setView([current.latitude, current.longitude], Math.max(map.getZoom(), 18), {
      animate: true,
    });
  }, [map, current, enabled]);

  return null;
}

export default function PinpointNavigationModal({
  open,
  pinpoint,
  onClose,
  onReached,
}: Props) {
  const [current, setCurrent] = useState<CurrentPosition | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [followMe, setFollowMe] = useState(true);

  useEffect(() => {
    if (!open) return;

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
        setCurrent({
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
  }, [open]);

  const distance = useMemo(() => {
    if (!current) return null;

    return distanceMeters(current, {
      latitude: pinpoint.latitude,
      longitude: pinpoint.longitude,
    });
  }, [current, pinpoint]);

  const closeEnough = distance != null && distance <= 20;

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

          <TileLayer
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
            attribution="Labels © Esri"
            maxZoom={20}
            pane="overlayPane"
          />

          <TileLayer
            url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            attribution="Labels © Esri"
            maxZoom={20}
            pane="overlayPane"
          />

          <FitNavigationMap current={current} pinpoint={pinpoint} />
          <FollowCurrentPosition current={current} enabled={followMe} />

          {current && (
            <CircleMarker
              center={[current.latitude, current.longitude]}
              radius={10}
              pathOptions={{
                color: "#2563eb",
                weight: 4,
                fillColor: "#60a5fa",
                fillOpacity: 0.95,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">Dein Standort</div>
                  {current.accuracy != null && (
                    <div>Genauigkeit: ±{Math.round(current.accuracy)} m</div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          )}

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
                weight: 5,
                opacity: 0.9,
              }}
            />
          )}
        </MapContainer>

        <div className="absolute left-3 right-3 top-3 z-[500] rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold text-gray-900">
                PinPoint {pinpoint.sequenceNumber}
              </div>

              <div className="mt-1 text-sm text-gray-700">
                Entfernung:{" "}
                <span className="font-bold text-gray-950">
                  {formatDistance(distance)}
                </span>
              </div>

              <div className="mt-1 text-xs text-gray-600">
                GPS:{" "}
                {current?.accuracy != null
                  ? `±${Math.round(current.accuracy)} m`
                  : "warte auf Standort"}
              </div>

              {closeEnough && (
                <div className="mt-2 rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">
                  Du bist nahe am PinPoint.
                </div>
              )}

              {geoError && (
                <div className="mt-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
                  {geoError}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
            >
              Schließen
            </button>
          </div>
        </div>

        <div className="absolute bottom-3 left-3 right-3 z-[500] rounded-2xl bg-white/95 p-3 shadow-xl backdrop-blur">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFollowMe((prev) => !prev)}
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-900"
            >
              {followMe ? "Standort folgen aus" : "Standort folgen"}
            </button>

            <button
              type="button"
              onClick={onReached}
              className={`rounded-xl px-4 py-3 text-sm font-bold text-white ${
                closeEnough ? "bg-green-700" : "bg-black"
              }`}
            >
              PinPoint erreicht
            </button>
          </div>

          <div className="mt-2 text-center text-xs text-gray-600">
            {watching
              ? "Live-Standort aktiv"
              : "Standort wird nicht live aktualisiert"}
          </div>
        </div>
      </div>
    </div>
  );
}