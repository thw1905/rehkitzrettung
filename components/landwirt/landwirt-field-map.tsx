"use client";

import { useEffect, useMemo } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type AreaFeature =
  | GeoJSON.Feature<GeoJSON.Polygon>
  | GeoJSON.Feature<GeoJSON.MultiPolygon>;

type FieldItem = {
  id: string;
  name: string;
  displayName?: string | null;
  notes?: string | null;
  areaGeoJson: AreaFeature;
  areaHa: number;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationNote?: string | null;
};

type PreparedPolygon = {
  id: string;
  label: string;
  rings: [number, number][][];
};

type Props = {
  fields: FieldItem[];
  selectedFieldIds: string[];
  onToggleField: (fieldId: string) => void;
};

function getFieldLabel(field: Pick<FieldItem, "displayName" | "name">) {
  const displayName = (field.displayName || "").trim();
  const name = (field.name || "").trim();

  if (displayName && name) return `${displayName} · ${name}`;
  if (displayName) return displayName;
  if (name) return name;
  return "Unbekannte Fläche";
}

function getShortFieldLabel(field: Pick<FieldItem, "displayName" | "name">) {
  return (field.displayName || field.name || "Fläche").trim();
}

function formatHa(value: number) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function ringToPositions(ring: unknown): [number, number][] {
  if (!Array.isArray(ring)) return [];

  return ring
    .map((coord) => {
      if (!Array.isArray(coord) || coord.length < 2) return null;

      const [lng, lat] = coord;

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return [lat, lng] as [number, number];
    })
    .filter(Boolean) as [number, number][];
}

function areaFeatureToRings(feature?: AreaFeature | null): [number, number][][] {
  try {
    if (!feature?.geometry) return [];

    if (feature.geometry.type === "Polygon") {
      const outerRing = feature.geometry.coordinates?.[0];
      const positions = ringToPositions(outerRing);
      return positions.length >= 3 ? [positions] : [];
    }

    if (feature.geometry.type === "MultiPolygon") {
      return (feature.geometry.coordinates || [])
        .map((polygonCoords) => ringToPositions(polygonCoords?.[0]))
        .filter((positions) => positions.length >= 3);
    }

    return [];
  } catch {
    return [];
  }
}

function getCenterFromRings(rings: [number, number][][]): [number, number] | null {
  const bounds = L.latLngBounds([]);

  for (const ring of rings) {
    for (const pos of ring) {
      bounds.extend(pos);
    }
  }

  if (!bounds.isValid()) return null;

  const center = bounds.getCenter();
  return [center.lat, center.lng];
}

function createSelectedFieldLabelIcon(label: string) {
  const safeLabel = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return L.divIcon({
    className: "landwirt-field-label-icon",
    html: `
      <div style="
        min-width: 72px;
        max-width: 130px;
        border-radius: 9999px;
        background: rgba(22,163,74,0.96);
        border: 2px solid #ffffff;
        color: #ffffff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        padding: 5px 9px;
        font-size: 13px;
        font-weight: 900;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      ">
        ${safeLabel}
      </div>
    `,
    iconSize: [130, 30],
    iconAnchor: [65, 15],
  });
}

function FitMapToData({
  fieldPolygons,
  fields,
}: {
  fieldPolygons: PreparedPolygon[];
  fields: FieldItem[];
}) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds([]);

    for (const polygon of fieldPolygons) {
      for (const ring of polygon.rings) {
        for (const pos of ring) {
          bounds.extend(pos);
        }
      }
    }

    for (const field of fields) {
      if (
        typeof field.locationLatitude === "number" &&
        typeof field.locationLongitude === "number"
      ) {
        bounds.extend([field.locationLatitude, field.locationLongitude]);
      }
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  }, [map, fieldPolygons, fields]);

  return null;
}

export default function LandwirtFieldMap({
  fields,
  selectedFieldIds,
  onToggleField,
}: Props) {
  const selectedSet = useMemo(
    () => new Set(selectedFieldIds),
    [selectedFieldIds]
  );

  const fieldPolygons = useMemo(
    () =>
      fields
        .map((field) => ({
          id: field.id,
          label: field.displayName || field.name || "Fläche",
          rings: areaFeatureToRings(field.areaGeoJson),
        }))
        .filter((field) => field.rings.length > 0),
    [fields]
  );

  const defaultCenter: [number, number] =
    fieldPolygons[0]
      ? getCenterFromRings(fieldPolygons[0].rings) || [53.36, 9.99]
      : [53.36, 9.99];

  const mapKey = `landwirt-map-${fields.length}`;

  return (
    <MapContainer
      key={mapKey}
      className="h-full w-full"
      center={defaultCenter}
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
        attribution="Transportation © Esri"
        maxZoom={20}
        pane="overlayPane"
      />
      <TileLayer
        url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        attribution="Labels © Esri"
        maxZoom={20}
        pane="overlayPane"
      />

      <FitMapToData fieldPolygons={fieldPolygons} fields={fields} />

      {fieldPolygons.map((fieldPolygon) => {
        const field = fields.find((item) => item.id === fieldPolygon.id);
        if (!field) return null;

        const selected = selectedSet.has(field.id);
        const center = getCenterFromRings(fieldPolygon.rings);

        return (
          <div key={fieldPolygon.id}>
            {fieldPolygon.rings.map((positions, index) => (
              <Polygon
                key={`${fieldPolygon.id}-ring-${index}`}
                positions={positions}
                pathOptions={{
                  color: selected ? "#16a34a" : "#f97316",
                  weight: selected ? 5 : 3,
                  fillColor: selected ? "#22c55e" : "#fb923c",
                  fillOpacity: selected ? 0.38 : 0.18,
                }}
                eventHandlers={{
                  click: () => onToggleField(field.id),
                }}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-bold">{getFieldLabel(field)}</div>
                    <div className="mt-1">
                      Fläche: {formatHa(field.areaHa)} ha
                    </div>
                    {field.locationNote ? (
                      <div className="mt-1">
                        Treffpunkt: {field.locationNote}
                      </div>
                    ) : null}
                    {field.notes ? (
                      <div className="mt-1 text-gray-700">
                        Notiz: {field.notes}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onToggleField(field.id)}
                      className="mt-2 rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold"
                    >
                      {selected ? "Auswahl entfernen" : "Fläche auswählen"}
                    </button>
                  </div>
                </Popup>
              </Polygon>
            ))}

            {selected && center ? (
              <Marker
                position={center}
                icon={createSelectedFieldLabelIcon(getShortFieldLabel(field))}
                eventHandlers={{
                  click: () => onToggleField(field.id),
                }}
              />
            ) : null}
          </div>
        );
      })}

      {fields.map((field) => {
        if (
          typeof field.locationLatitude !== "number" ||
          typeof field.locationLongitude !== "number"
        ) {
          return null;
        }

        return (
          <CircleMarker
            key={`${field.id}-meeting-point`}
            center={[field.locationLatitude, field.locationLongitude]}
            radius={7}
            pathOptions={{
              color: "#111827",
              weight: 2,
              fillColor: "#22c55e",
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-bold">Treffpunkt</div>
                <div>{getFieldLabel(field)}</div>
                {field.locationNote ? (
                  <div className="mt-1 text-gray-700">
                    {field.locationNote}
                  </div>
                ) : null}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}