"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";

type FieldEditorValue = {
  polygon: GeoJSON.Feature<GeoJSON.Polygon> | null;
  location: { lat: number; lng: number } | null;
};

type Props = {
  value?: FieldEditorValue;
  onChange: (data: FieldEditorValue) => void;
};

const DEFAULT_CENTER: L.LatLngExpression = [53.3995, 10.0450]; // Seevetal
const DEFAULT_ZOOM = 13;
const TAP_MOVE_THRESHOLD = 12;
const IGNORE_CLICK_AFTER_TOUCH_MS = 700;

export default function FieldEditor({ value, onChange }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const polylineRef = useRef<L.Polyline | null>(null);
  const polygonLayerRef = useRef<L.Polygon | null>(null);
  const locationMarkerRef = useRef<L.Marker | null>(null);

  const pointsRef = useRef<L.LatLng[]>([]);
  const isApplyingValueRef = useRef(false);

  const onChangeRef = useRef(onChange);
  const drawingRef = useRef(false);
  const isPlacingLocationRef = useRef(false);
  const lastTouchActionAtRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = useRef(false);

  const applyValueRef = useRef<(nextValue?: FieldEditorValue) => void>(() => {});

  const [drawing, setDrawing] = useState(false);
  const [isPlacingLocation, setIsPlacingLocation] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);

  useEffect(() => {
    isPlacingLocationRef.current = isPlacingLocation;
  }, [isPlacingLocation]);

  function createLocationIcon() {
    return L.divIcon({
      className: "",
      html: `
        <div style="
          width: 26px;
          height: 26px;
          background: #dc2626;
          border: 3px solid white;
          border-radius: 9999px;
          box-shadow: 0 0 12px rgba(0,0,0,0.65);
        "></div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  function latLngsToGeoJson(latlngs: L.LatLng[]): GeoJSON.Feature<GeoJSON.Polygon> | null {
    if (latlngs.length < 3) return null;

    const ring: number[][] = latlngs.map((p) => [p.lng, p.lat]);
    ring.push([latlngs[0].lng, latlngs[0].lat]);

    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [ring],
      },
    };
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    mapRef.current = map;

    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Tiles © Esri",
        maxZoom: 20,
      }
    );

    const osm = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution: "© OpenStreetMap-Mitwirkende",
        maxZoom: 20,
      }
    );

    const transportation = L.tileLayer(
      "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Transportation © Esri",
        maxZoom: 20,
        pane: "overlayPane",
      }
    );

    const boundariesAndPlaces = L.tileLayer(
      "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: "Labels © Esri",
        maxZoom: 20,
        pane: "overlayPane",
      }
    );

    satellite.addTo(map);
    transportation.addTo(map);
    boundariesAndPlaces.addTo(map);

    L.control
      .layers(
        {
          Satellit: satellite,
          Straßenkarte: osm,
        },
        {}
      )
      .addTo(map);

    map.on("baselayerchange", () => {
      transportation.addTo(map);
      boundariesAndPlaces.addTo(map);
    });

    function redrawGeometry() {
      if (!mapRef.current) return;

      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }

      if (polygonLayerRef.current) {
        polygonLayerRef.current.remove();
        polygonLayerRef.current = null;
      }

      if (pointsRef.current.length >= 2) {
        polylineRef.current = L.polyline(pointsRef.current, {
          color: "#2563eb",
          weight: 4,
        }).addTo(mapRef.current);
      }

      if (pointsRef.current.length >= 3) {
        polygonLayerRef.current = L.polygon(pointsRef.current, {
          color: "#16a34a",
          weight: 4,
          fillOpacity: 0.22,
        }).addTo(mapRef.current);
      }
    }

    function setLocationMarker(latlng: L.LatLng, shouldTrigger = true) {
      if (!mapRef.current) return;

      if (locationMarkerRef.current) {
        locationMarkerRef.current.remove();
      }

      const marker = L.marker(latlng, {
        draggable: true,
        icon: createLocationIcon(),
      }).addTo(mapRef.current);

      marker.bindPopup("Treffpunkt");

      marker.on("dragend", () => {
        triggerChange();
      });

      locationMarkerRef.current = marker;

      if (shouldTrigger) {
        triggerChange();
      }
    }

    function clearGeometry() {
      pointsRef.current = [];

      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }

      if (polygonLayerRef.current) {
        polygonLayerRef.current.remove();
        polygonLayerRef.current = null;
      }
    }

    function fitToContent() {
      if (!mapRef.current) return;

      const bounds = L.latLngBounds([]);

      if (pointsRef.current.length > 0) {
        pointsRef.current.forEach((p) => bounds.extend(p));
      }

      if (locationMarkerRef.current) {
        bounds.extend(locationMarkerRef.current.getLatLng());
      }

      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [30, 30] });
      }
    }

    function triggerChange() {
      if (isApplyingValueRef.current) return;

      const polygon = latLngsToGeoJson(pointsRef.current);
      const location = locationMarkerRef.current
        ? {
            lat: locationMarkerRef.current.getLatLng().lat,
            lng: locationMarkerRef.current.getLatLng().lng,
          }
        : null;

      onChangeRef.current({
        polygon,
        location,
      });
    }

    function applyValue(nextValue?: FieldEditorValue) {
      isApplyingValueRef.current = true;

      clearGeometry();

      if (locationMarkerRef.current) {
        locationMarkerRef.current.remove();
        locationMarkerRef.current = null;
      }

      if (nextValue?.polygon?.geometry?.type === "Polygon") {
        const coords = nextValue.polygon.geometry.coordinates?.[0] || [];

        const withoutClosingPoint =
          coords.length > 1 &&
          coords[0][0] === coords[coords.length - 1][0] &&
          coords[0][1] === coords[coords.length - 1][1]
            ? coords.slice(0, -1)
            : coords;

        pointsRef.current = withoutClosingPoint.map(
          ([lng, lat]) => L.latLng(lat, lng)
        );

        redrawGeometry();
      }

      if (nextValue?.location) {
        setLocationMarker(
          L.latLng(nextValue.location.lat, nextValue.location.lng),
          false
        );
      }

      if (nextValue?.polygon || nextValue?.location) {
        fitToContent();
      } else if (mapRef.current) {
        mapRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      }

      isApplyingValueRef.current = false;
    }

    function addPoint(latlng: L.LatLng) {
      pointsRef.current.push(latlng);
      redrawGeometry();
      triggerChange();
    }

    function handleTap(latlng: L.LatLng) {
      if (isApplyingValueRef.current) return;

      if (isPlacingLocationRef.current) {
        setLocationMarker(latlng, true);
        setIsPlacingLocation(false);
        return;
      }

      if (!drawingRef.current) return;

      addPoint(latlng);
    }

    applyValueRef.current = applyValue;

    map.on("click", (e: L.LeafletMouseEvent) => {
      const now = Date.now();
      if (now - lastTouchActionAtRef.current < IGNORE_CLICK_AFTER_TOUCH_MS) {
        return;
      }
      handleTap(e.latlng);
    });

    const container = map.getContainer();

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        touchStartRef.current = null;
        touchMovedRef.current = true;
        return;
      }

      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
      touchMovedRef.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartRef.current.x);
      const dy = Math.abs(touch.clientY - touchStartRef.current.y);

      if (dx > TAP_MOVE_THRESHOLD || dy > TAP_MOVE_THRESHOLD) {
        touchMovedRef.current = true;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      const isTap = !touchMovedRef.current;
      touchStartRef.current = null;

      if (!isTap) return;

      const changedTouch = e.changedTouches[0];
      if (!changedTouch || !mapRef.current) return;

      const rect = container.getBoundingClientRect();
      const containerPoint = L.point(
        changedTouch.clientX - rect.left,
        changedTouch.clientY - rect.top
      );
      const latlng = mapRef.current.containerPointToLatLng(containerPoint);

      lastTouchActionAtRef.current = Date.now();
      handleTap(latlng);
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("touchend", onTouchEnd, { passive: true });

    setTimeout(() => {
      map.invalidateSize();
      applyValue(value);
    }, 200);

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    applyValueRef.current(value);
  }, [value]);

  function startDrawing() {
    setIsPlacingLocation(false);
    setDrawing(true);
  }

  function stopDrawing() {
    setDrawing(false);
  }

  function toggleLocationMode() {
    setDrawing(false);
    setIsPlacingLocation((prev) => !prev);
  }

  function undoLastPoint() {
    if (pointsRef.current.length === 0) return;

    pointsRef.current.pop();

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    if (polygonLayerRef.current) {
      polygonLayerRef.current.remove();
      polygonLayerRef.current = null;
    }

    if (mapRef.current) {
      if (pointsRef.current.length >= 2) {
        polylineRef.current = L.polyline(pointsRef.current, {
          color: "#2563eb",
          weight: 4,
        }).addTo(mapRef.current);
      }

      if (pointsRef.current.length >= 3) {
        polygonLayerRef.current = L.polygon(pointsRef.current, {
          color: "#16a34a",
          weight: 4,
          fillOpacity: 0.22,
        }).addTo(mapRef.current);
      }
    }

    const polygon = latLngsToGeoJson(pointsRef.current);
    const location = locationMarkerRef.current
      ? {
          lat: locationMarkerRef.current.getLatLng().lat,
          lng: locationMarkerRef.current.getLatLng().lng,
        }
      : null;

    onChangeRef.current({
      polygon,
      location,
    });
  }

  function resetDrawing() {
    pointsRef.current = [];

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    if (polygonLayerRef.current) {
      polygonLayerRef.current.remove();
      polygonLayerRef.current = null;
    }

    if (locationMarkerRef.current) {
      locationMarkerRef.current.remove();
      locationMarkerRef.current = null;
    }

    setDrawing(false);
    setIsPlacingLocation(false);

    onChangeRef.current({
      polygon: null,
      location: null,
    });
  }

  function recenterToDefaultArea() {
    if (!mapRef.current) return;
    mapRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  }

  const statusText = isPlacingLocation
    ? "Treffpunkt-Modus aktiv: Tippe auf die Karte."
    : drawing
    ? "Zeichenmodus aktiv: Tippe für neue Punkte. Wischen bewegt die Karte."
    : "Kein aktiver Modus. Wähle Zeichnen oder Treffpunkt setzen.";

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
        {statusText}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={startDrawing}
          className={`rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm ${
            drawing
              ? "bg-black text-white"
              : "border border-gray-300 bg-white text-gray-900"
          }`}
        >
          Fläche zeichnen
        </button>

        <button
          type="button"
          onClick={stopDrawing}
          className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm"
        >
          Zeichnen beenden
        </button>

        <button
          type="button"
          onClick={toggleLocationMode}
          className={`rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm ${
            isPlacingLocation
              ? "bg-red-600 text-white"
              : "border border-red-300 bg-white text-red-700"
          }`}
        >
          {isPlacingLocation ? "Treffpunkt: aktiv" : "Treffpunkt setzen"}
        </button>

        <button
          type="button"
          onClick={undoLastPoint}
          className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm"
        >
          Letzten Punkt löschen
        </button>

        <button
          type="button"
          onClick={resetDrawing}
          className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm"
        >
          Alles zurücksetzen
        </button>

        <button
          type="button"
          onClick={recenterToDefaultArea}
          className="rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm"
        >
          Auf Seevetal zentrieren
        </button>
      </div>

      <div
        ref={containerRef}
        className="h-[500px] w-full rounded-xl border"
      />
    </div>
  );
}