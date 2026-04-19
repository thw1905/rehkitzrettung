"use client";

import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type Pinpoint = {
  id: string;
  latitude: number;
  longitude: number;
  sequenceNumber: number;
  status: "OFFEN" | "ERREICHT" | "ERLEDIGT";
  rawQrText?: string |null;
  scannedAt?: string | null;
  reachedAt?: string | null;
  rehkitzeGesichert?: number;
  rehkitzeAbgesprungen?: number;
  sonstigesWildGesichert?: number;
  sonstigesWildAbgesprungen?: number;
  maulwurfhuegelFehlstelle?: number;
  note?: string | null;
};

type Props = {
  areaGeoJson: GeoJSON.Feature<GeoJSON.Polygon>;
  pinpoints?: Pinpoint[];
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationNote?: string | null;
  heightClassName?: string;
  onPinpointClick?: (pinpoint: Pinpoint) => void;
};

type PreparedPolygon = {
  positions: [number, number][];
};

function getPinColor(status?: Pinpoint["status"]) {
  if (status === "ERLEDIGT") return "#16a34a";
  if (status === "ERREICHT") return "#eab308";
  return "#dc2626";
}

function FitMapToData({
  polygon,
  pinpoints,
  locationLatitude,
  locationLongitude,
}: {
  polygon: PreparedPolygon | null;
  pinpoints: Pinpoint[];
  locationLatitude?: number | null;
  locationLongitude?: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds([]);

    if (polygon) {
      for (const pos of polygon.positions) {
        bounds.extend(pos);
      }
    }

    for (const pin of pinpoints) {
      if (Number.isFinite(pin.latitude) && Number.isFinite(pin.longitude)) {
        bounds.extend([pin.latitude, pin.longitude]);
      }
    }

    if (
      typeof locationLatitude === "number" &&
      typeof locationLongitude === "number"
    ) {
      bounds.extend([locationLatitude, locationLongitude]);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [30, 30],
      });
    }
  }, [map, polygon, pinpoints, locationLatitude, locationLongitude]);

  return null;
}

function CurrentLocationMarker() {
  const map = useMap();

  useEffect(() => {
    let marker: L.CircleMarker | null = null;

    function onLocationFound(e: L.LocationEvent) {
      if (marker) {
        map.removeLayer(marker);
      }

      marker = L.circleMarker(e.latlng, {
        radius: 8,
        weight: 3,
        color: "#2563eb",
        fillColor: "#60a5fa",
        fillOpacity: 0.95,
      });

      marker.addTo(map).bindPopup("Dein aktueller Standort");
    }

    function onLocationError(error: L.ErrorEvent) {
      console.warn("Standort konnte nicht ermittelt werden:", error.message);
    }

    map.on("locationfound", onLocationFound);
    map.on("locationerror", onLocationError);

    map.locate({
      setView: false,
      enableHighAccuracy: true,
      watch: false,
      maxZoom: 18,
    });

    return () => {
      map.off("locationfound", onLocationFound);
      map.off("locationerror", onLocationError);

      if (marker) {
        map.removeLayer(marker);
      }
    };
  }, [map]);

  return null;
}

