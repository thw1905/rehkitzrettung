"use client";

import { useMemo } from "react";
import {
  MapContainer,
  Polygon,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type FieldItem = {
  id: string;
  name: string;
  displayName?: string | null;
  areaGeoJson: GeoJSON.Feature<GeoJSON.Polygon>;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationNote?: string | null;
};

type PreparedPolygon = {
  field: FieldItem;
  positions: [number, number][];
};

type Props = {
  fields: FieldItem[];
  selectedFieldIds: string[];
  onToggleField: (fieldId: string) => void;
};

function getFieldLabel(field: FieldItem) {
  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} (${name})`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function FitMapToFields({ polygons }: { polygons: PreparedPolygon[] }) {
  const map = useMap();

  useMemo(() => {
    const bounds = L.latLngBounds([]);

    for (const polygon of polygons) {
      for (const pos of polygon.positions) {
        bounds.extend(pos);
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds as LatLngBoundsExpression, {
        padding: [30, 30],
      });
    }
  }, [map, polygons]);

  return null;
}

export default function FieldOrderMapLeaflet({
  fields,
  selectedFieldIds,
  onToggleField,
}: Props) {
  const selectedSet = useMemo(
    () => new Set(selectedFieldIds),
    [selectedFieldIds]
  );

  const polygons = useMemo(() => {
    return fields
      .map((field) => {
        try {
          const geometry = field.areaGeoJson?.geometry;

          if (!geometry || geometry.type !== "Polygon") {
            return null;
          }

          const ring = geometry.coordinates?.[0];

          if (!Array.isArray(ring) || ring.length < 3) {
            return null;
          }

          const positions: [number, number][] = ring
            .map((coord) => {
              if (!Array.isArray(coord) || coord.length < 2) {
                return null;
              }

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

          return { field, positions };
        } catch (error) {
          console.error("Fehler bei Fläche:", field.id, error);
          return null;
        }
      })
      .filter(Boolean) as PreparedPolygon[];
  }, [fields]);

  function getColor(fieldId: string) {
    return selectedSet.has(fieldId) ? "#2563eb" : "#16a34a";
  }

  function getFillOpacity(fieldId: string) {
    return selectedSet.has(fieldId) ? 0.55 : 0.25;
  }

  return (
    <MapContainer
      className="h-full w-full"
      center={[53.36, 9.99]}
      zoom={13}
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

      <FitMapToFields polygons={polygons} />

      {polygons.map(({ field, positions }) => {
        const selected = selectedSet.has(field.id);

        return (
          <Polygon
            key={field.id}
            positions={positions}
            pathOptions={{
              color: getColor(field.id),
              weight: selected ? 5 : 3,
              fillColor: getColor(field.id),
              fillOpacity: getFillOpacity(field.id),
            }}
            eventHandlers={{
              click: () => onToggleField(field.id),
            }}
          >
            <Tooltip
              direction="center"
              className="field-map-label"
            >
              {getFieldLabel(field)}
            </Tooltip>

            <Popup>
              <div className="min-w-[220px] space-y-2">
                <div className="text-base font-semibold">
                  {getFieldLabel(field)}
                </div>

                {field.locationLatitude != null &&
                  field.locationLongitude != null && (
                    <div className="text-sm text-gray-700">
                      Treffpunkt vorhanden
                    </div>
                  )}

                {field.locationNote && (
                  <div className="text-xs text-gray-500">
                    {field.locationNote}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onToggleField(field.id)}
                  className={`w-full rounded-xl px-3 py-2 text-sm font-semibold text-white ${
                    selected ? "bg-red-600" : "bg-blue-600"
                  }`}
                >
                  {selected ? "Auswahl entfernen" : "Fläche auswählen"}
                </button>
              </div>
            </Popup>
          </Polygon>
        );
      })}
    </MapContainer>
  );
}