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

type MyField = {
  orderId: string;
  orderCode?: string | null;
  title: string;
  executionDate?: string | null;
  mowingDate?: string | null;
  field: {
    id: string;
    name: string;
    displayName?: string | null;
    areaGeoJson: GeoJSON.Feature<GeoJSON.Polygon>;
    locationLatitude?: number | null;
    locationLongitude?: number | null;
  };
  owner: {
    firstName: string;
    lastName: string;
  };
};

type PreparedPolygon = {
  item: MyField;
  positions: [number, number][];
};

type Props = {
  items: MyField[];
};

function getFieldLabel(item: MyField) {
  const displayName = (item.field.displayName || "").trim();
  const name = (item.field.name || "").trim();

  if (displayName && name) return `${displayName} (${name})`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

export default function PersonalStatisticsMap({ items }: Props) {
  const polygons = useMemo(() => {
    return items
      .map((item) => {
        try {
          const geometry = item.field.areaGeoJson?.geometry;

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

          return {
            item,
            positions,
          };
        } catch (error) {
          console.error("Fehler bei Statistik-Fläche:", item.orderId, error);
          return null;
        }
      })
      .filter(Boolean) as PreparedPolygon[];
  }, [items]);

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

      {polygons.map(({ item, positions }) => (
        <Polygon
          key={`${item.orderId}-${item.field.id}`}
          positions={positions}
          pathOptions={{
            color: "#2563eb",
            weight: 3,
            fillColor: "#2563eb",
            fillOpacity: 0.35,
          }}
        >
          <Tooltip direction="center" className="field-map-label">
            {getFieldLabel(item)}
          </Tooltip>

          <Popup>
            <div className="min-w-[230px] space-y-2">
              <div className="text-base font-semibold">
                {getFieldLabel(item)}
              </div>

              <div className="space-y-1 text-sm text-gray-700">
                <div>
                  <b>Auftrag:</b> {item.orderCode || item.title}
                </div>

                <div>
                  <b>Datum:</b>{" "}
                  {formatDate(item.executionDate || item.mowingDate)}
                </div>

                <div>
                  <b>Ansprechpartner:</b> {item.owner.firstName}{" "}
                  {item.owner.lastName}
                </div>

                {item.field.locationLatitude != null &&
                  item.field.locationLongitude != null && (
                    <div>
                      <b>Treffpunkt:</b> vorhanden
                    </div>
                  )}
              </div>
            </div>
          </Popup>
        </Polygon>
      ))}
    </MapContainer>
  );
}