function LocateMeControl() {
  const map = useMap();

  useEffect(() => {
    function locateMe() {
      if (!window.isSecureContext) {
        alert("Standort funktioniert nur über HTTPS oder localhost.");
        return;
      }

      if (!navigator.geolocation) {
        alert("Standort wird von diesem Gerät nicht unterstützt.");
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          map.setView([lat, lng], 17, {
            animate: true,
          });

          L.circleMarker([lat, lng], {
            radius: 9,
            weight: 3,
            color: "#2563eb",
            fillColor: "#60a5fa",
            fillOpacity: 0.95,
          })
            .addTo(map)
            .bindPopup("Dein aktueller Standort")
            .openPopup();
        },
        () => {
          alert("Standort konnte nicht ermittelt werden.");
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    }

    const control = new L.Control({ position: "topright" });

    control.onAdd = () => {
      const container = L.DomUtil.create("div");
      const button = L.DomUtil.create("button", "", container);

      button.type = "button";
      button.innerText = "Mein Standort";
      button.className =
        "rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow";

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      L.DomEvent.on(button, "click", () => {
        locateMe();
      });

      return container;
    };

    control.addTo(map);

    return () => {
      control.remove();
    };
  }, [map]);

  return null;
}

export default function OrderFieldMap({
  areaGeoJson,
  pinpoints = [],
  locationLatitude,
  locationLongitude,
  locationNote,
  heightClassName = "h-[420px] sm:h-[520px] md:h-[650px]",
  onPinpointClick,
}: Props) {
  const polygon = useMemo(() => {
    try {
      const geometry = areaGeoJson?.geometry;

      if (!geometry || geometry.type !== "Polygon") {
        return null;
      }

      const ring = geometry.coordinates?.[0];

      if (!Array.isArray(ring) || ring.length < 3) {
        return null;
      }

      const positions: [number, number][] = ring
        .map((coord) => {
          if (!Array.isArray(coord) || coord.length < 2) return null;

          const [lng, lat] = coord;

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null;
          }

          return [lat, lng] as [number, number];
        })
        .filter(Boolean) as [number, number][];

      if (positions.length < 3) {
        return null;
      }

      return { positions };
    } catch (error) {
      console.error("Fehler beim Aufbereiten der Fläche:", error);
      return null;
    }
  }, [areaGeoJson]);

  const defaultCenter: [number, number] =
    typeof locationLatitude === "number" &&
    typeof locationLongitude === "number"
      ? [locationLatitude, locationLongitude]
      : polygon?.positions?.[0] || [53.36, 9.99];

  const mapKey = useMemo(() => {
    const polygonKey = polygon?.positions?.length || 0;
    const pinKey = pinpoints.length;
    return `field-map-${polygonKey}-${pinKey}-${locationLatitude ?? "x"}-${locationLongitude ?? "y"}`;
  }, [polygon, pinpoints.length, locationLatitude, locationLongitude]);

  return (
    <div className={`w-full overflow-hidden rounded-2xl border ${heightClassName}`}>
      <MapContainer
        key={mapKey}
        className="h-full w-full"
        center={defaultCenter}
        zoom={16}
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

        <FitMapToData
          polygon={polygon}
          pinpoints={pinpoints}
          locationLatitude={locationLatitude}
          locationLongitude={locationLongitude}
        />

        <CurrentLocationMarker />
        <LocateMeControl />

        {polygon && (
          <Polygon
            positions={polygon.positions}
            pathOptions={{
              color: "#2563eb",
              weight: 3,
              fillColor: "#60a5fa",
              fillOpacity: 0.22,
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">Fläche</div>
                {locationNote ? (
                  <div className="mt-1 text-gray-700">{locationNote}</div>
                ) : null}
              </div>
            </Popup>
          </Polygon>
        )}

        {typeof locationLatitude === "number" &&
          typeof locationLongitude === "number" && (
            <CircleMarker
              center={[locationLatitude, locationLongitude]}
              radius={9}
              pathOptions={{
                color: "#111827",
                weight: 3,
                fillColor: "#f97316",
                fillOpacity: 0.95,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">Treffpunkt</div>
                  {locationNote ? (
                    <div className="mt-1 text-gray-700">{locationNote}</div>
                  ) : null}
                </div>
              </Popup>
            </CircleMarker>
          )}

        {pinpoints.map((pinpoint) => (
          <CircleMarker
            key={pinpoint.id}
            center={[pinpoint.latitude, pinpoint.longitude]}
            radius={7}
            pathOptions={{
              color: getPinColor(pinpoint.status),
              fillColor: getPinColor(pinpoint.status),
              fillOpacity: 0.9,
              weight: 2,
            }}
            eventHandlers={
              onPinpointClick
                ? {
                    click: () => onPinpointClick(pinpoint),
                  }
                : undefined
            }
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">
                  PinPoint
                  {typeof pinpoint.sequenceNumber === "number"
                    ? ` ${pinpoint.sequenceNumber}`
                    : ""}
                </div>
                {pinpoint.status ? (
                  <div className="mt-1">Status: {pinpoint.status}</div>
                ) : null}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}